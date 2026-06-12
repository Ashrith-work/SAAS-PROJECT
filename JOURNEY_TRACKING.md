# Journey Tracking — Click, Form & Visitor Identification (snippet v2.2, Phase 3)

Phase 3 extends visitor-journey tracking with three additive behaviors on top of
Phase 1 (page-by-page journeys) and Phase 2 (funnel stages):

1. **Click tracking** — which tagged buttons/links visitors click, and how often
   those clicks lead to a booking.
2. **Form interaction tracking** — which booking-form fields visitors enter and
   which they abandon, *without ever capturing what they typed*.
3. **Visitor identification** — associate an anonymous visitor with a real
   name/customer once they identify themselves, with email & phone stored only as
   a salted hash.

`scripts/snippet.src.js` is the source of truth. Run `npm run build:snippet` to
regenerate the minified `public/t.js` that hotels load. The snippet reports its
version as `v: "2.2.0"` in every event payload. Everything from v2.0/v2.1 still
works unchanged.

---

## 1. Tagging click targets

Add `data-ht-click="<name>"` to any button or link you want to measure. When the
element **or any ancestor** is clicked, the snippet records a `click` event.

```html
<button data-ht-click="book-now-button">Book Now</button>
<a href="/availability" data-ht-click="check-availability">Check Availability</a>
```

What's captured: the `data-ht-click` value, the element's tag (`BUTTON`/`A`/…),
and the element's visible text **truncated to 100 characters**. Nothing else.

Where it shows up: the hotel's **Visitor Journeys** page → **Clicks Analytics** —
total clicks, unique sessions, and the **conversion rate** (share of clicking
sessions that converted) per target. This is how you learn that *"Book Now gets
200 clicks but only 2% convert, while Check Availability gets 800 clicks and 25%
convert."*

## 2. Tagging form fields

Add `data-ht-form-field="<name>"` to the inputs of your booking form. The snippet
records a `form_field_focused` event when a field is focused and a
`form_field_blurred` event when it's left — carrying **only whether the field had
content** (`hasValue: true/false`), never the value itself.

```html
<input type="date"  data-ht-form-field="date-picker" />
<input type="text"  data-ht-form-field="guest-name" />
<input type="email" data-ht-form-field="email" />
```

Where it shows up: **Form Abandonment** — for each field, how many sessions
entered it, how many filled it, and the abandonment rate, plus a stacked-bar
funnel through the form. This is how you learn that *"20% abandon at the date
picker, 5% abandon at name, and 80% who fill name complete the form."*

## 3. Identifying visitors

Call `window.htIdentify(...)` when a visitor tells you who they are — typically on
booking-form submit, or from your booking confirmation page:

```html
<script>
  window.htIdentify({
    name: "Priya",                 // stored as-is (less sensitive)
    email: "priya@example.com",    // SHA-256 hashed IN THE BROWSER before sending
    phone: "+91 98765 43210",      // SHA-256 hashed IN THE BROWSER before sending
    customerId: "PMS-10432"        // optional external/PMS id
  });
</script>
```

The snippet hashes `email` and `phone` with SHA-256 **in the browser** — the raw
values never leave the page. It then stores the (already-hashed) identity in the
`ht_visitor_identity` cookie so a returning visitor's later sessions are
automatically re-linked to them.

Where it shows up:
- **Recent Visitor Journeys** now shows the visitor's **name** and a **Returning**
  badge when the same visitor has more than one session, plus an *"Identified
  only"* filter.
- **Customer Journey Lookup** (the "VIP customer view") — search by name, email, or
  phone to pull up a specific person's complete history with the hotel: every
  visit, page, click, and form interaction. Email/phone are hashed in your browser
  before the search runs, so you can find someone who showed interest but didn't
  book and follow up (e.g. WhatsApp outreach).

---

## Privacy & PII handling

> **Privacy policy note:** *If a visitor identifies themselves via a form, we
> associate their journey with a hashed identifier. Raw email and phone numbers
> are never stored.*

- **Raw email & phone are never transmitted or stored.** They're SHA-256 hashed in
  the visitor's browser; the server applies a second, salted layer (`PII_SALT`
  env var) before storing — so the stored hash can't be reversed with a rainbow
  table.
- **Names and `customerId` are stored as-is** (deliberately — they're how an agency
  recognises a customer) and are the **only** identity fields ever shown in the UI.
  Hashed values are never displayed.
- **Reverse lookup by email** works without us ever seeing the email: the dashboard
  hashes it in the browser, sends the hash, and the server matches the stored hash.
- Click `elementText` is truncated to 100 chars to minimise the chance of
  incidental PII; form values are never captured.
- We never log raw PII server-side.

### Best practices for hotel websites

- **Do tag:** primary CTAs (Book Now, Check Availability, Call, WhatsApp), and the
  key booking-form fields (dates, guests, name, email, phone).
- **Don't tag:** payment-card fields, passwords, passport/ID fields, or anything
  sensitive — even though only `hasValue` is captured, leave them untagged.
- Call `htIdentify` **only** with data the visitor knowingly provided (a booking),
  never by scraping fields.
- Keep `data-ht-click` / `data-ht-form-field` names short, stable, and
  human-readable — they're the labels you'll read in the dashboard.

---

## Rate limits & retention

- Per session: at most **50 click** events and **100 form-field** events are
  ingested; beyond that they're dropped silently.
- `ClickEvent` and `FormFieldEvent` cascade-delete with their `Session`, so the
  daily 90-day journey-retention cron (`/api/cron/cleanup-journey`) sweeps them
  too. `VisitorIdentity` persists by design (it's the durable identity record).

## Data model

- **`ClickEvent`** — one row per tagged click: `clickTarget`, `elementTag`,
  `elementText` (≤100 chars), `pagePath`, `sessionId`, `occurredAt`.
- **`FormFieldEvent`** — `fieldName`, `action` (`focused`/`blurred`), `hasValue`
  (blur only), `pagePath`, `sessionId`, `occurredAt`.
- **`VisitorIdentity`** — `visitorId` (unique) → `name`, `emailHash`, `phoneHash`
  (salted SHA-256), `customerId`, `identifiedAt`, `identifiedInSessionId`.

All three carry `agencyId` + `hotelClientId`, are protected by Row-Level Security,
and every dashboard read is `agencyScoped(...)` + filtered by `hotelClientId` —
no cross-tenant leakage.

## Configuration

Set `PII_SALT` (a long random secret) in the environment. It falls back to
`ENCRYPTION_KEY`, then a dev-only default — set an explicit `PII_SALT` in
production. Rotating it invalidates existing reverse-lookups (old hashes won't
match new searches), so treat it as a stable secret.
