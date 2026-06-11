# HotelTrack Integration Architecture

HotelTrack connects three external data sources per hotel — **Instagram** (IGAA
login), **Google Analytics 4** (Google OAuth), and **Meta Ads** (long-lived
token / Facebook Login). The architecture is **multi-tenant by hotel**: platform
app credentials live in env vars and are shared by everyone; each hotel's own
access token lives in the database.

## Critical operational rule

The following Vercel environment variables are **PLATFORM-LEVEL** and must
**NEVER be changed once any hotel has connected**:

- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GA4_REDIRECT_URI`
- `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` (Meta OAuth path)
- `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION` (rotation requires a migration script — never edit in place)

Set **one** app/client per provider and leave them alone. Adding a hotel never
requires touching them.

> **Changing `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` orphans every connected hotel's
> GA4 refresh token.** Google refresh tokens are bound to the OAuth client that
> minted them. There is no recovery — affected hotels must reconnect GA4
> manually. GA4 access tokens expire hourly and are refreshed with these
> credentials (`lib/ga4.ts:refreshAccessToken`), so the breakage shows up within
> ~1 hour / at the next daily sync.

> **Changing `INSTAGRAM_APP_ID`/`SECRET` breaks future connect attempts but does
> NOT break already-stored Instagram tokens** — IGAA refresh
> (`grant_type=ig_refresh_token`) and all data reads use only the per-hotel
> bearer token, never the app credentials.

> **Changing `ENCRYPTION_KEY` makes every stored token undecryptable.** Treat it
> as immutable; rotate only via a key-versioned migration.

The app **fails loud at startup** (`lib/env-validation.ts`, imported by
`app/layout.tsx`) if a required platform var is empty, if a provider is
*partially* configured (some vars set, others empty — the silent-broken state),
or if `ENCRYPTION_KEY` is too short. Set `STRICT_ENV_VALIDATION=1` to also crash
when a provider is entirely unconfigured (default: a loud warning).

## Per-hotel data

Per-hotel credentials live in the **DATABASE, never in env vars**. Each hotel
has at most:

- **One `InstagramConnection` row** — `@@unique([hotelClientId])`. Encrypted
  IGAA token + `igUserId`.
- **One `Ga4Connection` row** — `hotelClientId @unique`. Encrypted access +
  refresh tokens + `propertyId`.
- **One `MetaToken` row per *agency*** (not per hotel — by design). The ad
  account is mapped per hotel via `hotelClient.metaAdAccountId`.

All tokens are AES-256-GCM encrypted at rest and stripped from ordinary Prisma
results (`lib/prisma.ts`); the only sanctioned read path is
`getTokenForApiCall()`. Every read/sync looks the token up **by hotel** — there
is no shared per-agency or env-var token for Instagram/GA4.

**Adding a new hotel requires ZERO env var changes. Ever.**

## Reconnect flow

If a hotel's connection breaks (token revoked/expired, or — for GA4 — a refresh
token orphaned by a client-id change), the sync sets **`requiresReconnect = true`**
and **`lastErrorReason`** on that hotel's connection row, and logs a structured
line: `[GA4-OAUTH-FAILURE]` or `[INSTAGRAM-OAUTH-FAILURE]` with the
`hotelClientId` and provider error code.

The hotel's **Integrations page** surfaces this with a red **"Reconnect needed"**
banner and a one-click button that hits `/api/auth/<provider>/start?hotelClientId=<id>`.
Completing the OAuth round-trip (callback) clears `requiresReconnect` back to
`false` and the data resumes flowing on the next sync. Agencies see broken
connections immediately instead of silently losing data.

## Where things live

| Concern | File |
| --- | --- |
| Startup env validation | `lib/env-validation.ts` |
| Instagram client / OAuth / refresh | `lib/instagram.ts` |
| Instagram sync (sets reconnect flag) | `lib/instagram-sync.ts`, `app/api/instagram/refresh-tokens/route.ts` |
| GA4 client / OAuth / refresh | `lib/ga4.ts` |
| GA4 sync (sets reconnect flag) | `lib/ga4-sync.ts` |
| Meta Ads client / OAuth | `lib/meta.ts` |
| OAuth start/callback | `app/api/auth/<provider>/{start,callback}/route.ts` |
| Reconnect banner UI | `app/(agency)/agency/(app)/hotel/[id]/integrations/page.tsx` |
