-- AlterTable
ALTER TABLE "PostSnapshot" ADD COLUMN     "comments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StorySnapshot" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "mediaType" TEXT,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "taps_forward" INTEGER NOT NULL DEFAULT 0,
    "taps_back" INTEGER NOT NULL DEFAULT 0,
    "exits" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorySnapshot_agencyId_idx" ON "StorySnapshot"("agencyId");

-- CreateIndex
CREATE INDEX "StorySnapshot_hotelClientId_idx" ON "StorySnapshot"("hotelClientId");

-- CreateIndex
CREATE INDEX "StorySnapshot_postedAt_idx" ON "StorySnapshot"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorySnapshot_hotelClientId_storyId_key" ON "StorySnapshot"("hotelClientId", "storyId");

-- AddForeignKey
ALTER TABLE "StorySnapshot" ADD CONSTRAINT "StorySnapshot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySnapshot" ADD CONSTRAINT "StorySnapshot_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
