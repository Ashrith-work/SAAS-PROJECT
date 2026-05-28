# Deploying HotelTrack to Vercel

This is the full production deployment path: from local code → live HotelTrack at `https://your-domain.com`. Follow top-to-bottom.

---

## Prerequisites

| What | Why |
|---|---|
| **GitHub repo** with HotelTrack pushed to `main` | Vercel deploys from Git |
| **Vercel account** (free Hobby works for the launch; Pro needed for hourly Meta cron) | Hosting + cron |
| A **production PostgreSQL database** | Local dev DB is not safe for prod. Recommended: Vercel Postgres, Neon, Supabase, or Railway |
| **Clerk** project — production instance (separate from dev) | Auth keys |
| **Stripe** account in live mode + the four price IDs | Billing |
| **Meta** access token with `ads_read` (+ Instagram scopes if connecting IG) | Ads & social data |
| **Resend** API key | Transactional email |
| **A custom domain** (optional but recommended for the tracking snippet) | So you can use `https://hoteltrack.yourdomain.com/t.js` rather than the `*.vercel.app` URL |

---

## Step 1 — Provision a production Postgres database

Pick one (all work fine with Prisma):

| Provider | One-liner |
|---|---|
| **Vercel Postgres** (easiest — auto-injects env vars) | Vercel dashboard → Storage → Create Database → Postgres |
| **Neon** | Create a project → copy the `postgres://…?sslmode=require` URL |
| **Supabase** | Project Settings → Database → Connection string (Transaction pooler, port 6543) |
| **Railway** | New service → PostgreSQL → copy `DATABASE_URL` |

Copy the connection string. You'll paste it into Vercel in Step 4.

**Important:** if you use a pooled connection (Supabase pooler, PgBouncer, etc.) Prisma needs `?pgbouncer=true&connection_limit=1` on the URL.

---

## Step 2 — Run the schema migration against prod

From your local machine, point Prisma at the prod URL **once** to create the tables:

```powershell
# PowerShell (Windows)
$env:DATABASE_URL = "postgres://...your prod URL..."
npx prisma migrate deploy
```

```bash
# bash / zsh (Mac/Linux/WSL)
DATABASE_URL="postgres://...your prod URL..." npx prisma migrate deploy
```

`migrate deploy` (not `migrate dev`) only applies existing migrations — it never prompts and never reseeds.

Verify by opening Prisma Studio against prod:
```powershell
$env:DATABASE_URL = "postgres://...prod..."
npx prisma studio
```
You should see all tables empty. **Do NOT run `npm run seed` against prod** — that's only for the demo seed.

---

## Step 3 — Connect the repo to Vercel

1. Vercel dashboard → **Add New… → Project**
2. Pick the GitHub repo `SAAS-PROJECT`
3. **Framework Preset:** Next.js (auto-detected)
4. **Build Command:** leave as default (`npm run build`) — this runs `prebuild` which regenerates `public/t.js` from `scripts/snippet.src.js`
5. **Output Directory:** leave default
6. **Don't deploy yet** — click "Environment Variables" first (next step)

---

## Step 4 — Set every environment variable in Vercel

In the project's **Settings → Environment Variables**, add each row below. Scope = **Production** (and tick **Preview** if you want preview deploys to work).

### Core
| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://...your prod...` | From Step 1 |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | The URL the tracking snippet loads from — must be the final user-facing domain (NOT `*.vercel.app` if you plan to use a custom domain) |
| `ENCRYPTION_KEY` | 32-byte base64 | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — used for AES-256-GCM of Meta tokens |
| `CRON_SECRET` | a random string | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `NEXT_PUBLIC_TRACKING_MODE` | `pixel` *or* `hoteltrack` | `pixel` hides attribution UI; `hoteltrack` enables the snippet flow |

### Clerk (use PRODUCTION instance keys, not test)
| Key | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/agency/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/agency/onboarding` |

### Stripe (live mode keys)
| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (set after creating the webhook in Step 6) |
| `STRIPE_PRICE_STARTER` | `price_…` |
| `STRIPE_PRICE_GROWTH` | `price_…` |
| `STRIPE_PRICE_PRO` | `price_…` |
| `STRIPE_PRICE_ENTERPRISE` | `price_…` |

### Resend
| Key | Value |
|---|---|
| `RESEND_API_KEY` | `re_…` |
| `RESEND_FROM_EMAIL` | `alerts@your-domain.com` (must be a verified sender domain in Resend) |

### Optional
| Key | Value |
|---|---|
| `META_APP_ID`, `META_APP_SECRET` | If you build your own Meta Login flow later |

---

## Step 5 — Hit Deploy

1. Click **Deploy** at the bottom of the project page
2. Wait ~3-5 minutes for the first build
3. Once live, open your Vercel preview URL (`hoteltrack-xxx.vercel.app`) and test sign-up

---

## Step 6 — Wire up the Stripe webhook

The billing flow needs Stripe → HotelTrack updates to land:

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://your-domain.com/api/webhooks/stripe`
3. **Events to send:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. **Reveal Signing Secret** → copy `whsec_…`
5. Back in Vercel → add `STRIPE_WEBHOOK_SECRET=whsec_…` to env vars → **Redeploy**

Test the webhook: from Stripe dashboard → **Send test webhook** → pick `checkout.session.completed` → check Vercel logs.

---

## Step 7 — Set up the custom domain

1. Vercel project → **Settings → Domains** → add `your-domain.com`
2. In your DNS provider, add the A or CNAME record Vercel shows
3. Wait for SSL cert (Vercel auto-provisions Let's Encrypt — usually 30-60s)
4. **Verify `NEXT_PUBLIC_APP_URL`** in env vars exactly matches the custom domain (no trailing slash). If you change it, **redeploy** — `NEXT_PUBLIC_*` vars are inlined at build time, not runtime.

---

## Step 8 — Verify the Vercel Cron is firing

`vercel.json` already declares two crons:
- `/api/meta/sync` — every hour
- `/api/social/sync` — every 6 hours

After the first deploy:
1. Vercel project → **Settings → Cron Jobs** → confirm both rows appear
2. Click "Run Now" on `/api/meta/sync` to test (only works on **Pro** plan)
3. Check **Logs → Cron** for the response

**Plan limits:**
- **Hobby:** max 2 cron jobs, throttled to **once per day** — your hourly schedule silently runs daily. Upgrade to Pro for hourly.
- **Pro:** 40 crons, full cron expressions honored.

If you're on Hobby, change `vercel.json`:
```json
{ "path": "/api/meta/sync", "schedule": "0 3 * * *" }
```
…to be honest with yourself about the cadence.

---

## Step 9 — Point the tracking snippet at the right domain (only if using `NEXT_PUBLIC_TRACKING_MODE=hoteltrack`)

In pixel mode, **skip this section** — the snippet isn't used.

In HotelTrack mode:
1. The snippet URL is built from `NEXT_PUBLIC_APP_URL` (Step 4). It must be your **production** domain because the snippet runs on hotel sites.
2. On each hotel's `/agency/hotels/[id]/setup` page, the snippet block shows the correct URL automatically.
3. Hand the snippet to each hotel's developer.
4. CORS is already permissive on `/api/track/event` (`Access-Control-Allow-Origin: *`) — no extra config needed.

---

## Step 10 — Switch your Clerk app to production mode

If you used Clerk's "test instance" during development:
1. Clerk dashboard → create a **Production instance** of the app
2. Copy the new `pk_live_…` and `sk_live_…` keys → update Vercel env vars
3. **Sessions Settings → Customize session token** → add a custom claim: `metadata: "{{user.public_metadata}}"` (see [[clerk-role-session-token]] for why — without it the agency proxy redirects in a loop)
4. Redeploy

---

# 🚀 Pre-launch checklist

Run through this list before you tell a real customer the URL.

## Infrastructure
- [ ] Custom domain pointed at Vercel, SSL active
- [ ] `NEXT_PUBLIC_APP_URL` set to the custom domain (no trailing slash) — and the deploy has happened since the change
- [ ] Production Postgres provisioned + `prisma migrate deploy` succeeded
- [ ] All env vars in **Step 4** present in Vercel **Production** scope
- [ ] `ENCRYPTION_KEY` set (and stored safely — losing it means losing every Meta token)
- [ ] `CRON_SECRET` set + Vercel Cron entries visible in Settings → Cron Jobs

## Auth
- [ ] Clerk in production mode with `pk_live_…` / `sk_live_…`
- [ ] Clerk session token includes the `metadata` claim (otherwise: redirect loop)
- [ ] Sign-up flow works end-to-end: create account → onboarding → dashboard
- [ ] `npm run set:super-admin -- you@example.com` ran against PROD to grant yourself super-admin

## Billing
- [ ] Stripe in **live mode** (not test)
- [ ] 4 price IDs set in env vars
- [ ] Stripe webhook endpoint live, signing secret in env, test webhook returns 200
- [ ] One end-to-end live test: sign up → pick a plan → complete real Stripe Checkout → land on dashboard with subscriptionStatus=active

## Integrations
- [ ] Meta token has the right scopes (`ads_read` + IG scopes if used) and isn't expired
- [ ] At least one test hotel mapped to a real Meta ad account
- [ ] Run `/api/meta/sync` manually (via `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/meta/sync`) — confirm rows appear in `AdSnapshot`
- [ ] (If IG) Instagram connection works for at least one hotel

## Security
- [ ] `npm test` passes (cross-agency isolation suite — 7/7 green)
- [ ] No `console.log` printing tokens, passwords, or Stripe secrets anywhere in code
- [ ] `.env.local` is `.gitignore`'d (verify: `git check-ignore -v .env.local`)
- [ ] Confirm `/api/track/event` rate limit returns 429 when hammered

## UX
- [ ] Top-level loading + error boundaries render correctly (intentionally throw in a server component to test the error page)
- [ ] Every page has either real content or a friendly empty state
- [ ] Generate a share link from a hotel's dashboard, open it in an incognito window — works without login
- [ ] Excel and CSV exports download cleanly from agency dashboard, content library, hotels list, hotel report

## Communication
- [ ] Resend domain verified (SPF + DKIM)
- [ ] Send a test alert email → arrives, looks right, links point to prod URLs

## Last thing before announcing
- [ ] Open the prod site in 3 browsers (Chrome / Safari / Firefox), 1 mobile — no console errors, charts render, navigation works
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`

---

## Troubleshooting common deploy issues

| Symptom | Likely cause |
|---|---|
| Build fails at `prisma generate` | `DATABASE_URL` missing/malformed in Vercel build env |
| Sign-in loops between `/sign-in` ↔ `/agency/dashboard` | Clerk session token missing the `metadata` claim (see Step 10) |
| Webhook returns 400 "No signatures found matching the expected signature" | `STRIPE_WEBHOOK_SECRET` is from a different endpoint than the one Stripe is calling |
| `/api/meta/sync` returns 401 | `Authorization` header missing or `CRON_SECRET` mismatch |
| Tracking snippet 404s on hotel's site | `NEXT_PUBLIC_APP_URL` was not redeployed after change (it's inlined at build time) |
| Charts blank in production | `NEXT_PUBLIC_TRACKING_MODE` set to `pixel` — that's by design; set to `hoteltrack` if you want them back |
| Cron only fires once a day despite `0 * * * *` schedule | Vercel Hobby plan; upgrade to Pro or accept daily cadence |
