-- CreateTable
CREATE TABLE "BackfillJob" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rangeStart" DATE NOT NULL,
    "rangeEnd" DATE NOT NULL,
    "daysRestored" INTEGER NOT NULL DEFAULT 0,
    "daysFailed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackfillJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackfillLog" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "jobId" TEXT,
    "dataType" TEXT NOT NULL,
    "dateRange" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackfillLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncFailure" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "tokenType" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SyncFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackfillJob_agencyId_idx" ON "BackfillJob"("agencyId");

-- CreateIndex
CREATE INDEX "BackfillJob_agencyId_status_idx" ON "BackfillJob"("agencyId", "status");

-- CreateIndex
CREATE INDEX "BackfillLog_agencyId_idx" ON "BackfillLog"("agencyId");

-- CreateIndex
CREATE INDEX "BackfillLog_jobId_idx" ON "BackfillLog"("jobId");

-- CreateIndex
CREATE INDEX "SyncFailure_agencyId_idx" ON "SyncFailure"("agencyId");

-- CreateIndex
CREATE INDEX "SyncFailure_agencyId_resolvedAt_idx" ON "SyncFailure"("agencyId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "BackfillJob" ADD CONSTRAINT "BackfillJob_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackfillLog" ADD CONSTRAINT "BackfillLog_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackfillLog" ADD CONSTRAINT "BackfillLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackfillJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncFailure" ADD CONSTRAINT "SyncFailure_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security — same tenant_isolation pattern as 20260530100000_enable_rls.
-- Each row is visible only when app.current_agency_id matches its agencyId, or
-- when the super-admin bypass GUC is on. RLS is enabled WITHOUT FORCE, so the
-- migration owner is unaffected; enforcement applies to the hoteltrack_app role.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['BackfillJob', 'BackfillLog', 'SyncFailure'];
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
