-- Setup-guide download tracking. One row per PDF download / link share / email
-- share, so agency usage of the guide can be reported later. Multi-tenant:
-- scoped by agencyId like every other table.

-- CreateEnum
CREATE TYPE "GuideDownloadMethod" AS ENUM ('direct', 'link', 'email');

-- CreateTable
CREATE TABLE "GuideDownload" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "method" "GuideDownloadMethod" NOT NULL DEFAULT 'direct',
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideDownload_agencyId_idx" ON "GuideDownload"("agencyId");

-- CreateIndex
CREATE INDEX "GuideDownload_agencyId_downloadedAt_idx" ON "GuideDownload"("agencyId", "downloadedAt");

-- AddForeignKey
ALTER TABLE "GuideDownload" ADD CONSTRAINT "GuideDownload_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideDownload" ADD CONSTRAINT "GuideDownload_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
