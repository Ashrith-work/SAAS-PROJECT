# Meta integrations architecture

HotelTrack uses **two separate Meta connection types for two different data
sources**. They share nothing — not the token, not the API host, not the
connection flow.

## 1. Facebook Ads (EAA token via Facebook Page)

- **For:** Ad spend, campaign performance, ROAS, audience insights
- **How:** The agency pastes a long-lived `EAA…` token from Graph API Explorer
  on **Settings → Meta Ads connection**, then maps an ad account (`act_…`) to
  each hotel on the hotel's Integrations page
- **Requires:** A Meta app with Marketing API access; the token's Facebook user
  must have access to the ad account (`ads_read` / `ads_management`)
- **API host:** `graph.facebook.com` (see `lib/meta.ts`)
- **Storage:** One `MetaToken` row per agency (AES-256-GCM encrypted)
- **Sync:** `/api/meta/sync` — hourly Vercel Cron, writes `AdSnapshot` rows
- **Expiry:** Long-lived user tokens last ~60 days and must be re-pasted
  (system-user tokens never expire)

## 2. Instagram Organic (IGAA token via Instagram Login)

- **For:** Followers, reach, impressions, profile views, post engagement
- **How:** The hotel clicks **"Log in with Instagram"** on the hotel's
  Integrations page and grants permission — a standard OAuth flow
  (`/api/auth/instagram/start` → Instagram consent → `/api/auth/instagram/callback`)
- **Requires:** A **Business or Creator** Instagram account (Personal accounts
  are rejected at connect). **No Facebook Page required.**
- **API host:** `graph.instagram.com` with `IGAA…` tokens (see `lib/instagram.ts`)
- **Storage:** One `InstagramConnection` row per hotel (AES-256-GCM encrypted)
- **Sync:** `/api/instagram/sync` — daily 6am UTC Vercel Cron, writes
  `SocialSnapshot` (daily account metrics) + `PostSnapshot` (per-post metrics)
- **Expiry:** Tokens last 60 days **but auto-refresh**:
  `/api/instagram/refresh-tokens` (weekly cron, Mondays 3am UTC) rolls forward
  every active token expiring within 14 days. As long as the cron runs, hotels
  never reconnect — effectively non-expiring.

**Both connections are independent — a hotel can have one without the other.**

## Connection state model

| `InstagramConnection.status` | Meaning |
| --- | --- |
| `active` | Healthy; synced daily, token auto-refreshed |
| `error` | Last sync/refresh failed (`errorMessage` says why); UI prompts a reconnect, agency is emailed |
| `deprecated_eaa` | Row from the retired EAA-via-Page flow; kept for history, never synced |

`tokenType` is `igaa_direct` for every connection created by the OAuth flow
(`eaa_via_page` only on deprecated rows).

## Security notes

- IGAA tokens are encrypted with the same AES-256-GCM module as every other
  secret (`lib/encryption.ts`), read only through `getTokenForApiCall()`
  (audited), stripped from all Prisma query results, and never logged or sent
  to the browser.
- The OAuth `state` parameter is an HMAC-signed, 10-minute token
  (`lib/signed-state.ts`) binding the callback to one (agency, hotel) pair —
  the callback re-verifies the pair against the DB before writing anything.

## Historical note

Until June 2026, Instagram was connected with the *same* EAA token as ads, via
Facebook Page discovery (`/me/accounts` → `instagram_business_account`). That
flow required the hotel's IG to be linked to a Page the token's user managed —
a constant source of setup failures — and the 60-day token had no refresh
path. It was removed entirely in the IGAA restructure; the old `SocialAccount`
table was renamed `InstagramConnection` and EAA-era rows were marked
`deprecated_eaa`.
