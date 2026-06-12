-- Phase 3 click / form-field / identity tracking (snippet v2.2). Additive to the
-- Phase 1 journey + Phase 2 funnel tables:
--   ClickEvent      — one row per click on a [data-ht-click] element
--   FormFieldEvent  — focus/blur on a [data-ht-form-field] input (hasValue only)
--   VisitorIdentity — visitorId → name / salted-hashed email+phone / customerId
-- Multi-tenant: all three carry agencyId + RLS, like every other table. ClickEvent
-- and FormFieldEvent cascade-delete with their Session (90-day journey retention
-- sweeps them too); VisitorIdentity persists by design.

-- CreateTable
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "clickTarget" TEXT NOT NULL,
    "elementTag" TEXT,
    "elementText" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFieldEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "hasValue" BOOLEAN,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormFieldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorIdentity" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT,
    "emailHash" TEXT,
    "phoneHash" TEXT,
    "customerId" TEXT,
    "identifiedAt" TIMESTAMP(3) NOT NULL,
    "identifiedInSessionId" TEXT,

    CONSTRAINT "VisitorIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClickEvent_hotelClientId_idx" ON "ClickEvent"("hotelClientId");
CREATE INDEX "ClickEvent_sessionId_idx" ON "ClickEvent"("sessionId");
CREATE INDEX "ClickEvent_clickTarget_idx" ON "ClickEvent"("clickTarget");
CREATE INDEX "ClickEvent_occurredAt_idx" ON "ClickEvent"("occurredAt");
CREATE INDEX "ClickEvent_agencyId_idx" ON "ClickEvent"("agencyId");

CREATE INDEX "FormFieldEvent_hotelClientId_idx" ON "FormFieldEvent"("hotelClientId");
CREATE INDEX "FormFieldEvent_sessionId_idx" ON "FormFieldEvent"("sessionId");
CREATE INDEX "FormFieldEvent_fieldName_idx" ON "FormFieldEvent"("fieldName");
CREATE INDEX "FormFieldEvent_agencyId_idx" ON "FormFieldEvent"("agencyId");

CREATE UNIQUE INDEX "VisitorIdentity_visitorId_key" ON "VisitorIdentity"("visitorId");
CREATE INDEX "VisitorIdentity_emailHash_idx" ON "VisitorIdentity"("emailHash");
CREATE INDEX "VisitorIdentity_phoneHash_idx" ON "VisitorIdentity"("phoneHash");
CREATE INDEX "VisitorIdentity_hotelClientId_idx" ON "VisitorIdentity"("hotelClientId");
CREATE INDEX "VisitorIdentity_agencyId_idx" ON "VisitorIdentity"("agencyId");

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FormFieldEvent" ADD CONSTRAINT "FormFieldEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisitorIdentity" ADD CONSTRAINT "VisitorIdentity_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security (defense in depth) — mirror 20260530100000_enable_rls.
-- Scoped by agencyId; the app role only sees rows for the GUC-set agency. RLS is
-- enabled WITHOUT FORCE, so the migration owner is unaffected; enforcement begins
-- once the app connects as the non-owner hoteltrack_app role.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['ClickEvent', 'FormFieldEvent', 'VisitorIdentity'];
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

-- The non-owner app role needs DML on the new tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClickEvent" TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FormFieldEvent" TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "VisitorIdentity" TO hoteltrack_app;
