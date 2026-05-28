# Deploying HotelTrack to Render

This is the full production deployment path on Render. Follow top-to-bottom. Where it overlaps with the Vercel doc (env-var tables, pre-launch checklist), I keep it standalone so you don't have to flip between files.

---

## Prerequisites

| What | Why |
|---|---|
| **GitHub repo** with HotelTrack pushed to `main` | Render deploys from Git |
| **Render account** ([render.com](https://render.com)) | Hosting |
| **A production PostgreSQL database** | Either Render Postgres (easiest) or external (Neon, Supabase, Railway) |
| **Clerk** project — production instance | Auth keys |
| **Stripe** account in live mode + the four price IDs | Billing |
| **Meta** access token with `ads_read` (+ Instagram scopes if connecting IG) | Ads & social data |
| **Resend** API key + verified sender domain | Transactional email |
| **A custom domain** (optional but recommended) | So the tracking snippet URL is yours, not `*.onrender.com` |

### Render plan choice — important
| Plan | Web service behavior | Verdict for HotelTrack |
|---|---|---|
| **Free** | Spins down after 15 min idle, cold-starts on next hit | **Don't use for production** — your tracking endpoint will be sleeping when a guest converts |
| **Starter ($7/mo)** | Always-on, 0.5 CPU / 512 MB RAM | Fine for the launch |
| **Standard ($25/mo)** | Always-on, 1 CPU / 2 GB | Use this if you outgrow Starter (e.g. heavy chart pages, many hotels) |

Cron jobs on Render are separate services, each starting at **$1/month** on the Standard plan (Free tier crons are limited and slow).

Rough total cost for production: **~$15-20/month** (Starter web + Starter Postgres + 2 cron jobs).

---

## Step 1 — Provision a production Postgres database

### Option A: Render Postgres (recommended for one-platform simplicity)
1. Render dashboard → **+ New → PostgreSQL**
2. **Name:** `hoteltrack-db`
3. **Region:** same region you'll deploy the web service in (e.g. Oregon)
4. **Plan:** Starter ($7/mo, 256 MB RAM, 1 GB disk) — plenty for the launch
5. Click **Create Database**
6. Once provisioned, copy the **Internal Database URL** (faster + free intra-region traffic). External URL works too but is slower.

### Option B: External Postgres (Neon / Supabase / Railway)
Create the DB and grab the `postgres://...?sslmode=require` connection string. Same result; you'll paste this URL into Render's env vars in Step 4.

**Important:** if you use a pooled connection (Supabase pooler, PgBouncer, etc.), Prisma needs `?pgbouncer=true&connection_limit=1` on the URL.

---

## Step 2 — Run the schema migration against prod

From your local machine, point Prisma at the prod URL **once** to create the tables.

If you used Render Postgres, copy the **External Database URL** for this one-shot (your laptop isn't inside Render's network):

```powershell
# PowerShell (Windows)
$env:DATABASE_URL = "postgres://...your prod external URL..."
npx prisma migrate deploy
```

```bash
# bash / zsh
DATABASE_URL="postgres://...your prod external URL..." npx prisma migrate deploy
```

`migrate deploy` (not `migrate dev`) only applies existing migrations — it never prompts and never reseeds.

Verify by opening Prisma Studio against prod:
```powershell
$env:DATABASE_URL = "postgres://...prod..."
npx prisma studio
```
You should see all tables empty. **Do NOT run `npm run seed` against prod** — that's only the demo seed.

---

## Step 3 — Create the Web Service

1. Render dashboard → **+ New → Web Service**
2. Connect your GitHub account → pick the `SAAS-PROJECT` repo
3. Settings:

| Field | Value |
|---|---|
| **Name** | `hoteltrack` (becomes part of the URL: `hoteltrack.onrender.com`) |
| **Region** | Same as your Postgres |
| **Branch** | `main` |
| **Root Directory** | (leave blank) |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Starter ($7/mo) |
| **Auto-Deploy** | `Yes` (deploys on every push to `main`) |
| **Health Check Path** | `/sign-in` (a real, fast-rendering page — the root redirects, and Render's health checker doesn't follow redirects) |

**Important on the build command:** the explicit `npx prisma generate` is belt-and-suspenders. Prisma's postinstall hook normally handles it, but doing it explicitly guarantees the Prisma Client matches your schema. Without it you'll get "Prisma client not generated" runtime errors.

Don't deploy yet — set env vars first (next step).

---

## Step 4 — Set every environment variable

In the service's **Environment** tab, add each row below. Sensitive values use the **Secret** type so they're hidden from the dashboard view after saving.

### Core
| Key | Value | Notes |
|---|---|---|
| `NODE_VERSION` | `22` | Render uses Node 22 by default; pinning avoids surprises |
| `DATABASE_URL` | the Postgres URL from Step 1 | If you used Render Postgres, **use the Internal URL** here (faster) |
| `NEXT_PUBLIC_APP_URL` | `https://hoteltrack.onrender.com` (or your custom domain) | The tracking snippet loads from here — must be the final user-facing URL |
| `ENCRYPTION_KEY` | 32-byte base64 | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — encrypts Meta tokens at rest |
| `CRON_SECRET` | a random string (e.g. `openssl rand -hex 32`) | The cron job services will send this as a Bearer token |
| `NEXT_PUBLIC_TRACKING_MODE` | `pixel` *or* `hoteltrack` | `pixel` hides attribution UI; `hoteltrack` enables the snippet flow |

### Clerk (PRODUCTION instance, not test)
| Key | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/agency/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/agency/onboarding` |

### Stripe (live mode)
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

After saving env vars, click **Manual Deploy → Deploy latest commit**.

---

## Step 5 — Verify the first deploy

1. Wait for the build to finish (~3-5 min for the first one — subsequent deploys are faster thanks to npm cache)
2. Watch the **Logs** tab for:
   - `Compiled successfully`
   - `Ready in <Xms>` from Next.js
3. Open `https://hoteltrack.onrender.com` (or whatever Render assigned)
4. Hit `/sign-up` → create a test account → confirm onboarding lands you on `/agency/dashboard`

**If the build fails:** check Logs for the specific error. Common ones:
- "Prisma Client not initialized" → the `npx prisma generate` step was missed in the build command
- "Cannot find module" → `npm ci` would have caught this; switch the build command from `npm install` to `npm ci` (faster + stricter)
- TypeScript errors → reproduce locally with `npx next build`, then push the fix

---

## Step 6 — Wire up the Stripe webhook

Billing only updates when Stripe can call into HotelTrack:

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://hoteltrack.onrender.com/api/webhooks/stripe` (or custom domain)
3. **Events to send:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. **Reveal Signing Secret** → copy `whsec_…`
5. Back in Render → add `STRIPE_WEBHOOK_SECRET=whsec_…` to env vars → Render auto-redeploys

Test: from Stripe dashboard → **Send test webhook** → pick `checkout.session.completed` → check Render Logs for the 200 response.

---

## Step 7 — Custom domain (optional but recommended)

1. Render service → **Settings → Custom Domains → + Add Custom Domain**
2. Enter `hoteltrack.your-domain.com` (or apex `your-domain.com`)
3. Render shows the DNS record to add (CNAME for subdomains, A/ALIAS for apex)
4. Add it at your DNS provider (Cloudflare, Namecheap, Route53, etc.)
5. Wait for verification — Render auto-issues a Let's Encrypt cert (60-90s)
6. **Update `NEXT_PUBLIC_APP_URL`** to your custom domain → manual redeploy. `NEXT_PUBLIC_*` vars are inlined at build time, so a redeploy is required for the new URL to land in the snippet code.

---

## Step 8 — Set up the cron jobs

Render doesn't read `vercel.json` — that file is ignored. You create **two separate Cron Job services** in Render that hit your endpoints.

### Cron job 1: Hourly Meta sync

1. Render dashboard → **+ New → Cron Job**
2. **Connect** the same GitHub repo (Render still needs a repo even for curl-only crons; you can also use a Docker image directly — see "Docker-based cron" below for the simpler path).
3. Settings:

| Field | Value |
|---|---|
| **Name** | `hoteltrack-meta-sync` |
| **Region** | Same as the web service |
| **Schedule** | `0 * * * *` (every hour, top of the hour) |
| **Runtime** | `Node` |
| **Build Command** | `echo skipped` |
| **Command** | `curl -fsSL -X GET -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/meta/sync"` |
| **Plan** | Starter ($1/mo) |

4. Add **two env vars** to this cron service:
   - `CRON_SECRET` = same value as the web service
   - `APP_URL` = `https://hoteltrack.onrender.com` (or your custom domain)

### Cron job 2: 6-hourly social sync

Same as above with:
- **Name:** `hoteltrack-social-sync`
- **Schedule:** `0 */6 * * *`
- **Command:** `curl -fsSL -X GET -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/social/sync"`

### Docker-based cron (cleaner alternative)
If you want to skip the repo connection, choose **Runtime: Docker** and use the official `curlimages/curl` image:

| Field | Value |
|---|---|
| **Runtime** | `Docker` |
| **Image** | `curlimages/curl:8.10.1` |
| **Command** | `curl -fsSL -X GET -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/meta/sync"` |

Tiny container, zero build, runs in seconds.

### Verify
1. After saving, click **Trigger Run** on each cron
2. Logs should show a 204 (success) response
3. Open Prisma Studio against prod → confirm new rows in `AdSnapshot` / `SocialSnapshot`

---

## Step 9 — Point the tracking snippet at the right domain (only if using `NEXT_PUBLIC_TRACKING_MODE=hoteltrack`)

In pixel mode, **skip this section** — the snippet isn't used.

In HotelTrack mode:
1. The snippet URL is built from `NEXT_PUBLIC_APP_URL` (Step 4). It must be the final production URL because the snippet runs on hotel sites.
2. Confirm the snippet block on `/agency/hotels/[id]/setup` shows the correct URL.
3. Hand the snippet to each hotel's developer.
4. CORS is already permissive on `/api/track/event` — no extra config needed on Render's end.

---

## Step 10 — Switch your Clerk app to production mode

If you used Clerk's "test instance" during development:
1. Clerk dashboard → create a **Production instance** of the app
2. Copy the new `pk_live_…` and `sk_live_…` keys → update Render env vars
3. **Sessions Settings → Customize session token** → add a custom claim: `metadata: "{{user.public_metadata}}"` — without this the agency proxy redirects in a loop (see `memory/clerk-role-session-token.md`)
4. Render auto-redeploys

---

# 🚀 Pre-launch checklist (Render edition)

## Infrastructure
- [ ] Custom domain pointed at Render, Let's Encrypt cert active
- [ ] `NEXT_PUBLIC_APP_URL` matches the custom domain (no trailing slash) — **and** the service has been redeployed since the change
- [ ] Production Postgres provisioned + `prisma migrate deploy` succeeded
- [ ] Render web service on **Starter or higher** (Free tier sleeps — your tracking endpoint will miss conversions)
- [ ] All env vars from Step 4 set in **Environment** tab of the web service
- [ ] `ENCRYPTION_KEY` set (and stored safely off-Render — losing it means losing every Meta token)
- [ ] `CRON_SECRET` set in the web service AND in both cron services

## Cron
- [ ] Both Render Cron Job services created (`hoteltrack-meta-sync` hourly, `hoteltrack-social-sync` 6-hourly)
- [ ] Manually triggered each cron once → got 204 + rows landed in DB
- [ ] Both crons set to **Starter plan** (Free tier crons may be delayed or rate-limited)

## Auth
- [ ] Clerk in production mode with `pk_live_…` / `sk_live_…`
- [ ] Clerk session token includes the `metadata` claim (otherwise: redirect loop)
- [ ] Sign-up flow works end-to-end: create account → onboarding → dashboard
- [ ] `npm run set:super-admin -- you@example.com` ran against PROD (point `DATABASE_URL` at prod URL when running)

## Billing
- [ ] Stripe in **live mode** (not test)
- [ ] 4 price IDs set in env vars
- [ ] Stripe webhook endpoint live, signing secret in env, test webhook returns 200 in Render Logs
- [ ] One end-to-end live test: sign up → pick a plan → complete real Stripe Checkout → land on dashboard with `subscriptionStatus=active`

## Integrations
- [ ] Meta token has the right scopes (`ads_read` + IG scopes if used) and isn't expired
- [ ] At least one test hotel mapped to a real Meta ad account
- [ ] Manually hit `/api/meta/sync` once → confirm rows appear in `AdSnapshot`
- [ ] (If IG) Instagram connection works for at least one hotel

## Security
- [ ] `npm test` passes (cross-agency isolation suite — 7/7 green)
- [ ] No `console.log` printing tokens, passwords, or Stripe secrets anywhere in code
- [ ] `.env.local` is `.gitignore`'d (`git check-ignore -v .env.local`)
- [ ] Confirm `/api/track/event` rate limit returns 429 when hammered

## UX
- [ ] Top-level loading + error boundaries render correctly (force-throw in a server component to test the error page)
- [ ] Every page has either real content or a friendly empty state
- [ ] Generate a share link from a hotel's dashboard, open it in incognito — works without login
- [ ] Excel and CSV exports download cleanly from agency dashboard, content library, hotels list, hotel report

## Communication
- [ ] Resend domain verified (SPF + DKIM)
- [ ] Send a test alert email → arrives, looks right, links point to prod URLs

## Last thing before announcing
- [ ] Open the prod site in 3 browsers (Chrome / Safari / Firefox), 1 mobile — no console errors, charts render, navigation works
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`

---

## Troubleshooting common Render deploy issues

| Symptom | Likely cause |
|---|---|
| Build fails at `prisma generate` | `DATABASE_URL` missing in the build env, OR Render didn't run postinstall — make sure your build command is `npm install && npx prisma generate && npm run build` |
| Service starts but health check fails repeatedly | Health Check Path is `/` (which redirects). Change to `/sign-in` |
| Sign-in loops between `/sign-in` ↔ `/agency/dashboard` | Clerk session token missing the `metadata` claim (see Step 10) |
| Stripe webhook returns 400 "No signatures found matching the expected signature" | `STRIPE_WEBHOOK_SECRET` is from a different endpoint than the one Stripe is calling |
| Cron job returns 401 | `Authorization` header missing or `CRON_SECRET` mismatch between the cron service env and the web service env |
| Cron command "curl: command not found" (Node runtime) | `curl` IS available in Render's Node runtime image; check the Command field for typos. Or switch to Docker runtime with `curlimages/curl` |
| Tracking snippet 404s on hotel's site | `NEXT_PUBLIC_APP_URL` was not redeployed after change (it's inlined at build time — every change needs a manual redeploy) |
| Charts blank in production | `NEXT_PUBLIC_TRACKING_MODE` set to `pixel` — that's by design; set to `hoteltrack` if you want them back |
| Service goes to sleep mid-day | You're on the Free plan — upgrade to Starter ($7/mo) for always-on |
| Cold starts after `git push` | Normal during deploy — Render rolling-deploys means the old version serves while the new one boots. Should be < 30s |

---

## What's different from the Vercel doc

If you're cross-referencing `docs/deploying-to-vercel.md`:
- Steps 1, 2, 4, 6, 7, 10 are nearly identical (just different dashboard clicks)
- Step 3 (creating the service) is more explicit on Render — you must specify build & start commands
- Step 5 (verify) is simpler on Render — single persistent service, logs are one stream
- **Step 8 (cron) is genuinely different** — no `vercel.json`; you create separate cron services and pay per cron
- Step 9 (snippet domain) is identical
- The pre-launch checklist is mostly the same with Render-specific notes added
