import "server-only";

import { randomBytes, createHash } from "node:crypto";

// Helpers for the hotel-owner share link — the public, read-only dashboard at
// /h/<shareToken> (see the HotelClient.shareToken column + app/h/[shareToken]).
//
// The token is the ONLY thing standing between the public and a hotel's data, so
// it must be unguessable: 256 bits of CSPRNG entropy, hex-encoded. Sequential or
// guessable ids would let anyone enumerate other hotels' dashboards.

/** A fresh 256-bit (32-byte) hex share token. */
export function generateShareToken(): string {
  return randomBytes(32).toString("hex");
}

// ── Visitor IP hashing ───────────────────────────────────────────────────────
// The access log stores only a SALTED SHA-256 of the IP, never the raw address,
// so the agency can tell "same visitor / how many times" without us holding PII.
// The salt is a server-only secret, so a hash can't be reversed via a rainbow
// table of known IPs.

function ipSalt(): string {
  return process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || "hoteltrack-dev-share-secret";
}

/** Salted SHA-256 of a client IP. Returns null when the IP is unknown. */
export function hashIp(ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v) return null;
  return createHash("sha256").update(`${ipSalt()}:${v}`).digest("hex");
}

/** Best-effort client IP from the request headers (behind Vercel's proxy). */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip");
}

// ── Public URL construction ──────────────────────────────────────────────────
// Prefer the configured app URL (so local/preview links point at the right host)
// and fall back to the production domain the spec documents.

/** The origin used to build share links, e.g. "https://www.hoteltrack.in". */
export function shareBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SHARE_BASE_URL ||
    "https://www.hoteltrack.in"
  ).replace(/\/+$/, "");
}

/** The full public dashboard URL for a token, e.g. ".../h/<token>". */
export function hotelShareUrl(token: string): string {
  return `${shareBaseUrl()}/h/${token}`;
}
