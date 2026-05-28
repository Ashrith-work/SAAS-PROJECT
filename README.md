# HotelTrack

A multi-tenant SaaS for **marketing agencies that manage hotel clients**. Proves that the agency's content (organic Instagram posts, paid Meta ads, influencer collaborations) drives **real bookings on the hotel's own website** — closing the loop from *content → visit → booking → revenue*, plus Meta ad ROI.

## 🌐 Live demo

> **Public demo URL:** *not running right now*
>
> The demo runs from a developer's laptop via an ngrok tunnel. When it's up, the URL goes here. If you're seeing this line, the tunnel is offline — see [Spinning up a public demo](#-spinning-up-a-public-demo) below.

When the demo is live, **sign in flow**:
1. Click "Sign up" → use any email
2. Complete onboarding (any agency name works — you get a fresh tenant)
3. To see the rich demo data (4 hotels, 90 days of tracking events, paid Meta ads, organic IG metrics), ask the maintainer to attach you to the **Coastal Digital Agency** tenant (`npm run attach:member -- <your-email>`)

## ✨ What it does

- **Agencies sign up** and pay a monthly subscription (Stripe)
- They **add hotel clients** and install either the **HotelTrack tracking snippet** or **Facebook Pixel** on the hotel's website
- They generate **UTM-tagged links** and **coupon codes** for every piece of content
- The dashboard shows **content → visits → bookings → revenue** per hotel, plus **Meta ad ROAS** and **organic Instagram** metrics
- **Per-hotel shareable read-only links** so hotel owners can see their own dashboard without an account
- **Excel + CSV exports** from every list and report
- **Multi-tenant isolation:** every database query filters by `agencyId` (enforced by a vitest suite — see `tests/agency-isolation.test.ts`)

## 🛠 Tech stack

| Layer | What |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | PostgreSQL via Prisma 7 |
| Auth | Clerk |
| Billing | Stripe |
| Email | Resend |
| Charts | Recharts |
| Tracking snippet | Vanilla JS (`scripts/snippet.src.js`) |
| Exports | jsPDF (PDF) + xlsx (Excel) + RFC-4180 CSV (`lib/csv.ts`) |
| Hosting | Vercel or Render (deploy docs in `docs/`) |
| Tests | vitest |

## 🚀 Run it locally

```powershell
# 1. Clone and install
git clone https://github.com/Ashrith-work/SAAS-PROJECT.git
cd SAAS-PROJECT
npm install

# 2. Set up .env.local (see "Environment variables" below)
#    At minimum: DATABASE_URL, Clerk keys, ENCRYPTION_KEY

# 3. Push the schema to your dev DB
npx prisma migrate dev

# 4. (Optional) seed the demo dataset — Coastal Digital Agency + Mountain Media
npm run seed

# 5. Build + run the production server (lean — recommended on machines with < 4 GB free RAM)
npx next build
npx next start -p 3001
# → http://localhost:3001
```

For hot-reload during development:
```powershell
npm run dev
# (more RAM hungry; first compile is slow)
```

## 🌍 Spinning up a public demo

The repo includes an ngrok tunnel script so you can expose the local server to the internet at a public HTTPS URL:

### One-time ngrok setup
1. **Sign up** at [ngrok.com](https://dashboard.ngrok.com/signup) (free)
2. Grab your **authtoken** from [the auth tokens page](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Save it locally — run once:
   ```powershell
   ngrok config add-authtoken <YOUR_TOKEN>
   ```
4. *(Optional, recommended)* On the [domains page](https://dashboard.ngrok.com/domains), reserve your **free static domain** (e.g. `hoteltrack-demo.ngrok-free.app`). Without a static domain the URL changes every restart.

### Run the tunnel
With the local server running on port 3001 in one terminal, in another:
```powershell
npm run tunnel
# or for a static domain:
ngrok http --domain=hoteltrack-demo.ngrok-free.app 3001
```
ngrok prints a `https://...ngrok-free.app` URL. **That URL is your public demo link** — paste it into the "Live demo" section above and push.

### Important caveats
- **Your laptop must be on** for the tunnel to be reachable
- Clerk has to allow the ngrok origin — add it under Clerk dashboard → **Domains** → Add the ngrok URL
- `NEXT_PUBLIC_APP_URL` should match the ngrok URL if you want the tracking snippet to point to the right place (and you need to **rebuild** after changing it — `NEXT_PUBLIC_*` is inlined at build time)
- ngrok free tier shows a "you are about to visit this site" interstitial the first time someone opens the URL
- This is for **demos only** — for real production, deploy to Vercel or Render (see `docs/`)

## 🔑 Environment variables

Minimum to boot locally — see `docs/deploying-to-vercel.md` for the full production list.

```ini
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/hoteltrack?sslmode=disable

# Public URL (the tracking snippet loads from here)
NEXT_PUBLIC_APP_URL=http://localhost:3001

# Which tracking flow the UI exposes — "pixel" (Meta-only) or "hoteltrack" (snippet + attribution)
NEXT_PUBLIC_TRACKING_MODE=pixel

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# AES-256-GCM key for encrypting Meta tokens at rest
ENCRYPTION_KEY=<32-byte base64>

# Cron secret (used by Vercel/Render Cron to authenticate)
CRON_SECRET=<random string>

# Stripe — only needed once you wire up billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend — only needed for the alerts emails
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=alerts@example.com
```

## 📚 Documentation

| Doc | What's inside |
|---|---|
| `docs/agency-owner-setup.md` | First-time setup for an agency owner: sign up, plan, Meta connection, alerts |
| `docs/adding-a-hotel-client.md` | Per-hotel onboarding: dual-snippet install (HotelTrack + Meta Pixel), ad-account mapping, IG, content links, share link |
| `docs/deploying-to-vercel.md` | 10-step Vercel deploy + pre-launch checklist + troubleshooting |
| `docs/deploying-to-render.md` | 10-step Render deploy + pre-launch checklist + troubleshooting |

## 🧪 Tests

```powershell
npm test            # one-shot run
npm run test:watch  # re-run on file change
```

`tests/agency-isolation.test.ts` seeds two prefixed agencies and asserts that scoped Prisma queries never leak across tenants. This is the headline security regression test — run it before every release.

## 📦 Useful npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server with hot reload |
| `npm run build` | Production build (also regenerates `public/t.js` from `scripts/snippet.src.js`) |
| `npm start` | Run the production server |
| `npm run seed` | Seed the demo dataset (Coastal + Mountain agencies) |
| `npm run attach:member -- <email>` | Attach an existing Clerk user to the Coastal demo agency |
| `npm run set:super-admin -- <email>` | Grant platform super-admin to a Clerk user |
| `npm run setup:stripe` | Bootstrap Stripe products + prices (one-time) |
| `npm run tunnel` | Open an ngrok tunnel from `localhost:3001` to a public URL |
| `npm test` | Run the multi-tenant isolation test suite |

## 📝 License

Private — all rights reserved.
