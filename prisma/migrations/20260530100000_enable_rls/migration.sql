-- ─────────────────────────────────────────────────────────────────────────────
-- LAYER 2 — PostgreSQL Row-Level Security (see MULTITENANCY.md)
--
-- Enables RLS on every multi-tenant table plus the Agency tenant root. Each
-- policy allows a row only when the per-transaction GUC `app.current_agency_id`
-- matches the row's agencyId (or its own id, for Agency) — OR when the super-
-- admin bypass GUC `app.bypass_rls` is 'on'. Both GUCs are set with SET LOCAL /
-- set_config(..., true) inside the request transaction (see lib/rls.ts).
--
-- IMPORTANT: RLS is enabled WITHOUT FORCE. A table's owner (the role Prisma runs
-- migrations and — for now — the app as) bypasses RLS, so this migration changes
-- NOTHING for the current connection. Enforcement begins only once the app
-- connects as the dedicated, non-owner `hoteltrack_app` role created below.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Multi-tenant tables (scoped by agencyId).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'AgencyMember', 'HotelClient', 'ContentPiece', 'TrackingEvent', 'MetaToken',
    'AdSnapshot', 'CouponRedemption', 'Report', 'Alert', 'ShareLink',
    'SocialAccount', 'SocialSnapshot', 'PostSnapshot', 'StorySnapshot',
    'GoogleAnalyticsConnection', 'GaSnapshot', 'GaSourceBreakdown'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ('
      '  current_setting(''app.bypass_rls'', true) = ''on'''
      '  OR "agencyId" = current_setting(''app.current_agency_id'', true)'
      ') '
      'WITH CHECK ('
      '  current_setting(''app.bypass_rls'', true) = ''on'''
      '  OR "agencyId" = current_setting(''app.current_agency_id'', true)'
      ')',
      t
    );
  END LOOP;
END $$;

-- 2. Agency is the tenant ROOT — scoped by its own id (no agencyId column).
ALTER TABLE "Agency" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Agency";
CREATE POLICY tenant_isolation ON "Agency"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "id" = current_setting('app.current_agency_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "id" = current_setting('app.current_agency_id', true)
  );

-- 3. The dedicated application role. NOLOGIN here (no password in version
--    control); grant LOGIN + a password out-of-band before pointing the app at
--    it (see scripts/sql/rls-role.sql and MULTITENANCY.md). It owns nothing, so
--    it is FULLY subject to the policies above.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hoteltrack_app') THEN
    CREATE ROLE hoteltrack_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hoteltrack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hoteltrack_app;
-- Future tables/sequences created by later migrations (run as the owner) should
-- be reachable by the app role too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hoteltrack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hoteltrack_app;
