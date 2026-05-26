import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Symmetric encryption for secrets at rest — specifically Meta access tokens
// (see CLAUDE.md: tokens are AES-256-GCM encrypted, never logged, never sent to
// the frontend). GCM gives us both confidentiality and integrity (auth tag).

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // AES-256 -> 32-byte key
const IV_LENGTH = 12; // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit GCM authentication tag

/**
 * Reads and validates the 32-byte key from ENCRYPTION_KEY (a 64-char hex
 * string). Read lazily so merely importing this module never throws — the
 * error only surfaces when you actually encrypt/decrypt without a key.
 */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_LENGTH}-byte hex string ` +
        `(${KEY_LENGTH * 2} hex characters); decoded ${key.length} bytes instead.`,
    );
  }
  return key;
}

/**
 * Encrypts plaintext with AES-256-GCM. The returned base64 string packs
 * iv (12 bytes) + authTag (16 bytes) + ciphertext, so {@link decryptToken}
 * has everything it needs. A fresh random IV is used on every call, so the
 * same input produces different output each time.
 */
export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Reverses {@link encryptToken}. Throws if the payload is malformed, if it was
 * tampered with (GCM auth tag mismatch), or if the key is wrong.
 */
export function decryptToken(encrypted: string): string {
  const data = Buffer.from(encrypted, "base64");
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted payload: too short.");
  }

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plainText.toString("utf8");
}
