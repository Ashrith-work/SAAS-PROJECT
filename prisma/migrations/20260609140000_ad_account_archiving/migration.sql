-- ─────────────────────────────────────────────────────────────────────────────
-- Ad-account-change archiving.
--
-- When an agency re-maps a hotel to a DIFFERENT Meta ad account, the previous
-- account's data must stop polluting the dashboard without being lost. We add
-- archive flags to the three ad tables and tag the two campaign tables with the
-- ad account they came from. AdSnapshot's unique key widens to include
-- metaAccountId so an archived old-account row and a fresh new-account row can
-- coexist for the same date.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. AdSnapshot: archive flags + widen the per-day unique key by metaAccountId.
ALTER TABLE "AdSnapshot" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdSnapshot" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "AdSnapshot" ADD COLUMN "archivedReason" TEXT;

-- Existing rows are unique on (hotelClientId, date) and all carry a metaAccountId,
-- so (hotelClientId, metaAccountId, date) is already unique — no dedup needed.
DROP INDEX "AdSnapshot_hotelClientId_date_key";
CREATE UNIQUE INDEX "AdSnapshot_hotelClientId_metaAccountId_date_key"
  ON "AdSnapshot"("hotelClientId", "metaAccountId", "date");
CREATE INDEX "AdSnapshot_hotelClientId_archived_idx"
  ON "AdSnapshot"("hotelClientId", "archived");

-- 2. AdCampaignSnapshot: ad-account tag + archive flags.
ALTER TABLE "AdCampaignSnapshot" ADD COLUMN "metaAccountId" TEXT;
ALTER TABLE "AdCampaignSnapshot" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdCampaignSnapshot" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "AdCampaignSnapshot" ADD COLUMN "archivedReason" TEXT;
CREATE INDEX "AdCampaignSnapshot_hotelClientId_archived_idx"
  ON "AdCampaignSnapshot"("hotelClientId", "archived");

-- 3. CampaignPerformance: ad-account tag + archive flags.
ALTER TABLE "CampaignPerformance" ADD COLUMN "metaAccountId" TEXT;
ALTER TABLE "CampaignPerformance" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CampaignPerformance" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "CampaignPerformance" ADD COLUMN "archivedReason" TEXT;
CREATE INDEX "CampaignPerformance_hotelClientId_archived_idx"
  ON "CampaignPerformance"("hotelClientId", "archived");

-- Backfill the new metaAccountId tags from each hotel's current mapping. Every
-- existing campaign row was synced from whatever account is mapped now, so this
-- is correct for today's single-account-per-hotel data.
UPDATE "AdCampaignSnapshot" acs
  SET "metaAccountId" = hc."metaAdAccountId"
  FROM "HotelClient" hc
  WHERE acs."hotelClientId" = hc."id" AND hc."metaAdAccountId" IS NOT NULL;
UPDATE "CampaignPerformance" cp
  SET "metaAccountId" = hc."metaAdAccountId"
  FROM "HotelClient" hc
  WHERE cp."hotelClientId" = hc."id" AND hc."metaAdAccountId" IS NOT NULL;

-- 4. HotelClient: connection history + current-account timestamp.
ALTER TABLE "HotelClient" ADD COLUMN "previousAdAccountIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "HotelClient" ADD COLUMN "metaAccountConnectedAt" TIMESTAMP(3);

-- Seed the current-account timestamp for already-mapped hotels so they aren't
-- mistaken for a brand-new "sync in progress" connection.
UPDATE "HotelClient"
  SET "metaAccountConnectedAt" = COALESCE("lastSyncedAt", "createdAt")
  WHERE "metaAdAccountId" IS NOT NULL;
