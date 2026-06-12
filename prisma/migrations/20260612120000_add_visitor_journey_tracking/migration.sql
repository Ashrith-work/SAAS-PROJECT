-- Visitor journey tracking (snippet v2): page-by-page capture per session.
-- Additive to TrackingEvent — every pageview still writes a `visit` TrackingEvent,
-- so existing dashboards keep working; these tables add the ordered page sequence,
-- time-on-page, and drop-off. Multi-tenant: both carry agencyId + RLS, like every
-- other table. Session.id is the snippet-supplied 'sess_…' string (no default).

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "landingPath" TEXT NOT NULL,
    "exitPath" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageTitle" TEXT,
    "referrer" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "timeOnPageMs" INTEGER,
    "exitReason" TEXT,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_hotelClientId_idx" ON "Session"("hotelClientId");
CREATE INDEX "Session_agencyId_idx" ON "Session"("agencyId");
CREATE INDEX "Session_visitorId_idx" ON "Session"("visitorId");
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");
CREATE INDEX "Session_hotelClientId_startedAt_idx" ON "Session"("hotelClientId", "startedAt");

CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");
CREATE INDEX "PageView_hotelClientId_idx" ON "PageView"("hotelClientId");
CREATE INDEX "PageView_agencyId_idx" ON "PageView"("agencyId");
CREATE INDEX "PageView_visitorId_idx" ON "PageView"("visitorId");
CREATE INDEX "PageView_enteredAt_idx" ON "PageView"("enteredAt");
CREATE INDEX "PageView_pagePath_idx" ON "PageView"("pagePath");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageView" ADD CONSTRAINT "PageView_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security (defense in depth) — mirror 20260530100000_enable_rls.
-- Scoped by agencyId; the app role only sees rows for the GUC-set agency. RLS is
-- enabled WITHOUT FORCE, so the migration owner is unaffected; enforcement begins
-- once the app connects as the non-owner hoteltrack_app role.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['Session', 'PageView'];
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

-- The non-owner app role needs DML on the new tables. The enable_rls migration's
-- ALTER DEFAULT PRIVILEGES covers future tables, but grant explicitly to be safe.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PageView" TO hoteltrack_app;
