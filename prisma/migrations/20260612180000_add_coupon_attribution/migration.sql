-- Influencer coupon attribution (Phase R2). First-class Influencer / CouponCode /
-- InfluencerRedemption models (additive to the existing content-piece coupon
-- fields), plus TrackingEvent.couponCodeUsed for snippet auto-capture. Multi-
-- tenant: every table carries agencyId + RLS, like every other table.

-- AlterTable
ALTER TABLE "TrackingEvent" ADD COLUMN "couponCodeUsed" TEXT;

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "name" TEXT NOT NULL,
    "instagramHandle" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "discountType" TEXT,
    "discountValue" DECIMAL(12,2),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerRedemption" (
    "id" TEXT NOT NULL,
    "couponCodeId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "bookingValue" DECIMAL(12,2) NOT NULL,
    "bookingReference" TEXT,
    "guestName" TEXT,
    "bookingDate" TIMESTAMP(3),
    "redemptionSource" TEXT NOT NULL,
    "trackingEventId" TEXT,
    "sessionId" TEXT,
    "notes" TEXT,
    "enteredByMemberId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfluencerRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Influencer_agencyId_idx" ON "Influencer"("agencyId");
CREATE INDEX "Influencer_hotelClientId_idx" ON "Influencer"("hotelClientId");

CREATE UNIQUE INDEX "CouponCode_hotelClientId_code_key" ON "CouponCode"("hotelClientId", "code");
CREATE INDEX "CouponCode_influencerId_idx" ON "CouponCode"("influencerId");
CREATE INDEX "CouponCode_code_idx" ON "CouponCode"("code");
CREATE INDEX "CouponCode_agencyId_idx" ON "CouponCode"("agencyId");
CREATE INDEX "CouponCode_hotelClientId_idx" ON "CouponCode"("hotelClientId");

CREATE INDEX "InfluencerRedemption_agencyId_idx" ON "InfluencerRedemption"("agencyId");
CREATE INDEX "InfluencerRedemption_hotelClientId_idx" ON "InfluencerRedemption"("hotelClientId");
CREATE INDEX "InfluencerRedemption_influencerId_idx" ON "InfluencerRedemption"("influencerId");
CREATE INDEX "InfluencerRedemption_redeemedAt_idx" ON "InfluencerRedemption"("redeemedAt");
CREATE INDEX "InfluencerRedemption_trackingEventId_idx" ON "InfluencerRedemption"("trackingEventId");

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InfluencerRedemption" ADD CONSTRAINT "InfluencerRedemption_couponCodeId_fkey"
    FOREIGN KEY ("couponCodeId") REFERENCES "CouponCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InfluencerRedemption" ADD CONSTRAINT "InfluencerRedemption_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Row-Level Security (defense in depth) — mirror 20260530100000_enable_rls.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['Influencer', 'CouponCode', 'InfluencerRedemption'];
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "Influencer" TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CouponCode" TO hoteltrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "InfluencerRedemption" TO hoteltrack_app;
