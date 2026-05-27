import "server-only";

import { randomBytes, scryptSync, createHmac, timingSafeEqual } from "node:crypto";

// Helpers for public share links (see the ShareLink model + /share/[uuid]).
//
// Two independent secrets at play:
//   • the share PASSWORD (optional, agency-chosen) — stored as a scrypt hash,
//     never reversible, verified in constant time.
//   • the UNLOCK COOKIE — once a visitor enters the right password we set a
//     signed cookie so they don't re-enter it on every view. It's an HMAC of the
//     token under a server secret, so it can't be forged client-side.

/** How long a freshly created share link stays valid. */
export const SHARE_LINK_TTL_DAYS = 30;

/** Expiry timestamp for a new link: now + TTL. */
export function shareExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SHARE_LINK_TTL_DAYS * 86_400_000);
}

// ── Password hashing (scrypt) ────────────────────────────────────────────────

/** Hashes a share password as "saltHex:hashHex". Returns null for empty input. */
export function hashSharePassword(password: string): string | null {
  const pw = password.trim();
  if (!pw) return null;
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time check of a candidate password against a stored "salt:hash". */
export function verifySharePassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ── Unlock cookie (HMAC) ─────────────────────────────────────────────────────

// Reuse a server-only secret for the HMAC. ENCRYPTION_KEY always exists in any
// configured deployment; the fallbacks keep local/dev from throwing on import.
function unlockSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || "hoteltrack-dev-share-secret";
}

/** The cookie name that marks a given token as unlocked in this browser. */
export function unlockCookieName(token: string): string {
  return `ht_share_${token}`;
}

/** The signed value to store in the unlock cookie. */
export function signUnlock(token: string): string {
  return createHmac("sha256", unlockSecret()).update(token).digest("hex");
}

/** Whether a presented cookie value is a valid unlock signature for the token. */
export function verifyUnlock(token: string, cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const expected = signUnlock(token);
  const a = Buffer.from(expected);
  const b = Buffer.from(cookieValue);
  return a.length === b.length && timingSafeEqual(a, b);
}
