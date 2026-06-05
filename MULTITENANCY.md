# Multi-tenancy & data isolation

HotelTrack is a multi-tenant SaaS. The tenant is **`Agency`**. Every
multi-tenant table carries an `agencyId` column, and **no agency may ever read
or write another agency's data** — see `CLAUDE.md`.

Isolation is defended in layers so that a bug in one layer can't, on its own,
leak data:

| Layer | What it is | Status |
| --- | --- | --- |
| **1. App-level scoping** | A centralized helper (`lib/tenant.ts`) injects `agencyId` into every query. | ✅ Implemented |
| **2. Postgres RLS** | Row-Level Security policies + a non-superuser app role enforce isolation in the database. | ✅ Implemented (activation pending) |
| **3. Isolation tests** | Automated cross-tenant tests in CI block deploys on any leak. | ✅ Implemented |

---

## Stack notes (important — differs from a "typical" spec)

- **Database is Neon Postgres**, not Supabase. There is no `service_role`. The
  Layer-2 work creates a dedicated **non-superuser app role** with no
  `BYPASSRLS` for the same reason.
- **Prisma 7 with a driver adapter** (`@prisma/adapter-pg`). RLS via
  `SET LOCAL app.current_agency_id` must run inside the **same transaction** as
  the query — it cannot be set in Edge middleware (`proxy.ts`). Layer 2 will use
  a request/query-scoped transaction wrapper, not middleware.
- **`super_admin` is a Clerk platform role** (`types/globals.ts`), not an
  `AgencyMember` role. Super admins have **no single agency** and operate
  cross-agency by design (the `/admin` surface).

---

## Layer 1 — centralized agency-scoped queries

`lib/tenant.ts` (session-bound) and `lib/tenant-scope.ts` (pure, no session):

| Export | Purpose |
| --- | --- |
| `getAgencyContext()` | Resolves `{ agencyId, memberId, role }` from the Clerk session. Throws `TenantAuthError` if unauthenticated / no membership. |
| `requireAgencyId()` | The current `agencyId`. **Explicitly rejects `super_admin`** callers. |
| `requireSuperAdmin()` | Guard for the cross-agency admin surface. |
| `agencyScoped(model)` | Wraps a Prisma delegate; resolves the session and injects the agency filter automatically. Use in authenticated pages / actions / routes. |
| `agencyScopedFor(agencyId, model)` | Same, with an explicit `agencyId` (no session). Use in shared libs, the public `/share` path, and inside `$transaction`. |

### How the wrapper injects the filter

| Method | Injection |
| --- | --- |
| `findMany`, `findFirst(OrThrow)`, `count`, `aggregate`, `groupBy`, `update`, `updateMany`, `delete`, `deleteMany` | merges `{ agencyId }` into `where` |
| `findUnique(OrThrow)` | rerouted to `findFirst(OrThrow)` so the non-unique `agencyId` can be added |
| `create` / `createMany` | merges `{ agencyId }` into `data` (each item) |
| `upsert` | merges `{ agencyId }` into `create` + `update` (the `where` must be a tenant-safe unique key) |

For `update`/`delete`, Postgres applies the extra `agencyId` as an additional
filter, so a cross-tenant id throws **P2025** instead of mutating another
agency's row. The `Agency` model is the tenant **root** (no `agencyId` column) —
the wrapper scopes it by its own `id`.

> **Type note:** Prisma's static types still require `agencyId` in `create.data`
> and a unique `where` on single `update`. App code keeps those explicit; the
> wrapper then acts as a runtime **override/guarantee** (it cannot be omitted,
> and a wrong value is corrected). Reads drop the now-redundant `agencyId`.

Validated end-to-end against the live DB by `scripts/smoke-tenant.ts`
(17/17 checks, including the cross-tenant `update`/`delete` block).

---

## Multi-tenant tables

Every table below has an `agencyId` column and an index on it. The list is the
single source of truth in `lib/tenant-scope.ts` (`MULTI_TENANT_MODELS`); Layer 2
enables RLS on exactly these (plus `Agency`, scoped by `id`).

`AgencyMember`, `HotelClient`, `ContentPiece`, `TrackingEvent`, `MetaToken`,
`AdSnapshot`, `CouponRedemption`, `Report`, `Alert`, `ShareLink`,
`InstagramConnection`, `SocialSnapshot`, `PostSnapshot`, `StorySnapshot`,
`GoogleAnalyticsConnection`, `GaSnapshot`, `GaSourceBreakdown`.

Tenant root: `Agency` (scoped by `id`, no `agencyId` column).

---

## Endpoints that intentionally do NOT use session agency-scoping

These resolve the tenant from something **other than the signed-in user**, so
they correctly bypass `agencyScoped()`. Each still writes/filters the correct
`agencyId`, derived from its own trusted source.

| Location | Why it's exempt | How the tenant is resolved |
| --- | --- | --- |
| `app/api/track/event/route.ts` | Public ingestion from hotel websites (no session). | Public, unguessable `siteId` → hotel → `agencyId` stamped on every `TrackingEvent`. |
| `app/api/track/config/route.ts` | Public config for the snippet (no session). | `siteId`; returns only that hotel's conversion config, no agency data. |
| `app/share/[uuid]/page.tsx`, `app/share/[uuid]/actions.ts` | Public read-only report links (no login). | Unguessable share **token** → resolves `agencyId`, then `loadHotelReport()` is called with that id via `agencyScopedFor`. |
| `app/api/webhooks/stripe/route.ts` | Stripe webhook (Stripe-signed, no session). | `stripeCustomerId` / metadata → agency. |
| `app/admin/page.tsx`, `app/admin/actions.ts` | Super-admin, **cross-agency by design**. | `requireSuperAdmin()`; deliberately un-scoped platform-wide queries. |
| `app/(agency)/agency/onboarding/actions.ts` | Bootstraps the Agency + first member (pre-agency). | Creates the tenant; no `agencyId` exists yet. |
| `lib/auth.ts` (`getCurrentMember`) | Bootstrap lookup that **finds** the agency. | `clerkId` → `AgencyMember`; the caller doesn't have an `agencyId` yet. |
| `app/api/meta/sync`, `app/api/instagram/sync`, `app/api/instagram/refresh-tokens`, `app/api/ga/sync` + `lib/meta`/`lib/instagram-sync.ts`/`lib/ga-sync.ts`/`lib/alerts.ts` | Cron jobs gated by `CRON_SECRET`; iterate **all** agencies. | Each writes rows with the `agencyId` of the hotel/connection it is processing, scoped per-agency in the loop. |
| `app/api/auth/instagram/callback/route.ts` | OAuth callback from instagram.com (browser redirect, state-authenticated). | HMAC-signed 10-minute `state` token minted by `/start` for an authenticated member → `agencyId` + `hotelClientId`, re-verified against the DB before writing. |

`lib/report-data.ts` is **not** an exception: it receives `agencyId` as a
parameter (so it serves both the authenticated dashboard and the token-based
share page) and uses `agencyScopedFor()` internally.

---

## Layer 2 — PostgreSQL Row-Level Security

Migration `20260530100000_enable_rls`:

- Enables RLS on every multi-tenant table **and `Agency`**, with a
  `tenant_isolation` policy whose `USING` + `WITH CHECK` clauses are:

  ```sql
  current_setting('app.bypass_rls', true) = 'on'
  OR "agencyId" = current_setting('app.current_agency_id', true)
  -- (Agency uses "id" instead of "agencyId")
  ```

- Creates the dedicated non-owner role **`hoteltrack_app`** (NOLOGIN) and grants
  it `SELECT/INSERT/UPDATE/DELETE` only — it owns nothing, so it is fully
  subject to the policies (table owners bypass RLS).

RLS is enabled **without `FORCE`**, so the current owner connection is
unaffected — applying the migration changed no behaviour. Enforcement begins
when the app connects as `hoteltrack_app`.

**Request context** (`lib/rls.ts`) — the GUCs must be set inside the query's
transaction (`SET LOCAL` is transaction-scoped; it can't live in Edge
middleware):

| Helper | Use |
| --- | --- |
| `withRequestAgencyContext(fn)` | Authenticated requests; resolves the agency from Clerk, rejects super-admin. |
| `withAgencyContext(agencyId, fn)` | Known agency: tracking ingest (from siteId), cron (per agency), `/share` (from token). |
| `withSuperAdminContext(fn)` | Cross-agency admin; sets `app.bypass_rls`. Gated by `requireSuperAdmin()`. |
| `setAgencyContextOnTx(tx, id)` | Set the GUC on an existing interactive transaction. |

Proven against the live DB by `scripts/smoke-rls.ts` (**11/11**), run AS the
`hoteltrack_app` role: cross-tenant read/update/delete/insert are all blocked,
it fails **closed** when no GUC is set, and the super-admin bypass works.

### Activating enforcement (operator steps)

See `scripts/sql/rls-activate.sql`. In short: give `hoteltrack_app` a login +
password, point `DATABASE_URL` at it (keep the owner URL for migrations), and
make sure every query path is wrapped in one of the helpers above. Until a path
is wrapped it will correctly see zero rows.

---

## Layer 3 — automated isolation suite

`tests/isolation.test.ts` (vitest) runs against a real DB with two agencies and
asserts, end-to-end:

1. **App scoping** — `agencyScoped` returns only the caller's rows; cross-tenant
   `update`/`delete` throw P2025.
2. **Authenticated routes** — `/api/hotels/export` returns A's hotels and never
   B's.
3. **RLS at the DB level** — as the `hoteltrack_app` role, cross-tenant
   read/update/delete are blocked, it fails closed with no GUC, and the
   super-admin bypass works.
4. **Parameter tampering** — hitting `/api/reports/csv?hotelId=<B's id>` while
   logged in as A returns **404**.
5. **Tracking endpoint** — an event posted with B's `siteId` is stored under
   **B** (not the authenticated agency A), and A cannot read it.

Clerk auth is mocked (`vi.mock("@/lib/auth")`) to drive "who is logged in".
`tests/agency-isolation.test.ts` additionally guards the raw query shapes.
Wired into CI by `.github/workflows/isolation.yml` — make it a **required check**
so a failing isolation test blocks the deploy.

## Running the isolation checks

```bash
npm run test:isolation     # full vitest suite (Layers 1–3)
npm run test:tenant        # Layer-1 wrapper smoke (scripts/smoke-tenant.ts)
npm run test:rls           # Layer-2 RLS enforcement smoke (scripts/smoke-rls.ts)
```

---

## Remaining operator step

- **Layer 2 activation:** provision the `hoteltrack_app` login, switch
  `DATABASE_URL` to it, and wrap each query path in an `lib/rls.ts` helper — see
  `scripts/sql/rls-activate.sql`. The policies, role, helpers, and tests are
  built and verified; this is the operational flip that turns RLS from
  *enforced-in-tests* to *enforced-in-production*.
