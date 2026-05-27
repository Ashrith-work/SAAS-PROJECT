-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_agencyId_idx" ON "ShareLink"("agencyId");

-- CreateIndex
CREATE INDEX "ShareLink_hotelClientId_idx" ON "ShareLink"("hotelClientId");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
