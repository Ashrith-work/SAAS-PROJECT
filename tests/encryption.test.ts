import "dotenv/config";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6 — token encryption / security verification suite (see SECURITY.md).
// Covers the seven required cases:
//   1. encrypt → decrypt returns the original value
//   2. v1 ciphertext still decrypts after v2 is added (backward compat)
//   3. logging a SecretToken prints "[REDACTED]"
//   4. a token in an error message is redacted before reaching a logger
//   5. a tampered ciphertext fails decryption AND logs the failure
//   6. the rotation routine re-encrypts all tokens from v1 to v2
//   7. the Prisma strip extension removes encryptedToken from query results
// ─────────────────────────────────────────────────────────────────────────────

import {
  encryptToken,
  decryptToken,
  getCiphertextVersion,
  SecretToken,
} from "@/lib/encryption";
import { redactSecrets, redactValue, redactErrorMessage } from "@/lib/redact";
import { decryptWithAudit } from "@/lib/token-audit";
import { prisma } from "@/lib/prisma";
import { rotateAll } from "../scripts/rotate-encryption-keys";

const KEY_A = "11".repeat(32); // 64 hex chars = 32 bytes
const KEY_B = "22".repeat(32);
const PREFIX = "TEST_ENC_";
const SAMPLE_TOKEN = "EAAGm0xampleMetaAccessToken_1234567890abcdef";

// Env we mutate in the versioning/rotation tests — snapshot + restore each test.
const ENV_KEYS = [
  "ENCRYPTION_KEY_VERSION",
  "ENCRYPTION_KEY_V1",
  "ENCRYPTION_KEY_V2",
  "ENCRYPTION_KEY",
];
let envSnapshot: Record<string, string | undefined> = {};

let agencyId: string;
let hotelId: string;

beforeAll(async () => {
  envSnapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const agency = await prisma.agency.create({
    data: { name: `${PREFIX}A`, email: `${PREFIX.toLowerCase()}a@example.test` },
  });
  agencyId = agency.id;
  // MetaToken is hotel-scoped (@@unique([hotelClientId])) — these tests need a
  // hotel to attach the token to.
  const hotel = await prisma.hotelClient.create({
    data: {
      agencyId,
      name: `${PREFIX}Hotel`,
      websiteUrl: "https://example.com",
      contactName: "C",
      contactEmail: "c@test.local",
      siteId: `${PREFIX}site-${Date.now()}`,
      conversionMethod: "both",
    },
  });
  hotelId = hotel.id;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

afterAll(async () => {
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

// 1 ───────────────────────────────────────────────────────────────────────────
test("encrypt → decrypt returns the original value", () => {
  const cipher = encryptToken(SAMPLE_TOKEN);
  expect(cipher).not.toContain(SAMPLE_TOKEN);
  expect(decryptToken(cipher).reveal()).toBe(SAMPLE_TOKEN);
});

// 2 ───────────────────────────────────────────────────────────────────────────
test("v1 ciphertext still decrypts after v2 is added (backward compat)", () => {
  process.env.ENCRYPTION_KEY_V1 = KEY_A;
  process.env.ENCRYPTION_KEY_V2 = KEY_B;

  process.env.ENCRYPTION_KEY_VERSION = "v1";
  const c1 = encryptToken(SAMPLE_TOKEN);
  expect(getCiphertextVersion(c1)).toBe("v1");

  // Introduce v2 as the current version.
  process.env.ENCRYPTION_KEY_VERSION = "v2";
  const c2 = encryptToken(SAMPLE_TOKEN);
  expect(getCiphertextVersion(c2)).toBe("v2");

  // The OLD v1 ciphertext still decrypts (different key), and so does v2.
  expect(decryptToken(c1).reveal()).toBe(SAMPLE_TOKEN);
  expect(decryptToken(c2).reveal()).toBe(SAMPLE_TOKEN);
});

// 3 ───────────────────────────────────────────────────────────────────────────
test("logging a SecretToken prints [REDACTED], not the value", () => {
  const t = new SecretToken(SAMPLE_TOKEN);
  expect(String(t)).toBe("[REDACTED]");
  expect(`${t}`).toBe("[REDACTED]");
  expect(JSON.stringify(t)).toBe('"[REDACTED]"');
  expect(JSON.stringify({ token: t })).toBe('{"token":"[REDACTED]"}');
  // console.log path (util.inspect)
  expect(inspect({ token: t })).toContain("[REDACTED]");
  expect(inspect({ token: t })).not.toContain(SAMPLE_TOKEN);
  // explicit unwrap still works
  expect(t.reveal()).toBe(SAMPLE_TOKEN);
});

// 4 ───────────────────────────────────────────────────────────────────────────
test("a token in an error message is redacted before reaching a logger", () => {
  const token = "EAAGm0" + "abcdefghij".repeat(4); // matches the EAA pattern
  const msg = `Meta call failed: ${token}`;
  expect(redactSecrets(msg)).toContain("[REDACTED-TOKEN]");
  expect(redactSecrets(msg)).not.toContain(token);

  const cleaned = redactValue(new Error(msg)) as Error;
  expect(cleaned.message).toContain("[REDACTED-TOKEN]");
  expect(cleaned.message).not.toContain(token);

  expect(redactErrorMessage(new Error(msg))).not.toContain(token);
});

// 5 ───────────────────────────────────────────────────────────────────────────
test("a tampered ciphertext fails decryption AND logs the failure", async () => {
  const valid = encryptToken(SAMPLE_TOKEN);
  const [v, iv, tag, ct] = valid.split(":");
  // Flip a byte in the GCM auth tag — guarantees an integrity failure.
  const tagBuf = Buffer.from(tag, "base64");
  tagBuf[0] ^= 0xff;
  const tampered = [v, iv, tagBuf.toString("base64"), ct].join(":");

  expect(() => decryptToken(tampered)).toThrow();

  const before = await prisma.tokenAuditLog.count({
    where: { agencyId, action: "failed_decrypt", success: false },
  });
  await expect(
    decryptWithAudit(tampered, { agencyId, tokenType: "meta_ads", source: "test:encryption" }),
  ).rejects.toThrow();
  const after = await prisma.tokenAuditLog.count({
    where: { agencyId, action: "failed_decrypt", success: false },
  });
  expect(after).toBe(before + 1);
});

// 6 ───────────────────────────────────────────────────────────────────────────
test("the rotation routine re-encrypts all tokens from v1 to v2", async () => {
  process.env.ENCRYPTION_KEY_V1 = KEY_A;
  process.env.ENCRYPTION_KEY_V2 = KEY_B;
  process.env.ENCRYPTION_KEY_VERSION = "v1";

  // A token stored under v1.
  const mt = await prisma.metaToken.create({
    data: {
      agencyId,
      hotelClientId: hotelId,
      encryptedToken: encryptToken("rotate-me"),
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      status: "connected",
    },
  });

  // Make v2 current, then rotate this agency's secrets.
  process.env.ENCRYPTION_KEY_VERSION = "v2";
  const res = await rotateAll({ agencyId });
  expect(res.failed).toBe(0);
  expect(res.rotated).toBeGreaterThanOrEqual(1);

  // Read the stored ciphertext (raw, bypassing the strip) — now v2, same value.
  const rows = await prisma.$queryRawUnsafe<Array<{ ct: string }>>(
    'SELECT "encryptedToken" AS ct FROM "MetaToken" WHERE "id" = $1',
    mt.id,
  );
  expect(getCiphertextVersion(rows[0].ct)).toBe("v2");
  expect(decryptToken(rows[0].ct).reveal()).toBe("rotate-me");
});

// 7 ───────────────────────────────────────────────────────────────────────────
describe("the Prisma strip extension removes encryptedToken from results", () => {
  test("findFirst / findUnique never return the ciphertext, raw still can", async () => {
    // A dedicated hotel — MetaToken.hotelClientId is unique, so this test can't
    // reuse the hotel the rotation test already attached a token to.
    const stripHotel = await prisma.hotelClient.create({
      data: {
        agencyId,
        name: `${PREFIX}StripHotel`,
        websiteUrl: "https://example.com",
        contactName: "C",
        contactEmail: "c@test.local",
        siteId: `${PREFIX}strip-site-${Date.now()}`,
        conversionMethod: "both",
      },
    });
    const mt = await prisma.metaToken.create({
      data: {
        agencyId,
        hotelClientId: stripHotel.id,
        encryptedToken: encryptToken("strip-me"),
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
        status: "connected",
      },
    });

    const found = await prisma.metaToken.findFirst({ where: { id: mt.id } });
    expect(found).not.toBeNull();
    expect("encryptedToken" in (found as object)).toBe(false);

    // Even an explicit select can't surface it.
    const selected = await prisma.metaToken.findUnique({
      where: { id: mt.id },
      select: { id: true, encryptedToken: true },
    });
    expect("encryptedToken" in (selected as object)).toBe(false);

    // The out-of-band raw read (what getTokenForApiCall uses) still gets it.
    const raw = await prisma.$queryRawUnsafe<Array<{ ct: string }>>(
      'SELECT "encryptedToken" AS ct FROM "MetaToken" WHERE "id" = $1',
      mt.id,
    );
    expect(raw[0]?.ct).toBeTruthy();
  });
});
