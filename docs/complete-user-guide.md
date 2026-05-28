# HotelTrack — Complete User Guide

Everything every role needs to know to use the platform — from the person who runs HotelTrack itself, down to the hotel owner who only sees a read-only dashboard.

---

## Table of contents

1. [What HotelTrack is](#1-what-hoteltrack-is)
2. [The three roles + their relationships](#2-the-three-roles--their-relationships)
3. [Tracking — Pixel, snippet, or both?](#3-tracking--pixel-snippet-or-both)
4. [Role 1 — Super Admin (Platform Owner)](#4-role-1--super-admin-platform-owner)
5. [Role 2 — Agency Owner (Paying Customer)](#5-role-2--agency-owner-paying-customer)
6. [Role 3 — Hotel Owner / Hotel Client (View-only)](#6-role-3--hotel-owner--hotel-client-view-only)
7. [Cross-references](#7-cross-references)

---

## 1. What HotelTrack is

HotelTrack is a multi-tenant SaaS for **marketing agencies that manage hotel clients**. It proves that the agency's content (organic Instagram posts, paid Meta ads, influencer collaborations) drives **real bookings on the hotel's own website** — closing the loop from *content → visit → booking → revenue*, plus Meta ad ROI.

In one sentence: **an agency uses HotelTrack to show their hotel client exactly which marketing efforts produced paying guests.**

---

## 2. The three roles + their relationships

| Role | Who they are | What they pay for | Access scope |
|---|---|---|---|
| **Super Admin** | The platform owner (you, the person running HotelTrack itself) | Nothing — they own the platform | Sees every agency, every hotel, every dollar |
| **Agency Owner** | A paying marketing agency | Monthly subscription via Stripe | Only their own agency's hotels + data |
| **Hotel Owner / Hotel Client** | The hotel the agency manages | Nothing — the agency pays | Only their own hotel's data, view-only, via a share link |

```
Super Admin (1 person — runs HotelTrack itself)
   └── Agencies (N — they sign up and pay)
         └── Hotel Clients (N per agency — the actual hotels)
               └── Hotel Owner (sees their own dashboard via share link)
```

---

## 3. Tracking — Pixel, snippet, or both?

Before getting into roles, understand how website tracking works. HotelTrack supports two trackers; the agency picks which to install on their hotels' websites:

| Mode (env flag `NEXT_PUBLIC_TRACKING_MODE`) | What's installed on hotel sites | What you get |
|---|---|---|
| `hoteltrack` **(default — recommended)** | **Both** Meta Pixel + HotelTrack snippet | Meta's ad optimization & ROAS + HotelTrack's per-content attribution dashboards |
| `pixel` | Meta Pixel only | Meta ad reporting only; HotelTrack's attribution dashboards sit empty |

The default is `hoteltrack` (dual install). Everything below assumes dual mode unless flagged otherwise.

---

## 4. Role 1 — Super Admin (Platform Owner)

### Who you are
The person running HotelTrack itself — typically the founder / dev who set it up. You don't pay a subscription; you are the platform.

### What you can do
- See every agency that has signed up (`/admin`)
- Suspend an agency (blocks them from `/agency/*` regardless of billing)
- Onboard yourself to any agency as `agency_admin` for hands-on debugging
- Manage env vars, deploys, the database

### What you need

| Requirement | Why |
|---|---|
| GitHub repo of HotelTrack | To deploy |
| Hosting account — **Vercel** or **Render** | Where the app runs |
| Production **PostgreSQL** database (Neon, Supabase, Vercel Postgres, Render Postgres) | Persistence |
| **Clerk** account, **production** instance | Auth |
| **Stripe** account in **live mode** + 4 price IDs | Billing |
| **Meta Developer account** + at least one app | For the agency-level `ads_read` token + per-hotel IG tokens |
| **Resend** account + verified sender domain | Alert emails |
| A domain name (optional but recommended) | For the tracking snippet URL |

### Step-by-step setup

#### A) Deploy the platform (one-time)
Pick **one** of the deployment docs and follow it end-to-end:
- `docs/deploying-to-vercel.md` — easier for hobbyists, faster cold starts, cron limited on Hobby plan
- `docs/deploying-to-render.md` — better for persistent connections, transparent pricing, ~$15-20/mo

Both walk through: provision Postgres → set env vars → deploy → wire up Stripe webhook → set up cron jobs → custom domain.

#### B) Create your account
1. Open the deployed app → **Sign up**
2. Verify email
3. Complete onboarding (give yourself an agency name — you'll use this account as your debugging tenant)

#### C) Promote yourself to super admin
From your local machine, pointed at the **production** database:
```powershell
$env:DATABASE_URL = "postgres://...prod URL..."
npm run set:super-admin -- you@example.com
```
Sign out + back in so the new role lands in your Clerk session token.

#### D) Verify access
- Open `/admin` → should see your agency listed (and any others if multiple have signed up)
- You can now suspend / unsuspend any agency, view aggregate platform metrics

#### E) Day-to-day responsibilities
- Monitor Vercel / Render logs for errors
- Watch the Stripe dashboard for failed payments / churn
- Run `npm test` before every release (cross-agency isolation test)
- Rotate the Meta access token before it expires (long-lived tokens last ~60 days)

### Super-admin pre-launch checklist
```
□ Deploy doc completed (Vercel or Render) end-to-end
□ Custom domain pointed at the deploy, SSL active
□ Production Postgres provisioned + prisma migrate deploy succeeded
□ All env vars set (DATABASE_URL, ENCRYPTION_KEY, CRON_SECRET, Clerk live keys, Stripe live keys, Resend)
□ Stripe webhook live + STRIPE_WEBHOOK_SECRET set
□ Cron jobs visible & test-fire OK
□ Clerk session token includes the `metadata` claim
□ npm test passes (7/7 isolation tests)
□ Your super-admin role granted + /admin accessible
□ Sent yourself a test alert email → arrived
```

---

## 5. Role 2 — Agency Owner (Paying Customer)

### Who you are
The marketing agency owner who pays for HotelTrack and uses it to track results for their hotel clients.

### What you can do
- Sign up + onboard your agency
- Pay a monthly subscription
- Add unlimited hotel clients (within your plan's limit)
- Connect Meta Ads + organic Instagram per hotel
- Create UTM-tagged content links for every post / ad
- See per-hotel and agency-wide dashboards with charts + KPIs
- Export everything to Excel or CSV
- Generate read-only share links for each hotel owner
- Configure alerts (e.g. "tell me when any hotel's bookings drop > 50%")

### What you need

| Requirement | Why |
|---|---|
| **An email** for your agency account | Becomes your Clerk login |
| **A credit card** (after free demo period if any) | For Stripe subscription |
| **A Meta access token with `ads_read`** | One per agency, for paid-ad data across all hotels |
| **(Per hotel)** A separate Meta token with IG scopes — `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` | Only if you want organic IG metrics for that hotel |
| **(Per hotel)** The hotel's Meta ad account ID (`act_…`) | To map paid spend / ROAS to the right hotel |
| **(Per hotel)** Access to install scripts on the hotel's website | Or coordinate with the hotel's developer |

### Step-by-step setup — INITIAL (one-time)

#### Step 1: Sign up
1. Open the HotelTrack URL (e.g. `https://your-domain.com`)
2. Click **Sign up** (top right)
3. Enter email + password → verify email

#### Step 2: Onboarding — name your agency
1. The onboarding page asks **"What's your agency called?"**
2. Type the agency name → submit
3. This creates an `Agency` record with you as `admin`, sets your Clerk role to `agency_admin`

#### Step 3: Pick a plan + pay
1. Top nav → **Billing**
2. Compare plans (Starter / Growth / Pro / Enterprise) by hotel-client limit + price
3. Click **Subscribe** on the plan you want → Stripe Checkout opens
4. Enter card → complete payment
5. Stripe webhook flips `subscriptionStatus` to `active` (a few seconds). If it stays `inactive` for > 1 min, the webhook isn't wired correctly — contact the super admin

#### Step 4: Connect Meta Ads (agency-level)
This is the one Meta connection your agency uses for **all** hotels' paid-ad data.

To get the token:
1. Open [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your Meta Developer app from the top dropdown
3. Click **Get Token → Get User Access Token**
4. Tick the `ads_read` permission
5. Click **Generate Access Token** → log into Meta → copy the token (starts with `EAA…`)
6. *(Recommended for production)* Extend the token to long-lived: paste into [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) → Extend Access Token. Or use a Meta System User from Business Manager for a non-expiring token.

To connect it in HotelTrack:
1. Top nav → **Settings**
2. **"Meta Ads connection"** section → paste the token → **Connect Meta**
3. Token is encrypted with AES-256-GCM before storage; never sent back to your browser
4. Your ad accounts list appears, confirming the token works

#### Step 5 *(optional)*: Configure alerts
1. Top nav → **Alerts**
2. Create alert rules (e.g. "any hotel's daily bookings drop > 50%")
3. Alerts fire inside the daily Meta sync cron and email via Resend

### Step-by-step — PER NEW HOTEL CLIENT

Run this once for **each** new hotel you onboard. Total time: ~30-45 min on your side, plus the hotel dev's time to paste snippets.

#### Step 6: Create the hotel
1. Top nav → **Hotel Clients** → **+ Add Hotel Client**
2. Fill in:
   - Hotel name (e.g. `Seaside Resort`)
   - Website URL (`https://seasideresort.com`)
   - Contact name + contact email
   - **How is a booking confirmed?**
     - **Redirects to a new page** — pattern like `/booking/confirmation` (wildcards allowed)
     - **Shows confirmation on same page** — a unique success phrase or CSS selector
     - **Both / not sure** — fill in both options
3. Submit → you land on the hotel's setup page

#### Step 7: Install BOTH trackers on the hotel website
This is the most important step. Two snippets go into `<head>` of every page; they don't conflict.

##### 7a — HotelTrack snippet (from the setup page)
1. Scroll to **"Install the tracking snippet"**
2. Copy the one-line `<script>`:
   ```html
   <script src="https://your-domain.com/t.js?id=site_xxxxxx" async></script>
   ```

##### 7b — Meta Pixel (from Meta Events Manager)
1. Open [Meta Events Manager](https://business.facebook.com/events_manager2)
2. **+ Connect data source → Web → Meta Pixel** → name it after the hotel → enter URL
3. Choose **Install code manually** → copy the ~10-line `<script>` block

##### 7c — Hand BOTH to the hotel's developer
Tell them to paste both blocks just before `</head>` on **every page**:
```html
<head>
  <!-- ...hotel's own meta tags, fonts, CSS... -->

  <!-- Meta Pixel -->
  <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'YOUR_PIXEL_ID');
    fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/></noscript>
  <!-- End Meta Pixel -->

  <!-- HotelTrack -->
  <script src="https://your-domain.com/t.js?id=site_xxxxxx" async></script>
</head>
```

##### 7d — Add Purchase event on booking confirmation page (Pixel only)
HotelTrack auto-detects bookings via the conversion method (Step 6). Meta Pixel needs an explicit call **on the confirmation page only**:
```html
<script>
  fbq('track', 'Purchase', { value: 12500, currency: 'INR' });
</script>
```
…where `12500` is filled in by the hotel's templating engine with the actual booking amount.

#### Step 8: Map the hotel to its Meta ad account
1. Top nav → **Settings**
2. **"Map ad accounts to hotels"** section → find this hotel → pick its `act_…` from the dropdown → save
3. The hourly cron now pulls spend / ROAS / conversions for this hotel

Skip if the hotel doesn't run paid Meta ads — the Paid Ads section of their dashboard will just sit empty.

#### Step 9 *(optional)*: Connect organic Instagram
Skip if the hotel doesn't have a Business/Creator IG, or you don't care about organic metrics.

1. Back on the hotel's setup page → scroll to **"Instagram (organic social)"**
2. Generate a fresh Meta access token with **all four** of these scopes:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
3. Paste the token → **Find Instagram accounts**
4. Pick the right IG account for this hotel → **Connect Instagram**
5. **Sync insights now** (or wait for the 6-hourly cron)

#### Step 10: Create UTM-tagged content pieces
This is what powers "which Instagram reel drove this booking" attribution.

For **every** post / reel / ad / story you publish for this hotel:
1. Top nav → **Content** → **+ New Content Piece**
2. Select this hotel
3. Title (e.g. `Sunset Rooftop Reel`)
4. Content type: Organic / Paid ad / Influencer collab / Story
5. Platform: Instagram / Facebook / YouTube
6. Destination URL (where the link lands — usually a room or booking page)
7. *(Influencer collab only)* Influencer name + coupon code
8. Click **Generate tracked link**

You get a URL like:
```
https://seasideresort.com/rooms?utm_source=instagram&utm_medium=organic&utm_campaign=sunset-rooftop-reel&utm_content=ht-abc123&utm_term=agency_xyz
```

**Use that link in the post** — Instagram bio link, Linktree, story link sticker, ad destination URL, influencer caption.

#### Step 11: Verify everything works
1. **Snippet status:** `/agency/hotels` → status badge flips to `live` within seconds of first visit
2. **Test booking:** open the website in incognito via a UTM link → complete a booking → within seconds, hotel dashboard KPIs increment; Meta Events Manager → Test Events → shows the events
3. **Meta data lands in ~1 hour:** Paid Ads section populates after the next cron run
4. **IG data lands in ~6 hours:** Social Media section populates after the next cron run (or click Sync insights now)

#### Step 12: Generate a read-only share link for the hotel owner
1. On the hotel dashboard → scroll to **"Share with the hotel"**
2. Click **Generate share link**
3. *(Optional)* Set expiry + password
4. Copy the `https://your-domain.com/share/<uuid>` link → send to the hotel contact

### Agency owner daily / weekly workflow
- **Daily:** glance at agency dashboard for KPI changes; check Alerts inbox
- **Weekly:** export the per-hotel report as PDF / Excel from the hotel dashboard → email to each hotel owner; review content performance and double-down on top performers
- **Monthly:** review your subscription usage (hotel count vs plan limit) under Billing

### Agency owner pre-onboarding checklist (per hotel)
```
□ Step 6  — Create hotel in HotelTrack with correct conversion method
□ Step 7a — Copy HotelTrack snippet from setup page
□ Step 7b — Create Meta Pixel in Events Manager → copy base code
□ Step 7c — Hand BOTH snippets to hotel dev → in <head> of every page
□ Step 7d — fbq('Purchase') on the booking confirmation page
□ Step 8  — Map hotel to its Meta ad account
□ Step 9  — (Optional) Connect Instagram
□ Step 10 — Create content pieces with tracked links for every post/ad
□ Step 11 — Test booking → verify both Meta + HotelTrack capture it
□ Step 12 — Generate share link → send to hotel owner
```

---

## 6. Role 3 — Hotel Owner / Hotel Client (View-only)

### Who you are
The hotel that the marketing agency is managing. The agency does the work; you see the results.

### What you can do
- **View** your hotel's marketing dashboard via a private read-only share link the agency sends you
- See visits, bookings, revenue per content piece
- See paid-ad ROAS, organic Instagram growth, influencer coupon performance
- Open on phone or desktop — **no login required**, no app to install
- The link can have a password and an expiry date

### What you can't do
- Edit any data
- See other hotels (not even other hotels managed by the same agency)
- Add content, change settings, etc.

### What you need

| Requirement | Why |
|---|---|
| **The share link from your agency** | That's how you access the dashboard |
| **(Optional) Password** the agency set on the link | They'll send it separately |
| A modern browser | Anything from the last 3 years works |

If you're the **hotel's web admin / developer**, you may also be asked to:
| | |
|---|---|
| Paste **two `<script>` tags** in `<head>` of every page | What enables the tracking. The agency sends them — one is the HotelTrack snippet, one is the Meta Pixel |
| Add an `fbq('Purchase', { value, currency })` call on the booking confirmation page | What tells Meta a booking happened |
| (One-time) Upgrade your IG to **Business** account + link to a Facebook Page | If the agency wants to track organic IG performance |

### Step-by-step — opening your dashboard for the first time

#### Step 1: Receive the share link from the agency
The agency sends an email / message with a link like:
```
https://your-domain.com/share/a1b2c3-...-z7y8w9
```
Plus (optionally) a password.

#### Step 2: Open the link
- Tap or click → the dashboard loads in your browser
- If password-protected, enter it once → the browser remembers for up to 30 days (per device)
- The link works on any device — no signup, no app

#### Step 3: Read the dashboard
You'll see (depending on what the agency set up):
- **KPI cards** at the top — total visits, bookings, revenue, cost per booking, ROAS over the selected date range
- **Content performance** — which Instagram posts, ads, and influencer collabs drove the most bookings
- **Paid ads performance** — Meta spend, conversions, ROAS by campaign
- **Social media performance** — organic Instagram follower growth + top posts
- **Influencer impact** — coupon redemptions per influencer

Use the **date range selector** at the top to compare time windows.

#### Step 4: Refresh
- Bookings appear within a minute of happening
- Meta ad data refreshes hourly
- Organic Instagram data refreshes every 6 hours

#### Step 5: (Web admin only) If asked to install tracking
Your agency may send you the two `<script>` tags. Paste both into `<head>` of every page of your website (homepage, room pages, booking flow, confirmation page). On the confirmation page, also add an `fbq('Purchase')` call with the booking value. See Step 7 of Role 2 above for the exact HTML.

### Hotel owner FAQ

**Q: Will this slow down my website?**
A: No. The HotelTrack snippet is ~2 KB and loads `async` — it never blocks the page. Meta Pixel is similar.

**Q: Does this collect guest personal data?**
A: No. The HotelTrack snippet captures only UTM campaign params + page URL + an anonymous session ID. No names, emails, or form contents. Meta Pixel may collect more depending on what you fire — talk to the agency about Pixel privacy settings if it matters.

**Q: What if I lose the link?**
A: Contact your agency — they can revoke + regenerate it.

**Q: Why is my dashboard empty?**
A: Either no traffic yet, or the snippets haven't been installed. Confirm with the agency that the test booking they ran appeared.

---

## 7. Cross-references

- **`docs/agency-owner-setup.md`** — short version of Role 2's initial setup
- **`docs/adding-a-hotel-client.md`** — the per-hotel onboarding (Steps 6-12 above, expanded)
- **`docs/deploying-to-vercel.md`** — for the super admin's initial deploy
- **`docs/deploying-to-render.md`** — alternative platform deploy
- **`README.md`** — overview + how to run locally
- **`CLAUDE.md`** — project bible (multi-tenancy invariant, security rules)

---

## Appendix — Tracking mode decision tree

```
Do you want HotelTrack's "which Instagram reel drove this booking" attribution?
│
├── YES (default, recommended)
│   └── Install BOTH Meta Pixel + HotelTrack snippet
│       Env: NEXT_PUBLIC_TRACKING_MODE=hoteltrack
│       UI: All dashboards visible
│
└── NO (Meta ad reporting is enough)
    └── Install Meta Pixel only
        Env: NEXT_PUBLIC_TRACKING_MODE=pixel
        UI: Attribution sections hidden, FB Pixel install instructions shown
```

To switch modes: change `NEXT_PUBLIC_TRACKING_MODE` in `.env.local` (local) or in Vercel / Render env vars (prod) → **rebuild** (NEXT_PUBLIC_* is inlined at build time) → restart.

---

*Document generated 2026-05-28. For the latest version, see the GitHub repo.*
