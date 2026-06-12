import "server-only";

import { createHash } from "node:crypto";

// Server-side PII salting for visitor identity (snippet v2.2 / Phase 3).
//
// The snippet and the dashboard search box both hash an email/phone in the
// browser (lib/pii-client.ts) so the RAW value never reaches us. The server then
// applies THIS salted layer before storing or querying, so:
//   • the stored emailHash/phoneHash can't be reversed with a rainbow table of
//     known emails (the salt is a server-only secret), and
//   • ingestion and search produce identical values, so a lookup matches.
//
// The salt is PII_SALT (falling back to ENCRYPTION_KEY, then a dev default so
// local/test runs work without extra config). NEVER log raw PII; we only ever
// hold these one-way hashes plus the (less sensitive) name / customerId.

function piiSalt(): string {
  return (
    process.env.PII_SALT ||
    process.env.ENCRYPTION_KEY ||
    "hoteltrack-dev-pii-salt"
  );
}

/**
 * Apply the salted server layer to a client-side SHA-256 hex digest. Returns
 * null unless `clientHash` is a well-formed 64-char hex SHA-256 (so a junk/raw
 * value can never be stored as if it were a hash). Used for both ingestion
 * (store) and lookup (query) so the two always agree.
 */
export function saltedHash(clientHash: string | null | undefined): string | null {
  const v = (clientHash ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(v)) return null;
  return createHash("sha256").update(`${piiSalt()}:${v}`).digest("hex");
}
