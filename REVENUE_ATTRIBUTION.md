# Revenue Attribution — Revenue by Source

The **Revenue by Source** dashboard section answers: *how much booking revenue
came from each marketing source?* — at three levels of detail, per hotel.

## How it works

When a visitor books, the tracking snippet fires a **conversion** `TrackingEvent`
that already carries:
- the **first-touch UTM** the visitor arrived with (`utmSource`, `utmMedium`,
  `utmCampaign`, `utmContent`, `utmTerm`), and
- the **revenue** (`conversionValue`, `Decimal(12,2)`).

Revenue attribution is a pure **read** over those rows — the conversion-capture
logic (including the SPA race fix) is untouched. Every conversion is attributed by
its stored **first-touch** UTM; the new `TrackingEvent.attributionModel` column
(default `first_touch`) labels this per row so last-touch / U-shaped credit can be
recorded later without a schema change.

## API

```
GET /api/agency/hotels/[hotelId]/revenue-by-source
    ?granularity=source | source_medium | source_medium_campaign   (default source)
    &startDate=YYYY-MM-DD &endDate=YYYY-MM-DD                       (default last 30 days)
    &attributionModel=first_touch | last_touch | u_shaped          (default first_touch)
    &sourceTypes=meta_ads,influencer,…                             (optional chip filter)
```

- **Multi-tenant:** the hotel must belong to the caller's agency. A hotel owned by
  another agency — or a soft-deleted hotel — returns **404** (never 403), so we
  don't leak existence.
- **Response:** `{ granularity, range, groups[], totals, topSource, daily[],
  distinctGroups, truncated }`. Each group has `key`, `source`, `medium`,
  `campaign`, `sourceType` (badge), `bookings`, `revenue`, `averageBookingValue`,
  `percentOfTotal`, and a `sparkline` (daily revenue). `daily[]` is the per-day
  revenue broken down by source type (the stacked chart). Groups are sorted by
  revenue desc and capped at the top 100 (`truncated` + `distinctGroups` tell you
  if there were more).
- `attributionModel` is accepted/validated but only `first_touch` is computed
  today; the response echoes the effective model.

## UTM normalization (`lib/utm-normalize.ts`)

So the same raw UTMs always group together:
- **lower-case + trim** every value;
- empty / null **source** → `direct`;
- empty / null **medium** or **campaign** → `none` (e.g. a direct booking is
  `direct/none`);
- fold common source spellings via `SOURCE_ALIASES`: `ig`/`insta` → `instagram`,
  `fb` → `facebook`, `gads`/`googleads`/`adwords` → `google`, etc.

**To add an alias:** add a lower-cased entry to `SOURCE_ALIASES` (raw value →
canonical source).

## Source-type classification (`lib/source-classifier.ts`)

Each conversion is folded into one coarse category — the basis for the quick-filter
chips. The raw/normalized UTM is still kept for the granular table. Rules (checked
most-specific first, so the result is deterministic):

| Type | Rule |
| --- | --- |
| `direct` | no `utm_source` |
| `meta_ads` | source ∈ {facebook, instagram} **and** medium looks paid (`cpc`/`paid`/`ads`/`ppc`) |
| `google_ads` | source = google **and** paid medium |
| `influencer` | medium = `influencer`, or `utm_content` matches an influencer pattern |
| `instagram_organic` | source = instagram, non-paid medium |
| `facebook_organic` | source = facebook, non-paid medium |
| `email` | source = `email` or `newsletter` |
| `whatsapp` | source = `whatsapp` |
| `other` | anything else |

**To add a new source type:** add it to `SOURCE_TYPES` + `SOURCE_TYPE_LABEL`, give
it a colour in `RevenueBySource.tsx` (`SOURCE_TYPE_COLOR`), and add a branch to
`classifySourceType` **before** the `other` fallback. To recognise more influencer
links, extend `INFLUENCER_CONTENT_PATTERNS`.

## Dashboard section

Per hotel → **Revenue by Source**:
- KPI cards: total revenue, total bookings, average booking value, top source.
- Granularity toggle (Source / Source+Medium / Source+Medium+Campaign).
- Date range (7 / 30 / 90 days).
- Source-type chips (multi-select; chips re-query so totals/table/chart stay
  consistent with the filter).
- Table: source key, type badge, bookings, revenue (compact ₹, e.g. ₹7.6L), avg
  value, % of total, and a trend sparkline.
- A stacked bar chart of daily revenue by source type.
- Empty state when there are no bookings in the range.

## Performance

- The time-range query rides the existing composite index
  `TrackingEvent(hotelClientId, eventType, createdAt)` — no new index needed.
- Aggregation/normalization happens in app code (one indexed query → in-memory
  group-by), which also yields the per-source sparkline and daily breakdown from a
  single read.
- The table is capped at the **top 100** source combinations by revenue; the
  response reports the true `distinctGroups` count and a `truncated` flag.
- A materialized view / cron-refreshed cache for "yesterday's revenue by source"
  is **deferred** — add it only if these queries become slow at scale.

---

# Influencer coupon attribution (Phase R2)

A first-class influencer/coupon system layered on top of Revenue by Source. It's
**additive** — the older content-piece coupon fields (`ContentPiece.couponCode` /
`influencerName`) and the "Influencer impact" section are untouched.

## How it works

1. An agency creates an **Influencer** and gives them one or more **CouponCode**s,
   each tied to a specific hotel (a code is unique *per hotel*).
2. A booking that uses a code produces an **InfluencerRedemption** via one of two
   paths — the dashboard treats both identically:
   - **Path A — snippet auto-capture.** On hotels Social Hippie built, the snippet
     reads a tagged coupon field at booking time and sends `couponCodeUsed`. If it
     matches an active code for that hotel, a `snippet_auto` redemption is created
     and linked to the `TrackingEvent`.
   - **Path B — manual entry.** For channel-manager booking engines (no snippet),
     an agency member logs the redemption by hand (`manual_entry`); **no
     TrackingEvent** is created.

## Path A — installing `data-ht-coupon-field`

Tag the coupon input on the booking form:

```html
<input data-ht-coupon-field="primary" name="coupon_code" />
```

The snippet (v2.3.0) reads its value at conversion, trims + uppercases it (max 50
chars), and includes `couponCodeUsed` in the conversion event. It also **stashes**
the value as it's typed, so the code survives the navigation from the booking form
to the thank-you page (where the field no longer exists). No field on the page →
the snippet simply omits the field; it never errors.

Backend (`/api/track/event`): on a conversion with `couponCodeUsed`, it stores the
raw code on the `TrackingEvent`, then looks up `CouponCode` by `(hotelClientId,
code)`. If found **and** ACTIVE **and** within `validFrom`/`validUntil`, it creates
the `snippet_auto` redemption. Otherwise it logs `[COUPON-MISMATCH]` and falls back
to UTM attribution — the booking is always recorded; a bad code never errors it.

## Creating influencers & codes

Agency app → **Influencers** (`/agency/influencers`):
- **Influencers** tab — add/edit/archive influencers (name required; Instagram
  handle, notes, and an optional hotel for hotel-specific vs agency-wide).
- **Coupon Codes** tab — add/edit/disable/delete codes (code uppercased + unique
  per hotel; influencer + hotel required; optional discount + validity window),
  filter by hotel/influencer/status.

## Path B — logging redemptions manually

From the Coupon Codes tab, **Log redemption** on an active code, or
`POST /api/agency/hotels/[hotelId]/redemptions` with `{ couponCodeId, bookingValue,
guestName?, bookingReference?, bookingDate?, notes? }`. Requires an agency member
(admin or analyst); the hotel and coupon must belong to the caller's agency (a miss
returns **404**, never 403). `enteredByMemberId` records who logged it. *Bulk CSV
upload is noted as a future enhancement.*

## Revenue attribution + double-count prevention

- In **Revenue by Source**, any booking with `couponCodeUsed` is classified as the
  **influencer** source (it groups under `influencer`, with the code as the
  medium/campaign), **regardless of UTM** — so a booking with both a UTM source and
  a coupon counts **once**, under influencer.
- **Manual** redemptions (no TrackingEvent) are UNION-ed into the revenue totals so
  their revenue isn't lost. **snippet_auto** redemptions are *not* added separately
  (their TrackingEvent already carries `couponCodeUsed` and is counted) — that's how
  double-counting is avoided.
- Note the distinction: the **influencer source bucket** in Revenue by Source counts
  *any* coupon-tagged booking (even an unmatched/expired code — the visitor still
  arrived with a code). **Per-influencer attribution** (the Influencer Performance
  section) only counts redemptions of a *matching, valid* code.

## Influencer Performance section

Per hotel: a table of influencers with active-code count, redemptions, attributed
revenue, average booking value, and the **auto / manual** capture split, for the
selected period. Archived influencers still appear if they have redemptions in
range — their history stays visible.

## Privacy

Coupon codes are **not PII**. **Guest names** entered with manual redemptions *are*
— they're stored, shown only inside the authenticated agency app to that agency's
members (multi-tenant scoped), and never exposed on public/hotel-share views.

## Data model

- **`Influencer`** — `name`, `instagramHandle?`, `notes?`, optional `hotelClientId`
  (agency-wide when null), `archivedAt?` (soft delete).
- **`CouponCode`** — `code` (unique per hotel), `influencerId`, `hotelClientId`,
  optional `discountType`/`discountValue`, validity window, `status`
  (ACTIVE/EXPIRED/DISABLED).
- **`InfluencerRedemption`** — `couponCodeId`, denormalized `influencerId`/
  `hotelClientId`/`agencyId`, `bookingValue`, `redemptionSource`
  (`snippet_auto`/`manual_entry`), optional `trackingEventId`/`sessionId`,
  `guestName?`, `bookingReference?`, `bookingDate?`, `enteredByMemberId?`.

(The redemption model is named `InfluencerRedemption`, not `CouponRedemption` — the
latter already exists for the content-piece coupon system.) `TrackingEvent` gains
`couponCodeUsed`. All three new models carry `agencyId` + RLS; every read is
`agencyScoped` + hotel-filtered.

**To add a new source type** (e.g. a new channel) see the classifier section above;
influencer is already wired end-to-end.

