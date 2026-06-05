# Security

## Reporting a vulnerability

Email **security@yourdomain.com** with details and a proof of concept if you
have one. Please do **not** open a public GitHub issue for security problems.
We aim to acknowledge within 2 business days.

---

## How secret encryption works

HotelTrack stores third-party secrets — Meta Ads access tokens, Instagram
tokens, and Google Analytics service-account credentials — encrypted at rest.
Six layers protect them:

1. **AES-256-GCM at rest** (`lib/encryption.ts`). GCM gives confidentiality +
   integrity (a tampered ciphertext fails to decrypt). Every value is written in
   a versioned format: `v<n>:<iv>:<authTag>:<ciphertext>` (each part base64).

2. **Key versioning / rotation.** The key for new writes is selected by
   `ENCRYPTION_KEY_VERSION` (default `v1`); each version's key lives in
   `ENCRYPTION_KEY_V<n>`. Decryption reads the version prefix and uses the
   matching key, so old ciphertext keeps working after a new key is introduced.

3. **Audit logging** (`lib/token-audit.ts`, `TokenAuditLog`). Every
   encrypt/decrypt records who/what/when and success/failure. **More than 3
   failed decryptions in 10 minutes** emails `SECURITY_ALERT_EMAIL` (possible
   tampering / wrong key). Super admins review the trail at `/admin/audit`.

4. **Logging / serialization safety** (`SecretToken`, `lib/redact.ts`). A
   decrypted token is a `SecretToken` object that prints `[REDACTED]` on
   `console.log`, `JSON.stringify`, `String()`, and string interpolation; the
   plaintext is reachable only via `.reveal()`. A global console filter
   (`instrumentation.ts`) also scrubs anything matching a token pattern.

5. **Database access hardening.** The Prisma client strips the encrypted columns
   from every query result; the only sanctioned reader is
   `getTokenForApiCall()` (`lib/token-access.ts`). At the DB level the app role
   `hoteltrack_app` is **denied `SELECT`** on the encrypted columns and can read
   them only through the `app_read_encrypted_secret` **security-definer
   function**, which writes an audit row on every access.

6. **Key storage hygiene** (this file + the startup guard below).

Multi-tenant isolation (RLS, agency scoping) is documented separately in
[MULTITENANCY.md](./MULTITENANCY.md).

---

## Key generation & storage

Generate a key with:

```bash
openssl rand -hex 32        # 32 bytes -> 64 hex characters
```

- **NEVER** commit the key, store it in source control, or share it over
  Slack / email / Discord / chat. It is a **root secret**: anyone with it can
  decrypt every stored token.
- Keep it only in your host's secret manager (Vercel / Render env vars, etc.).
- The app **refuses to start** if the key is missing, non-hex, or shorter than
  32 bytes (`assertEncryptionKeysValid` in `lib/encryption.ts`, wired into
  `instrumentation.ts`). This blocks the catastrophic `ENCRYPTION_KEY=test`
  mistake.

---

## Rotating keys (no downtime)

Rotation re-encrypts every stored secret under a new key version while the old
key is still available to read existing rows.

```bash
# 1. Generate the new key and add it WITHOUT removing the old one:
ENCRYPTION_KEY_V2=$(openssl rand -hex 32)     # add to your secret manager
ENCRYPTION_KEY_VERSION=v2                       # new writes use v2
#    (keep ENCRYPTION_KEY_V1 — the script needs it to read old rows)

# 2. Re-encrypt everything to v2 (preview first with --dry-run):
npm run rotate:keys -- --dry-run
npm run rotate:keys

# 3. Once it reports 0 rows remaining on old versions, RETIRE ENCRYPTION_KEY_V1.
```

The script (`scripts/rotate-encryption-keys.ts`) covers `MetaToken`,
`InstagramConnection`, and `GoogleAnalyticsConnection`, is idempotent (skips rows
already on the target version), and logs a `rotated` audit event per row.

---

## If a key is leaked

Treat a leaked `ENCRYPTION_KEY*` as a full compromise of all stored tokens.

1. **Rotate the encryption key immediately** — generate a new version and run
   `npm run rotate:keys` (above), then retire the leaked key version so it can
   no longer decrypt anything.
2. **Rotate the underlying third-party secrets**, because the attacker may have
   already decrypted them: revoke + reissue every Meta access token, Instagram
   token, and GA service-account key, then reconnect each integration.
3. **Review the audit trail** at `/admin/audit` (and `TokenAuditLog`) for
   unexpected `decrypted` / `failed_decrypt` activity, IPs, and actors.
4. **Invalidate the leak vector** (rotate any CI/host credentials that exposed
   it) and confirm the key was never committed (`git log -S` the value).
5. **Email security@yourdomain.com** to coordinate disclosure if customer data
   may have been exposed.

---

## Verifying the protections

```bash
npm run test:encryption    # round-trip, versioning, SecretToken redaction, tamper
npm run rotate:keys -- --dry-run   # backward-compatible decrypt of all rows
npx tsx scripts/smoke-token-access.ts   # strip, column-deny, security-definer
npm run test:isolation     # multi-tenant + token isolation suite (CI-gated)
```
