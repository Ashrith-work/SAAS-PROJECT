-- Soft delete for HotelClient: hide + stop syncing a hotel without destroying
-- any data, reversible via restoreHotel. All columns are nullable/additive.

-- AlterTable
ALTER TABLE "HotelClient"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByAgencyMemberId" TEXT,
  ADD COLUMN "deletionReason" TEXT;

-- Speeds up the "active hotels only" (deletedAt IS NULL) filter now applied to
-- every per-agency hotel read.
CREATE INDEX "HotelClient_agencyId_deletedAt_idx" ON "HotelClient"("agencyId", "deletedAt");

-- New audit actions for the hotel soft-delete / restore lifecycle. ADD VALUE is
-- safe outside a txn-use in PG12+ (Neon is PG15); not used in this migration.
ALTER TYPE "TokenAuditAction" ADD VALUE IF NOT EXISTS 'hotel_soft_deleted';
ALTER TYPE "TokenAuditAction" ADD VALUE IF NOT EXISTS 'hotel_restored';
