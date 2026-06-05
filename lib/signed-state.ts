import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Compact HS256 JWT for the Instagram OAuth `state` parameter. Hand-rolled on
// node:crypto so no new dependency is needed — header.payload.signature, all
// base64url, signed with AUTH_SECRET. The state binds the OAuth round-trip to
// one (agency, hotel) pair and expires after 10 minutes, so a callback can
// never be replayed or redirected at another tenant's hotel.

const STATE_TTL_SECONDS = 10 * 60;

export type OauthStatePayload = {
  hotelClientId: string;
  agencyId: string;
};

type Claims = OauthStatePayload & { iat: number; exp: number; nonce: string };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured.");
  return s;
}

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64url");

function hmac(input: string): Buffer {
  return createHmac("sha256", secret()).update(input).digest();
}

/** Signs a 10-minute state token for the Instagram OAuth round-trip. */
export function signOauthState(payload: OauthStatePayload): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = {
    ...payload,
    iat: now,
    exp: now + STATE_TTL_SECONDS,
    nonce: randomBytes(8).toString("hex"),
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = b64url(hmac(`${header}.${body}`));
  return `${header}.${body}.${sig}`;
}

/**
 * Verifies a state token. Returns the payload, or null when the token is
 * malformed, tampered with, or expired. Never throws on bad input.
 */
export function verifyOauthState(state: string): OauthStatePayload | null {
  try {
    const parts = state.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;

    const expected = hmac(`${header}.${body}`);
    const given = Buffer.from(sig, "base64url");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }

    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<Claims>;
    if (typeof claims.hotelClientId !== "string" || typeof claims.agencyId !== "string") {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
      return null;
    }
    return { hotelClientId: claims.hotelClientId, agencyId: claims.agencyId };
  } catch {
    return null;
  }
}
