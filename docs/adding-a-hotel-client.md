# Adding a Hotel Client — Step-by-Step

This guide assumes your agency is on **Facebook Pixel mode** (`NEXT_PUBLIC_TRACKING_MODE=pixel`). FB Pixel handles website tracking; HotelTrack pulls Meta KPIs hourly and organic Instagram metrics every 6 hours.

---

## Before you start — what you'll need per hotel

| What | Notes |
|---|---|
| **Hotel name + website URL** | Their primary booking site |
| **A contact person** at the hotel (name + email) | For setup coordination + the share link |
| **Access to install scripts on the website** | Either the hotel's developer or marketing/CMS admin |
| **The hotel's Meta ad account ID** (`act_…`) | From Meta Ads Manager → top-left account selector |
| Hotel's **Instagram = Business / Creator** account, **linked to a Facebook Page** | Required only if you want organic IG metrics |
| Admin/editor on that **Facebook Page** | So your Meta token can read its IG |

You should already have the **Meta Ads connection set up at the agency level** (`/agency/settings`). If not, do that first — paste a Meta access token with `ads_read` scope.

---

## Step 1 — Add the hotel in HotelTrack

1. Sign in → top-right "Add Hotel Client" → or go to **`/agency/hotels/new`**
2. Fill in:
   - **Hotel name** — e.g. `Seaside Resort`
   - **Website URL** — `https://seasideresort.com`
   - **Contact name** + **Contact email**
   - **How is a booking confirmed?** → Pick "Redirects to a new page" and enter the thank-you URL pattern (e.g. `/booking/confirmation`). *Note: in Pixel mode HotelTrack doesn't watch the site directly, but this metadata stays on file for the day you ever switch to HotelTrack mode.*
3. Click **Create hotel client** → you land on the hotel's setup page (`/agency/hotels/[id]/setup`).

---

## Step 2 — Install Facebook Pixel on the hotel's website

Done **once per hotel**, in Meta Events Manager — not in HotelTrack.

1. Go to **Meta Events Manager** → `Data sources` → `+ Connect data source` → `Web` → `Meta Pixel` → name it after the hotel (e.g. `Seaside Resort Pixel`) → enter the website URL.
2. Choose **"Install code manually"** to get the Pixel base code (one `<script>` block, ~10 lines).
3. Send the snippet to the hotel's developer with these instructions:
   - Paste it **just before `</head>`** on **every page** of the website.
   - On the **booking confirmation page**, fire a standard **`Purchase`** event with `value` (the booking amount) + `currency` (e.g. `INR`):
     ```js
     fbq('track', 'Purchase', { value: 12500, currency: 'INR' });
     ```
   - Deploy.
4. In Meta Events Manager → **Test Events** tab → make a test booking → verify both `PageView` and `Purchase` events appear in real time.

That's the entirety of website tracking. From here on, everything Pixel-related lives in Meta's tools.

---

## Step 3 — Map the hotel's ad account in HotelTrack

So `/api/meta/sync` (hourly) knows which ad account belongs to which hotel.

1. Go to **`/agency/settings`**
2. Scroll to **"Map ad accounts to hotels"**
3. Find the new hotel in the list → from the dropdown, pick its `act_…` ad account → save
4. (Optional) Trigger an immediate sync from your machine to test:
   ```powershell
   $secret = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' -SimpleMatch).Line -replace '^CRON_SECRET=', ''
   Invoke-RestMethod -Uri "http://localhost:3001/api/meta/sync" -Headers @{ Authorization = "Bearer $secret" }
   ```
   Otherwise, just wait for the next top of the hour.

---

## Step 4 — Connect organic Instagram *(optional)*

Skip if the hotel doesn't have a Business/Creator IG or you don't care about organic metrics.

1. Open the hotel's setup page → **`/agency/hotels/[id]/setup`** → scroll to **"Instagram (organic social)"**
2. Generate a Meta access token (Meta Graph API Explorer → select your app → Get User Access Token) with these scopes:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
3. Paste the token (starts with `EAA…`) → click **Find Instagram accounts**
4. Pick the right IG account for this hotel → **Connect Instagram**
5. Click **Sync insights now** (or wait for the 6-hourly cron). Followers, reach, posts will appear.

---

## Step 5 — Set up influencer collabs *(optional)*

Coupon-redemption attribution still works in Pixel mode, since redemptions are logged manually rather than from website events.

1. Go to **`/agency/content/new`**
2. Select the hotel → set **Content type = `Influencer collab`** → enter:
   - Influencer name
   - Coupon code (e.g. `JANE10-SEA`)
3. Generate the tracked link → hand the link AND the coupon code to the influencer.
4. When guests redeem the coupon, log each redemption in the database (via Prisma Studio or a future admin UI) — these will show in the **"Influencer impact"** section of the hotel dashboard.

---

## Step 6 — Verify everything works

Open the hotel dashboard at **`/agency/hotel/[id]`** and check:

| Section | What to expect (Pixel mode) |
|---|---|
| **Paid ads performance** | Within 1 hour of the cron firing, you should see Meta ad spend, Bookings from ads, and Meta ROAS for the hotel |
| **Social media performance** | If you connected IG: follower count, reach, post engagement (within 6 hours of connect) |
| **Influencer impact** | Empty until you log redemptions |
| **Share with the hotel** | Generates a read-only public link for the hotel owner |

If Meta data is still 0 after an hour:
- Confirm the ad account mapping in `/agency/settings`
- Confirm the Pixel is firing in Meta Events Manager → Test Events
- Manually trigger `/api/meta/sync` (see Step 3.4)

---

## Step 7 — Give the hotel owner a read-only view

1. On the hotel dashboard, scroll to **"Share with the hotel"**
2. Click **Generate share link** → optionally set an expiry + password
3. Copy the link → send to the hotel contact via email/WhatsApp
4. They open it on phone or desktop — no login required, view-only.

---

## What still doesn't work in Pixel-only mode

These all depend on the HotelTrack JS snippet writing `TrackingEvent` rows. To enable them, install both Pixel + HotelTrack snippet and set `NEXT_PUBLIC_TRACKING_MODE=hoteltrack`:

- "Which Instagram post drove this booking" (per-content attribution)
- Content Library Clicks / Visits / Bookings columns
- Hotel dashboard's top KPI row (Visits, Bookings, Revenue, Cost/booking, Overall ROAS)
- Hotel dashboard's **Content performance** table
- Paid ads section's **True ROI** card + **Campaign breakdown** sub-table
- Agency dashboard's **Revenue & bookings** chart, **Revenue by hotel** chart, **Traffic by source** donut

For now, that level of detail lives in **Meta Ads Manager** (per-ad performance) and **Meta Events Manager** (Pixel-level events).

---

## Quick checklist per new hotel

```
□ Step 1 — Create hotel in HotelTrack
□ Step 2 — Hand FB Pixel snippet + Purchase event spec to hotel's dev → verify in Events Manager
□ Step 3 — Map hotel to its Meta ad account in /agency/settings
□ Step 4 — (Optional) Connect Instagram on setup page
□ Step 5 — (Optional) Create influencer content pieces with coupon codes
□ Step 6 — Test booking → verify Meta data lands within 1h
□ Step 7 — Generate share link → send to the hotel owner
```
