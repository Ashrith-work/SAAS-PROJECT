import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Symmetric encryption for secrets at rest — Meta access tokens, Instagram
// tokens, and GA service-account credentials (see CLAUDE.md: tokens are
// AES-256-GCM encrypted, never logged, never sent to the frontend). GCM gives
// both confidentiality and integrity (auth tag).
//
// ── LAYER 1: key versioning / rotation ───────────────────────────────────────
// New ciphertext is written in a VERSIONED format so keys can be rotated with
// no downtime:
//
//     v<n>:<ivBase64>:<authTagBase64>:<ciphertextBase64>
//
// • Each version's key lives in ENCRYPTION_KEY_V<n> (e.g. ENCRYPTION_KEY_V1).
// • The version used for NEW encryptions is ENCRYPTION_KEY_VERSION (default v1).
// • Decryption reads the version prefix and looks up the matching key, so old
//   ciphertext keeps decrypting after a new version is introduced.
//
// To rotate: add ENCRYPTION_KEY_V2, set ENCRYPTION_KEY_VERSION=v2 (keep V1 in
// place), run `npm run rotate:keys`, then retire V1 once every row is on v2.
//
// Backward compatibility: rows written by the pre-versioning code are stored as
// base64(iv + authTag + ciphertext) with NO prefix. decryptToken() still reads
// those, decrypting them with the v1 key (ENCRYPTION_KEY_V1, falling back to the
// legacy ENCRYPTION_KEY).

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // AES-256 -> 32-byte key
const IV_LENGTH = 12; // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit GCM authentication tag

// ── LAYER 3: types that keep secrets out of logs / serialization ─────────────
//
// Three distinct types so TypeScript (and the runtime) tell secrets apart:
//   • EncryptedToken — ciphertext at rest. A branded string: it IS a string
//     (so it stores/compares like one) but can't be confused with plain text.
//   • SecretToken    — a DECRYPTED token. A runtime class that redacts itself on
//     EVERY serialization path (toString / toJSON / console / template literals)
//     and yields the plaintext only via an explicit .reveal() at the point of use.
//   • string         — everything else (plain, non-secret).

declare const ENCRYPTED_BRAND: unique symbol;
export type EncryptedToken = string & { readonly [ENCRYPTED_BRAND]: "EncryptedToken" };

const REDACTED = "[REDACTED]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A decrypted secret. Holds the plaintext in a private field so it can never be
 * enumerated or serialized: console.log, JSON.stringify, String(), template
 * literals, and error-message interpolation all yield "[REDACTED]". Get the real
 * value ONLY by calling .reveal(), and only at the moment you hand it to the
 * external service that needs it.
 */
export class SecretToken {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The raw plaintext. Call this only at the point of use — never to log. */
  reveal(): string {
    return this.#value;
  }

  /** Length is safe to expose (validation/diagnostics) without leaking the value. */
  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // console.log / util.inspect in Node.
  [INSPECT](): string {
    return REDACTED;
  }
}

/** Type guard for SecretToken. */
export function isSecretToken(value: unknown): value is SecretToken {
  return value instanceof SecretToken;
}

function reveal(value: string | SecretToken): string {
  return value instanceof SecretToken ? value.reveal() : value;
}

/** The key version used for new encryptions. Validated to look like "v1". */
export function getCurrentKeyVersion(): string {
  const v = (process.env.ENCRYPTION_KEY_VERSION || "v1").trim().toLowerCase();
  if (!/^v\d+$/.test(v)) {
    throw new Error(
      `ENCRYPTION_KEY_VERSION must look like "v1", "v2", … (got "${v}").`,
    );
  }
  return v;
}

/**
 * Resolves the 32-byte key for a version from ENCRYPTION_KEY_V<n> (a 64-char hex
 * string). v1 falls back to the legacy ENCRYPTION_KEY so existing deployments
 * and already-stored ciphertext keep working without an env rename. Read lazily
 * so importing this module never throws — errors surface only on encrypt/decrypt.
 */
function getKeyForVersion(version: string): Buffer {
  const envName = `ENCRYPTION_KEY_${version.toUpperCase()}`; // ENCRYPTION_KEY_V1
  let hex = process.env[envName];
  if (!hex && version === "v1") hex = process.env.ENCRYPTION_KEY; // legacy fallback
  if (!hex) {
    throw new Error(
      `${envName} is not set. Generate one with: openssl rand -hex 32`,
    );
  }
  const trimmed = hex.trim();
  // Reject the catastrophic "test"/"dev"/typo case with a clear message before
  // the length check (otherwise non-hex decodes to garbage of the wrong length).
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new Error(
      `${envName} must be a hex string (got a non-hex value). ` +
        `Generate one with: openssl rand -hex 32`,
    );
  }
  const key = Buffer.from(trimmed, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${envName} must be a ${KEY_LENGTH}-byte hex string ` +
        `(${KEY_LENGTH * 2} hex characters); decoded ${key.length} bytes instead. ` +
        `Generate one with: openssl rand -hex 32`,
    );
  }
  return key;
}

/**
 * Startup guard: verifies the encryption key(s) are present and a full 32 bytes.
 * Throws (refusing to start) if the current version's key — or any configured
 * ENCRYPTION_KEY_V<n> — is missing, non-hex, or too short. This prevents the
 * catastrophic mistake of running with a key set to "test", "dev", or a typo.
 */
export function assertEncryptionKeysValid(): void {
  // The version used for new encryptions must resolve to a valid key.
  getKeyForVersion(getCurrentKeyVersion());

  // Validate every other explicitly-configured key version too, so a bad V2/V3
  // (e.g. mid-rotation) fails fast at startup rather than at first use.
  for (const name of Object.keys(process.env)) {
    if (/^ENCRYPTION_KEY_V\d+$/.test(name) && process.env[name]) {
      getKeyForVersion(name.slice("ENCRYPTION_KEY_".length).toLowerCase());
    }
  }
}

/**
 * Encrypts plaintext with AES-256-GCM under the CURRENT key version. Returns the
 * versioned string "v<n>:<iv>:<authTag>:<ciphertext>" (each part base64). A
 * fresh random IV is used every call, so the same input encrypts differently.
 */
export function encryptToken(plainText: string | SecretToken): EncryptedToken {
  const text = reveal(plainText);
  const version = getCurrentKeyVersion();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKeyForVersion(version), iv);
  const ciphertext = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    version,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":") as EncryptedToken;
}

/**
 * Returns the key version a ciphertext was written with ("v1", "v2", …), or
 * null for legacy (pre-versioning, un-prefixed) payloads. Used by the rotation
 * script to skip rows already on the target version.
 */
export function getCiphertextVersion(encrypted: string): string | null {
  const m = /^(v\d+):/.exec(encrypted);
  return m ? m[1] : null;
}

/**
 * Reverses {@link encryptToken}. Handles both the versioned format and legacy
 * un-versioned payloads. Throws if the payload is malformed, was tampered with
 * (GCM auth tag mismatch), or the key is wrong.
 */
export function decryptToken(encrypted: string): SecretToken {
  const version = getCiphertextVersion(encrypted);

  if (version) {
    // Versioned: v<n>:<ivB64>:<tagB64>:<ctB64>. base64 never contains ":", so a
    // 4-part split is exact.
    const parts = encrypted.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted payload: malformed versioned format.");
    }
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error("Invalid encrypted payload: bad iv/authTag length.");
    }
    return new SecretToken(gcmDecrypt(getKeyForVersion(version), iv, authTag, ciphertext));
  }

  // Legacy: base64(iv + authTag + ciphertext), written with the v1 key.
  const data = Buffer.from(encrypted, "base64");
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted payload: too short.");
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  return new SecretToken(gcmDecrypt(getKeyForVersion("v1"), iv, authTag, ciphertext));
}

function gcmDecrypt(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  ciphertext: Buffer,
): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plainText.toString("utf8");
}
