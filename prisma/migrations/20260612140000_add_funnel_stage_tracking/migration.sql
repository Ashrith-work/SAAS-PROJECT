-- Phase 2 funnel-stage tracking. Additive to Phase 1 journey tracking:
--   HotelClient.funnelStageRules — URL-pattern → stage rules (server-side tagging)
--   PageView.funnelStage         — the stage of each page (attribute or rule)
--   Session.highestStageReached  — denormalized max stage for fast funnel queries
--   StageReached                 — one row per (session, stage) first reached
-- Multi-tenant: StageReached carries agencyId + RLS like every other table.

-- AlterTable
ALTER TABLE "HotelClient" ADD COLUMN "funnelStageRules" JSONB;
ALTER TABLE "PageView" ADD COLUMN "funnelStage" TEXT;
ALTER TABLE "Session" ADD COLUMN "highestStageReached" TEXT;

-- CreateIndex (funnel aggregation per hotel)
CREATE INDEX "PageView_hotelClientId_funnelStage_idx" ON "PageView"("hotelClientId", "funnelStage");

-- CreateTable
CREATE TABLE "StageReached" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageReached_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageReached_sessionId_stage_key" ON "StageReached"("sessionId", "stage");
CREATE INDEX "StageReached_hotelClientId_idx" ON "StageReached"("hotelClientId");
CREATE INDEX "StageReached_agencyId_idx" ON "StageReached"("agencyId");
CREATE INDEX "StageReached_reachedAt_idx" ON "StageReached"("reachedAt");
CREATE INDEX "StageReached_stage_idx" ON "StageReached"("stage");

-- AddForeignKey
ALTER TABLE "StageReached" ADD CONSTRAINT "StageReached_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security (defense in depth) — mirror 20260530100000_enable_rls.
ALTER TABLE "StageReached" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StageReached";
CREATE POLICY tenant_isolation ON "StageReached"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "agencyId" = current_setting('app.current_agency_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "agencyId" = current_setting('app.current_agency_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "StageReached" TO hoteltrack_app;
