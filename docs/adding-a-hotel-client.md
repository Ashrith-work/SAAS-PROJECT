# Adding a Hotel Client — Step-by-Step

For an agency owner who has finished `docs/agency-owner-setup.md`. Run this whole flow once per new hotel.

This guide assumes you're on **dual-tracking mode** (`NEXT_PUBLIC_TRACKING_MODE=hoteltrack`), so both the HotelTrack snippet and Meta Pixel go on each hotel's site. If you're on Pixel-only mode, the snippet-install steps below are skipped — see the "Pixel-only mode" callout at the end.

---

## Before you start — what you'll need per hotel

| What | Notes |
|---|---|
| **Hotel name + website URL** | Their primary booking site |
| **A contact person** at the hotel (name + email) | For setup coordination + the share link |
| **Access to install scripts on the website** | Either the hotel's developer or marketing/CMS admin |
| **The hotel's Meta ad account ID** (`act_…`) | From Meta Ads Manager → top-left account selector. Only needed if the hotel runs paid ads. |
| Hotel's **Instagram = Business / Creator** account, **linked to a Facebook Page** | Required only if you want organic IG metrics |
| **A Meta access token with the 4 IG scopes** (per-hotel, separate from the agency-level `ads_read` token) | Required only for organic IG |

---

## Step 1 — Create the hotel in HotelTrack

1. Top nav → **Hotel Clients** → top-right **Add Hotel Client** (or open `/agency/hotels/new`)
2. Fill in:
   - **Hotel name** — e.g. `Seaside Resort`
   - **Website URL** — `https://seasideresort.com`
   - **Contact name** + **Contact email**
   - **How is a booking confirmed?** (this controls how the HotelTrack snippet auto-detects a booking — see options below)
3. Click **Create hotel client** → you land on the hotel's setup page

### Conversion method options
| Choice | When to pick it | What to fill in |
|---|---|---|
| **Redirects to a new page** | The booking flow ends on a `/thank-you` or `/confirmation` URL | The path pattern, e.g. `/booking/confirmation`. Wildcards (`*`) allowed. |
| **Shows confirmation on same page** | A success message appears without the URL changing | A unique success phrase that only appears on success (e.g. `"Your booking is confirmed"`) **and/or** a CSS selector (`#booking-success`) |
| **Both / not sure** | When you don't know yet, or both happen | Fill in both — the snippet watches URL first, falls back to the page text |

---

## Step 2 — Install BOTH tracking snippets on the hotel website

Two trackers go in the `<head>` of every page. They don't conflict — different cookies, different endpoints. Why both?

| What you get from… | Meta Pixel | HotelTrack | Both (recommended) |
|---|---|---|---|
| Meta ad optimization & retargeting audiences | ✅ | ❌ | ✅ |
| Meta-reported ROAS in Ads Manager | ✅ | ❌ | ✅ |
| "Which Instagram reel drove this booking" | ❌ | ✅ | ✅ |
| Cross-platform content attribution dashboard | ❌ | ✅ | ✅ |
| Per-content Clicks / Visits / Bookings | ❌ | ✅ | ✅ |
| Influencer coupon redemptions tied to content | ❌ | ✅ | ✅ |

### 2a — Grab the HotelTrack snippet
1. You're already on `/agency/hotels/[id]/setup`
2. Scroll to **"Install the tracking snippet"** → copy the one-line `<script>`. It looks like:
   ```html
   <script src="https://your-domain.com/t.js?id=site_xxxxxx" async></script>
   ```
3. Note the **Site ID** shown below the snippet — you'll need this for debugging later

### 2b — Create the Meta Pixel (in Meta Events Manager, not HotelTrack)
1. Open [Meta Events Manager](https://business.facebook.com/events_manager2)
2. **+ Connect data source** → **Web** → **Meta Pixel** → name it after the hotel (e.g. `Seaside Resort Pixel`) → enter the website URL
3. Choose **"Install code manually"** to get the Pixel base code — a ~10-line `<script>` block ending in `fbq('init', 'YOUR_PIXEL_ID')` and `fbq('track', 'PageView')`
4. Copy that block (keep the `YOUR_PIXEL_ID` value — you'll need it for the Purchase event too)

### 2c — Hand both to the hotel's developer
Tell them to paste both blocks just before `</head>` on **every page** of the website. Order doesn't matter. Final HTML looks like this:

```html
<head>
  <!-- ...the hotel's own meta tags, fonts, CSS... -->

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

### 2d — Fire the booking-confirmation event for Meta Pixel
HotelTrack auto-detects conversions from the **conversion method** you picked in Step 1. Meta Pixel does **not** — it needs an explicit `Purchase` event on the booking confirmation page only:

```html
<script>
  fbq('track', 'Purchase', { value: 12500, currency: 'INR' });
</script>
```
…where `12500` is filled in dynamically by the hotel's templating engine with the actual booking value.

---

## Step 3 — Map the hotel to its Meta ad account

So `/api/meta/sync` (hourly) knows which ad account belongs to which hotel.

1. Top nav → **Settings**
2. Scroll to **"Map ad accounts to hotels"**
3. Find this hotel → from the dropdown, pick its `act_…` ad account → save
4. *(Optional)* Trigger an immediate sync from your machine to verify the link works:
   ```powershell
   $secret = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' -SimpleMatch).Line -replace '^CRON_SECRET=', ''
   Invoke-RestMethod -Uri "http://localhost:3001/api/meta/sync" -Headers @{ Authorization = "Bearer $secret" }
   ```
   Otherwise, just wait for the next top of the hour.

If the hotel doesn't run paid Meta ads, skip this step — but the "Paid ads performance" section of their dashboard will be empty.

---

## Step 4 — Connect organic Instagram *(optional)*

Skip if the hotel doesn't have a Business/Creator IG, or you don't care about organic metrics.

1. Back on the hotel's setup page → scroll to **"Instagram (organic social)"**
2. In a new tab, generate a Meta access token with **all four** of these scopes:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
3. Back in HotelTrack → paste the token (starts with `EAA…`) → click **Find Instagram accounts**
4. The app calls Meta and lists every Business IG account on any FB Page the token can access
5. Pick the right IG account for this hotel → **Connect Instagram**
6. Click **Sync insights now** (or wait for the 6-hourly cron). Followers, reach, posts will appear.

---

## Step 5 — Set up content pieces with tracked links

This is what powers the "which Instagram reel drove these bookings" attribution.

For **every** post / reel / ad / story you publish for this hotel:

1. Top nav → **Content** → **+ New Content Piece** (or open `/agency/content/new`)
2. Select this hotel
3. Title — becomes the campaign name in the link (e.g. `Sunset Rooftop Reel` → `sunset-rooftop-reel`)
4. Content type: `Organic post` / `Paid ad` / `Influencer collab` / `Story`
5. Platform: Instagram / Facebook / YouTube
6. Destination URL — where the link lands (usually a room page or booking page)
7. *(Influencer collab only)* — Influencer name + coupon code
8. Click **Generate tracked link**

You get a UTM-tagged URL like:
```
https://seasideresort.com/rooms?utm_source=instagram&utm_medium=organic&utm_campaign=sunset-rooftop-reel&utm_content=ht-abc123&utm_term=agency_xyz
```

**Use that link in the post** — Instagram bio link, Linktree, story link sticker, ad destination URL, influencer caption. Every visit and booking from that link gets credited to this content piece.

---

## Step 6 — Verify everything works

Open the hotel dashboard at `/agency/hotel/[id]` and check each section.

### Snippet status
- `/agency/hotels` → the snippet status badge for this hotel should be **`live`** within seconds of the first real visit
- If it stays `not_installed`: the HotelTrack `<script>` tag isn't on the page, or it's loading after the user navigates away

### Make a test booking
1. Open the hotel's website in incognito → with a UTM-tagged URL (Step 5)
2. Complete a booking end-to-end
3. Within seconds, the hotel dashboard's top KPIs (Visits + Bookings + Revenue) should increment
4. The "Content performance" section should attribute the visit + booking to the right content piece
5. Meta Events Manager → **Test Events** tab → should show `PageView` and `Purchase` from your session

### Within ~1 hour, Meta data lands
- "Paid ads performance" section should show spend, conversions, ROAS for any active campaigns on the mapped ad account
- If still empty after an hour: confirm the ad-account mapping in `/agency/settings`, then trigger `/api/meta/sync` manually

### Within ~6 hours, organic Instagram lands
- "Social media performance" section shows followers, reach, top posts
- Or click **Sync insights now** on the setup page for an immediate pull

---

## Step 7 — Give the hotel owner a read-only dashboard

The hotel doesn't need a HotelTrack account — you generate a shareable view-only link.

1. On `/agency/hotel/[id]` → scroll to **"Share with the hotel"**
2. Click **Generate share link**
3. *(Optional)* Set an expiry date + a password
4. Copy the `https://your-domain.com/share/<uuid>` link → send to the hotel contact
5. They open it on phone or desktop — no login required, read-only

You can revoke / regenerate the link any time. Track view counts + last-viewed timestamp on the same panel.

---

## Quick checklist per new hotel

```
□ Step 1 — Create hotel in HotelTrack (correct conversion method)
□ Step 2a — Copy HotelTrack snippet from setup page
□ Step 2b — Create Meta Pixel in Events Manager → copy base code
□ Step 2c — Hand BOTH snippets to hotel's dev → paste in <head> of every page
□ Step 2d — Add fbq('Purchase') on the booking confirmation page
□ Step 3 — Map hotel to its Meta ad account in /agency/settings (if running paid ads)
□ Step 4 — (Optional) Connect Instagram with a 4-scope token
□ Step 5 — Create content pieces with tracked links for every post/ad/collab
□ Step 6 — Test booking end-to-end → verify both Meta + HotelTrack capture it
□ Step 7 — Generate share link → send to hotel owner
```

Total time per hotel: ~30-45 min on your side, plus the hotel dev's time to paste the snippets.

---

## Pixel-only mode (if `NEXT_PUBLIC_TRACKING_MODE=pixel`)

If your env flag is set to `pixel`, the HotelTrack snippet UI is hidden and only Meta Pixel is shown. In that mode:
- Skip Steps 2a and 2c (no HotelTrack snippet)
- Step 5 (UTM-tagged content) still works for influencer coupon tracking, but per-content visit/booking attribution won't populate
- The hotel dashboard's top KPI row + Content Performance section + Agency Dashboard charts will be empty
- See `lib/tracking-mode.ts` and `memory/tracking-mode-pixel-only.md` for the full implications

To switch from pixel-only to dual: set `NEXT_PUBLIC_TRACKING_MODE=hoteltrack` in `.env.local`, rebuild, restart.
