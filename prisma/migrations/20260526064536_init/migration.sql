-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('admin', 'analyst');

-- CreateEnum
CREATE TYPE "ConversionMethod" AS ENUM ('url_change', 'same_page', 'both');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('organic', 'paid_ad', 'influencer', 'story');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('instagram', 'facebook', 'youtube');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('visit', 'conversion');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyMember" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelClient" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "conversionMethod" "ConversionMethod" NOT NULL,
    "thankYouUrlPattern" TEXT,
    "successPhrase" TEXT,
    "successSelector" TEXT,
    "snippetStatus" TEXT NOT NULL DEFAULT 'not_installed',
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "platform" "Platform" NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "utmLink" TEXT NOT NULL,
    "couponCode" TEXT,
    "influencerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "pageUrl" TEXT NOT NULL,
    "conversionValue" DECIMAL(12,2),
    "sessionId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaToken" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSnapshot" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "reach" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "cpc" DECIMAL(12,4) NOT NULL,
    "cpm" DECIMAL(12,4) NOT NULL,
    "conversions" INTEGER NOT NULL,
    "roas" DOUBLE PRECISION NOT NULL,
    "pixelPurchases" INTEGER NOT NULL,
    "pixelLeads" INTEGER NOT NULL,
    "pixelPageViews" INTEGER NOT NULL,

    CONSTRAINT "AdSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "contentPieceId" TEXT NOT NULL,
    "redemptionDate" TIMESTAMP(3) NOT NULL,
    "orderValue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "dateRangeStart" TIMESTAMP(3) NOT NULL,
    "dateRangeEnd" TIMESTAMP(3) NOT NULL,
    "pdfUrl" TEXT,
    "shareLink" TEXT,
    "shareLinkExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_stripeCustomerId_key" ON "Agency"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMember_clerkId_key" ON "AgencyMember"("clerkId");

-- CreateIndex
CREATE INDEX "AgencyMember_agencyId_idx" ON "AgencyMember"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelClient_siteId_key" ON "HotelClient"("siteId");

-- CreateIndex
CREATE INDEX "HotelClient_agencyId_idx" ON "HotelClient"("agencyId");

-- CreateIndex
CREATE INDEX "ContentPiece_agencyId_idx" ON "ContentPiece"("agencyId");

-- CreateIndex
CREATE INDEX "ContentPiece_hotelClientId_idx" ON "ContentPiece"("hotelClientId");

-- CreateIndex
CREATE INDEX "ContentPiece_couponCode_idx" ON "ContentPiece"("couponCode");

-- CreateIndex
CREATE INDEX "TrackingEvent_agencyId_idx" ON "TrackingEvent"("agencyId");

-- CreateIndex
CREATE INDEX "TrackingEvent_hotelClientId_idx" ON "TrackingEvent"("hotelClientId");

-- CreateIndex
CREATE INDEX "TrackingEvent_hotelClientId_eventType_createdAt_idx" ON "TrackingEvent"("hotelClientId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_sessionId_idx" ON "TrackingEvent"("sessionId");

-- CreateIndex
CREATE INDEX "MetaToken_agencyId_idx" ON "MetaToken"("agencyId");

-- CreateIndex
CREATE INDEX "AdSnapshot_agencyId_idx" ON "AdSnapshot"("agencyId");

-- CreateIndex
CREATE INDEX "AdSnapshot_hotelClientId_idx" ON "AdSnapshot"("hotelClientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSnapshot_hotelClientId_date_key" ON "AdSnapshot"("hotelClientId", "date");

-- CreateIndex
CREATE INDEX "CouponRedemption_agencyId_idx" ON "CouponRedemption"("agencyId");

-- CreateIndex
CREATE INDEX "CouponRedemption_contentPieceId_idx" ON "CouponRedemption"("contentPieceId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_shareLink_key" ON "Report"("shareLink");

-- CreateIndex
CREATE INDEX "Report_agencyId_idx" ON "Report"("agencyId");

-- CreateIndex
CREATE INDEX "Report_hotelClientId_idx" ON "Report"("hotelClientId");

-- AddForeignKey
ALTER TABLE "AgencyMember" ADD CONSTRAINT "AgencyMember_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelClient" ADD CONSTRAINT "HotelClient_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaToken" ADD CONSTRAINT "MetaToken_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSnapshot" ADD CONSTRAINT "AdSnapshot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSnapshot" ADD CONSTRAINT "AdSnapshot_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_contentPieceId_fkey" FOREIGN KEY ("contentPieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
