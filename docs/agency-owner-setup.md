# Agency Owner — First-Time Setup

What an **agency owner** does the very first time they sign up. After this is done, follow `docs/adding-a-hotel-client.md` for every hotel you onboard.

If you're the platform owner (super admin), some steps are different — see "Platform owner notes" at the end.

---

## Before you start

| What | Why |
|---|---|
| **An email address** for the agency account | Becomes your Clerk login |
| **A credit card** (after the demo period) | For Stripe subscription |
| **A Meta access token with `ads_read`** | To pull paid-ad spend + ROAS per hotel |
| **(Per hotel)** A separate Meta token with IG scopes — `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` | Only if you want organic IG metrics. Optional. |

---

## Step 1 — Create your HotelTrack account

1. Open the app (e.g. `http://localhost:3001` locally, or your production domain)
2. Click **Sign up** (top right)
3. Enter your email + a password → verify email
4. You'll land on the onboarding page

## Step 2 — Name your agency

1. Onboarding asks: **"What's your agency called?"**
2. Type the agency name (e.g. `Coastal Digital`) → submit
3. This creates:
   - An `Agency` record with you as `admin`
   - Your Clerk role set to `agency_admin` (so middleware lets you into `/agency/*`)
4. You land on `/agency/dashboard` — empty for now

## Step 3 — Pick a subscription plan

1. Top nav → **Billing**
2. You'll see the four plans (Starter / Growth / Pro / Enterprise) with their hotel-client limits + price
3. Click **Subscribe** on the plan you want → you're redirected to Stripe Checkout
4. Enter card details → complete payment
5. You're redirected back. The Stripe webhook flips your `subscriptionStatus` to `active` — usually within a few seconds. If it stays "inactive" after a minute, check `docs/deploying-to-vercel.md` Troubleshooting → webhook issues

## Step 4 — Connect Meta Ads (agency-level)

This is the one Meta connection your agency uses for **all** of its hotel clients' paid-ad data. You'll map specific ad accounts to specific hotels later.

### Get the token
1. Open [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your Meta Developer app from the top dropdown
3. Click **Get Token → Get User Access Token**
4. Tick the `ads_read` permission
5. Click **Generate Access Token** → log in to your Meta account → copy the token (starts with `EAA…`)
6. *(Recommended for production)* Extend the token to long-lived: in the same tool, paste it into the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) → Extend Access Token. Or use a Meta System User from Business Manager — those tokens are non-expiring by design.

### Connect it in HotelTrack
1. Top nav → **Settings**
2. **"Meta Ads connection"** section → paste the token → **Connect Meta**
3. Token is encrypted with AES-256-GCM before storage; it's never sent back to your browser or logged
4. You'll see your ad accounts listed (this confirms the token works)

You can now add hotel clients and map each to its `act_…` ad account.

## Step 5 — *(Optional)* Configure alerts

The platform sends email alerts when something interesting happens (e.g. a hotel's bookings spike or drop sharply).

1. Top nav → **Alerts**
2. Create the alert rules you want (e.g. "tell me when any hotel's daily bookings drop > 50% vs the 7-day average")
3. Alerts run inside the daily Meta sync cron and email via Resend

## Step 6 — Add your first hotel client

See **`docs/adding-a-hotel-client.md`** for the full per-hotel walkthrough.

Repeat that flow for every hotel you onboard.

---

## Switching tracking mode (advanced)

HotelTrack has two website-tracking modes, controlled by `NEXT_PUBLIC_TRACKING_MODE`:

| Mode | What you install on hotel sites | What's visible in the UI |
|---|---|---|
| `hoteltrack` *(default — recommended)* | Both Meta Pixel + the HotelTrack snippet | Everything: attribution dashboards, content performance, Meta ROAS |
| `pixel` | Meta Pixel only | Only Paid Ads (Meta-reported) + organic IG + influencer coupons. Attribution UI hidden. |

To switch, change the env var (locally in `.env.local`, in production in Vercel/Render env vars) and **rebuild** — `NEXT_PUBLIC_*` is inlined at build time.

---

## Platform owner (super admin) notes

If you're the person running the whole HotelTrack platform (not a paying agency):

1. **Sign up like any agency owner** first — go through Steps 1–2 above
2. Then promote your account to platform super admin:
   ```powershell
   npm run set:super-admin -- you@example.com
   ```
3. Sign out and back in (so the new role lands in your Clerk session token)
4. Now you can open `/admin` → see every agency, suspend agencies, etc.

This is also how you'd attach yourself to the seeded demo agency for testing:
```powershell
npm run seed                         # seeds Coastal + Mountain demo agencies
# (then sign in once so you're in the database)
npm run attach:member -- you@example.com   # attaches you to Coastal as admin
```

---

## Quick checklist for the agency owner

```
□ Sign up + verify email
□ Name your agency in onboarding
□ Pick a plan + complete Stripe Checkout → subscriptionStatus = active
□ Settings → connect Meta Ads with an ads_read token
□ (Optional) Set up Alerts rules
□ Add first hotel client → docs/adding-a-hotel-client.md
```

Total time: ~15 minutes (excluding waiting on Meta token generation).
