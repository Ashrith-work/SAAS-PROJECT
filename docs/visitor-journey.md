# Visitor Journey Tracking (snippet v2 — Phase 1)

Phase 1 captures, for every visitor **session**, the full sequence of pages they
visited on the hotel's website, the time spent on each page, and where they
dropped off — surfaced as a chronological timeline in the agency dashboard.

It is **purely additive**. Everything the v1 snippet did still happens (first-touch
UTM, conversion + revenue capture, multi-touch attribution, multi-tenant
isolation). Journey capture sits alongside it.

## What the snippet does now (v2.0.0)

`scripts/snippet.src.js` is the source of truth; `npm run build:snippet` regenerates
the minified `public/t.js` that hotels load via `<script src=".../t.js?id=SITE_ID" async>`.

- **Session id** — `sessionStorage` key `ht_session_id` = `sess_<uuid>`. A session
  ends after **30 minutes of inactivity** (no events) or when the tab closes; a new
  tab or a fresh load after the idle window starts a new session.
- **Visitor id** — cookie `ht_visitor_id` = `vis_<uuid>`, 365-day, `SameSite=Lax`.
  Stable across sessions. Seeded from the legacy `_ht_vid` cookie when present so
  returning visitors keep their identity.
- **`pageview`** fires on every page load (and every SPA route change). It sends the
  path (`location.pathname` — **never** the query string or hash), page title,
  referrer, viewport, user agent, timestamp, and the first-touch UTM. Each pageview
  also records the existing `visit` `TrackingEvent`, so all existing dashboards keep
  working unchanged.
- **`page_exit`** fires when the visitor leaves a page, carrying the time on page and
  the reason: `navigation` (moved to another page), `unload` (closed the tab /
  left the site — sent via `navigator.sendBeacon`), or `inactivity_timeout` (idle 30
  min). Time on page = exit timestamp − entry timestamp.
- **SPA support** — `history.pushState`/`replaceState` are wrapped once and
  `popstate`/`hashchange` are observed, so React/Next.js sites that change the URL
  without a full reload still record every page. Conversion detection subscribes to
  the same navigation dispatcher.
- **Debounce** — a duplicate pageview for the same path within 500ms is dropped
  (guards against React StrictMode double-mounts and rapid history operations).

## Data attributes

**Phase 1 needs none** — journey capture is automatic once the v2 snippet is
installed. (Booking-value capture still supports the optional `data-ht-value`
attribute from v1.) Phases 2/3 will introduce `data-ht-stage` to let hotels label
funnel stages (e.g. `data-ht-stage="room-select"`); it is not used yet.

## Privacy

- We capture **page paths only** — never query strings, never hashes, never names,
  emails, or form contents. No PII.
- The visitor/session ids are random opaque values stored in the visitor's own
  browser (cookie + sessionStorage).
- Journey data is **retained for 90 days**, then deleted by the daily
  `/api/cron/cleanup-journey` cron (`Session` + `PageView` older than 90 days).

## Data model

- `Session` — one browsing session. `id` is the snippet's `sess_…` value. Holds the
  landing/exit path, page-view count, total time, the session's UTM, referrer, and
  user agent. `agencyId`/`hotelClientId` are denormalized for fast tenant-scoped reads.
- `PageView` — one page within a session: `pagePath`, `enteredAt`, `exitedAt`,
  `timeOnPageMs`, `exitReason`, viewport. Cascade-deleted with its `Session`.

Both are multi-tenant (every row carries `agencyId`, with RLS) and every dashboard
read is `agencyScoped(...)` + filtered by `hotelClientId`.

## Where to see it

Each hotel's dashboard has a **Recent Visitor Journeys** card (latest sessions) that
links to the full **`/agency/hotel/<id>/journeys`** page: filterable by date range,
converted-only, UTM source, and landing page, paginated 20 sessions per page, with a
click-through vertical timeline of every page in a session.

## Upgrading hotels

Journey tracking only works once a hotel **installs or upgrades to the v2 snippet**
(re-copy the snippet from the hotel's Integrations page). Hotels still on a v1 snippet
keep working — their `visit` events are recorded as before via the back-compat path —
but they won't get journey timelines until they upgrade. The snippet reports its
version as `v: "2.0.0"` in every event payload.
