-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-touch attribution:
--   • Touchpoint — one row per touch in a visitor's journey, captured by the
--     snippet's _ht_journey cookie and flushed on conversion (linked via
--     conversionId → TrackingEvent.id). Powers the per-source Channel
--     Performance table and the journey drill-down across 3 attribution models.
--   • TrackingEvent.visitorId — persistent per-browser id (snippet _ht_vid),
--     nullable for pre-upgrade rows.
-- Multi-tenant (agencyId) → RLS policy matches 20260530100000_enable_rls.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "TrackingEvent" ADD COLUMN "visitorId" TEXT;

CREATE TABLE "Touchpoint" (
    "id"            TEXT NOT NULL,
    "agencyId"      TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "visitorId"     TEXT NOT NULL,
    "conversionId"  TEXT,
    "position"      INTEGER NOT NULL,
    "timestamp"     TIMESTAMP(3) NOT NULL,
    "utmSource"     TEXT,
    "utmMedium"     TEXT,
    "utmCampaign"   TEXT,
    "utmContent"    TEXT,
    "referrer"      TEXT,
    "landingPage"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Touchpoint_agencyId_idx" ON "Touchpoint"("agencyId");
CREATE INDEX "Touchpoint_hotelClientId_idx" ON "Touchpoint"("hotelClientId");
CREATE INDEX "Touchpoint_visitorId_idx" ON "Touchpoint"("visitorId");
CREATE INDEX "Touchpoint_conversionId_idx" ON "Touchpoint"("conversionId");

ALTER TABLE "Touchpoint"
    ADD CONSTRAINT "Touchpoint_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Touchpoint"
    ADD CONSTRAINT "Touchpoint_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Touchpoint"
    ADD CONSTRAINT "Touchpoint_conversionId_fkey"
    FOREIGN KEY ("conversionId") REFERENCES "TrackingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['Touchpoint'];
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

-- The app role's grants come from ALTER DEFAULT PRIVILEGES (enable_rls
-- migration), which applies to tables created by the owner afterwards — i.e.
-- this table. No explicit GRANT needed.
