// Browser-safe PII hashing — NO "server-only", so the dashboard's Customer
// Journey Lookup search box can hash an email/phone in the browser before it ever
// touches the network. The tracking snippet (scripts/snippet.src.js) mirrors this
// exact normalization + SHA-256 so the hashes line up; keep the two in sync.
//
// This produces the CLIENT hash. The server then applies a second, salted layer
// (lib/pii.ts → saltedHash) before storing/querying, so the salt stays a
// server-only secret and the raw value never leaves the browser.

/** Lower-case + trim — must match the snippet's email normalization exactly. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only — must match the snippet's phone normalization exactly. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** Hex SHA-256 of a string via Web Crypto (returns "" if unavailable). */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/** Client hash for an email (normalize → SHA-256). "" when empty/unavailable. */
export async function hashEmailClient(email: string): Promise<string> {
  const n = normalizeEmail(email);
  return n ? sha256Hex(n) : "";
}

/** Client hash for a phone (normalize → SHA-256). "" when empty/unavailable. */
export async function hashPhoneClient(phone: string): Promise<string> {
  const n = normalizePhone(phone);
  return n ? sha256Hex(n) : "";
}
