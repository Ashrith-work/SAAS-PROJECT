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
