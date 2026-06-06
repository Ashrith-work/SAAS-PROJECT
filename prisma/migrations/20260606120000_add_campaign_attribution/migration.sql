-- ─────────────────────────────────────────────────────────────────────────────
-- Campaign-level attribution:
--   • AdCampaignSnapshot  — Meta insights at level=campaign (adds campaign_name,
--     the dimension utm_campaign joins on; AdSnapshot stays account-level).
--   • CampaignPerformance — materialized campaign↔booking aggregation, refreshed
--     after each Meta sync by lib/campaign-attribution.ts.
-- Both are multi-tenant (agencyId) → RLS policies match 20260530100000_enable_rls.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "AdCampaignSnapshot" (
    "id"             TEXT NOT NULL,
    "agencyId"       TEXT NOT NULL,
    "hotelClientId"  TEXT NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "campaignName"   TEXT NOT NULL,
    "date"           DATE NOT NULL,
    "spend"          DECIMAL(12,2) NOT NULL,
    "impressions"    INTEGER NOT NULL,
    "clicks"         INTEGER NOT NULL,
    "conversions"    INTEGER NOT NULL,
    "purchaseValue"  DECIMAL(12,2) NOT NULL,

    CONSTRAINT "AdCampaignSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdCampaignSnapshot_hotelClientId_metaCampaignId_date_key"
    ON "AdCampaignSnapshot"("hotelClientId", "metaCampaignId", "date");
CREATE INDEX "AdCampaignSnapshot_agencyId_idx" ON "AdCampaignSnapshot"("agencyId");
CREATE INDEX "AdCampaignSnapshot_hotelClientId_date_idx"
    ON "AdCampaignSnapshot"("hotelClientId", "date");

ALTER TABLE "AdCampaignSnapshot"
    ADD CONSTRAINT "AdCampaignSnapshot_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdCampaignSnapshot"
    ADD CONSTRAINT "AdCampaignSnapshot_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CampaignPerformance" (
    "id"                      TEXT NOT NULL,
    "agencyId"                TEXT NOT NULL,
    "hotelClientId"           TEXT NOT NULL,
    "date"                    DATE NOT NULL,
    "campaignKey"             TEXT NOT NULL,
    "campaignName"            TEXT NOT NULL,
    "metaCampaignId"          TEXT,
    "metaSpend"               DECIMAL(12,2) NOT NULL,
    "metaReportedConversions" INTEGER NOT NULL,
    "metaReportedRevenue"     DECIMAL(12,2) NOT NULL,
    "realBookings"            INTEGER NOT NULL,
    "realBookingValue"        DECIMAL(12,2) NOT NULL,
    "realRoas"                DOUBLE PRECISION,
    "variancePct"             DOUBLE PRECISION,
    "computedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPerformance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignPerformance_hotelClientId_date_campaignKey_key"
    ON "CampaignPerformance"("hotelClientId", "date", "campaignKey");
CREATE INDEX "CampaignPerformance_agencyId_idx" ON "CampaignPerformance"("agencyId");
CREATE INDEX "CampaignPerformance_hotelClientId_date_idx"
    ON "CampaignPerformance"("hotelClientId", "date");

ALTER TABLE "CampaignPerformance"
    ADD CONSTRAINT "CampaignPerformance_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignPerformance"
    ADD CONSTRAINT "CampaignPerformance_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['AdCampaignSnapshot', 'CampaignPerformance'];
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
-- these two. No explicit GRANT needed.
