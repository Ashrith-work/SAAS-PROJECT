-- CreateEnum
CREATE TYPE "TokenAuditAction" AS ENUM ('created', 'decrypted', 'refreshed', 'rotated', 'deleted', 'failed_decrypt');

-- CreateTable
CREATE TABLE "TokenAuditLog" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "tokenType" TEXT NOT NULL,
    "action" "TokenAuditAction" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "actorId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenAuditLog_agencyId_idx" ON "TokenAuditLog"("agencyId");
CREATE INDEX "TokenAuditLog_agencyId_action_createdAt_idx" ON "TokenAuditLog"("agencyId", "action", "createdAt");
CREATE INDEX "TokenAuditLog_action_success_createdAt_idx" ON "TokenAuditLog"("action", "success", "createdAt");
CREATE INDEX "TokenAuditLog_createdAt_idx" ON "TokenAuditLog"("createdAt");
CREATE INDEX "TokenAuditLog_hotelClientId_idx" ON "TokenAuditLog"("hotelClientId");

-- AddForeignKey
ALTER TABLE "TokenAuditLog" ADD CONSTRAINT "TokenAuditLog_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenAuditLog" ADD CONSTRAINT "TokenAuditLog_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security — consistent with 20260530100000_enable_rls (no FORCE, so
-- the owner connection is unaffected until activation).
ALTER TABLE "TokenAuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TokenAuditLog";
CREATE POLICY tenant_isolation ON "TokenAuditLog"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "agencyId" = current_setting('app.current_agency_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "agencyId" = current_setting('app.current_agency_id', true)
  );

-- Grant the app role access to the new table (ALTER DEFAULT PRIVILEGES from the
-- RLS migration should already cover this; explicit for clarity).
GRANT SELECT, INSERT, UPDATE, DELETE ON "TokenAuditLog" TO hoteltrack_app;
