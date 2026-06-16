-- Instagram Reach Split: separate the hotel's OWNED post reach (PostSnapshot)
-- from INFLUENCER content reach (posts that tagged/mentioned the hotel).
-- All additive + nullable, so existing rows and syncs are unaffected.

-- Influencer: resolved IG user id + last-detected timestamp.
ALTER TABLE "Influencer" ADD COLUMN "instagramUserId" TEXT;
ALTER TABLE "Influencer" ADD COLUMN "lastDetectedAt" TIMESTAMP(3);

-- HotelClient: the hotel's own @handle (for caption-mention matching).
ALTER TABLE "HotelClient" ADD COLUMN "instagramHandle" TEXT;

-- Influencer-attributed posts that tagged/mentioned the hotel.
CREATE TABLE "InfluencerInstagramPost" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "instagramPostId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "captionText" TEXT,
    "reach" INTEGER,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "taggedHotelAccount" BOOLEAN NOT NULL DEFAULT false,
    "mentionedHotelInCaption" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InfluencerInstagramPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InfluencerInstagramPost_instagramPostId_key" ON "InfluencerInstagramPost"("instagramPostId");
CREATE INDEX "InfluencerInstagramPost_agencyId_hotelClientId_postedAt_idx" ON "InfluencerInstagramPost"("agencyId", "hotelClientId", "postedAt" DESC);
CREATE INDEX "InfluencerInstagramPost_influencerId_postedAt_idx" ON "InfluencerInstagramPost"("influencerId", "postedAt" DESC);
CREATE INDEX "InfluencerInstagramPost_syncedAt_idx" ON "InfluencerInstagramPost"("syncedAt");

ALTER TABLE "InfluencerInstagramPost" ADD CONSTRAINT "InfluencerInstagramPost_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InfluencerInstagramPost" ADD CONSTRAINT "InfluencerInstagramPost_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InfluencerInstagramPost" ADD CONSTRAINT "InfluencerInstagramPost_influencerId_fkey"
  FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Posts that tagged the hotel but whose poster isn't a known influencer yet.
CREATE TABLE "UnattributedMention" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "instagramPostId" TEXT NOT NULL,
    "posterInstagramUserId" TEXT,
    "posterUsername" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "captionText" TEXT,
    "reach" INTEGER,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "taggedHotelAccount" BOOLEAN NOT NULL DEFAULT false,
    "mentionedHotelInCaption" BOOLEAN NOT NULL DEFAULT false,
    "linkedInfluencerId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnattributedMention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnattributedMention_instagramPostId_key" ON "UnattributedMention"("instagramPostId");
CREATE INDEX "UnattributedMention_agencyId_hotelClientId_postedAt_idx" ON "UnattributedMention"("agencyId", "hotelClientId", "postedAt" DESC);
CREATE INDEX "UnattributedMention_posterInstagramUserId_idx" ON "UnattributedMention"("posterInstagramUserId");

ALTER TABLE "UnattributedMention" ADD CONSTRAINT "UnattributedMention_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnattributedMention" ADD CONSTRAINT "UnattributedMention_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
