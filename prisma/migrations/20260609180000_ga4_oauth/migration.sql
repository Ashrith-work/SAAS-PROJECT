-- ─────────────────────────────────────────────────────────────────────────────
-- GA4 via OAuth — user-consent successor to the service-account
-- GoogleAnalyticsConnection (now retired/unused). Stores encrypted access +
-- refresh tokens and a richer daily snapshot (traffic, acquisition, Google Ads,
-- geography, device, landing pages). Multi-tenant: both tables carry agencyId
-- and get the standard tenant_isolation RLS policy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "GA4Status" AS ENUM ('ACTIVE', 'TOKEN_EXPIRED', 'ERROR', 'REVOKED');

CREATE TABLE "Ga4Connection" (
    "id"             TEXT NOT NULL,
    "hotelClientId"  TEXT NOT NULL,
    "agencyId"       TEXT NOT NULL,
    "propertyId"     TEXT NOT NULL,
    "propertyName"   TEXT,
    "accessToken"    TEXT NOT NULL,
    "refreshToken"   TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope"          TEXT NOT NULL,
    "status"         "GA4Status" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt"   TIMESTAMP(3),
    "lastSyncError"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ga4Connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ga4Connection_hotelClientId_key" ON "Ga4Connection"("hotelClientId");
CREATE INDEX "Ga4Connection_agencyId_idx" ON "Ga4Connection"("agencyId");

CREATE TABLE "Ga4Snapshot" (
    "id"                   TEXT NOT NULL,
    "hotelClientId"        TEXT NOT NULL,
    "agencyId"             TEXT NOT NULL,
    "date"                 DATE NOT NULL,
    "sessions"             INTEGER NOT NULL DEFAULT 0,
    "users"                INTEGER NOT NULL DEFAULT 0,
    "newUsers"             INTEGER NOT NULL DEFAULT 0,
    "pageViews"            INTEGER NOT NULL DEFAULT 0,
    "bounceRate"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSessionDuration"   INTEGER NOT NULL DEFAULT 0,
    "organicSessions"      INTEGER NOT NULL DEFAULT 0,
    "paidSessions"         INTEGER NOT NULL DEFAULT 0,
    "socialSessions"       INTEGER NOT NULL DEFAULT 0,
    "directSessions"       INTEGER NOT NULL DEFAULT 0,
    "referralSessions"     INTEGER NOT NULL DEFAULT 0,
    "googleAdsClicks"      INTEGER,
    "googleAdsImpressions" INTEGER,
    "googleAdsCost"        INTEGER,
    "googleAdsConversions" INTEGER,
    "topCountries"         JSONB NOT NULL,
    "topCities"            JSONB NOT NULL,
    "mobileSessions"       INTEGER NOT NULL DEFAULT 0,
    "desktopSessions"      INTEGER NOT NULL DEFAULT 0,
    "tabletSessions"       INTEGER NOT NULL DEFAULT 0,
    "topLandingPages"      JSONB NOT NULL,

    CONSTRAINT "Ga4Snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ga4Snapshot_hotelClientId_date_key" ON "Ga4Snapshot"("hotelClientId", "date");
CREATE INDEX "Ga4Snapshot_hotelClientId_date_idx" ON "Ga4Snapshot"("hotelClientId", "date");
CREATE INDEX "Ga4Snapshot_agencyId_idx" ON "Ga4Snapshot"("agencyId");

ALTER TABLE "Ga4Connection"
  ADD CONSTRAINT "Ga4Connection_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4Connection"
  ADD CONSTRAINT "Ga4Connection_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4Snapshot"
  ADD CONSTRAINT "Ga4Snapshot_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4Snapshot"
  ADD CONSTRAINT "Ga4Snapshot_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['Ga4Connection', 'Ga4Snapshot'];
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
