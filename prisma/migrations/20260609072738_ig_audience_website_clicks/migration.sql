-- ─────────────────────────────────────────────────────────────────────────────
-- Expanded Instagram insights (within Graph API limits):
--   • SocialSnapshot.websiteClicks — daily "website_clicks" account metric.
--   • InstagramAudience — follower demographics (country / age / gender) from the
--     Graph `follower_demographics` insight. Best-effort; only populated for
--     accounts with 100+ followers.
-- InstagramAudience is multi-tenant (agencyId) → RLS matches 20260530100000_enable_rls.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "SocialSnapshot" ADD COLUMN "websiteClicks" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InstagramAudience" (
    "id"            TEXT NOT NULL,
    "agencyId"      TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "breakdown"     TEXT NOT NULL,
    "dimension"     TEXT NOT NULL,
    "value"         INTEGER NOT NULL DEFAULT 0,
    "syncedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAudience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramAudience_hotelClientId_breakdown_dimension_key"
    ON "InstagramAudience"("hotelClientId", "breakdown", "dimension");
CREATE INDEX "InstagramAudience_agencyId_idx" ON "InstagramAudience"("agencyId");
CREATE INDEX "InstagramAudience_hotelClientId_idx" ON "InstagramAudience"("hotelClientId");

ALTER TABLE "InstagramAudience"
    ADD CONSTRAINT "InstagramAudience_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramAudience"
    ADD CONSTRAINT "InstagramAudience_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['InstagramAudience'];
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
