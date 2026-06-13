-- Hotel self-signup: agencies share an invite code; hotels join themselves at
-- /join/<code>. All additive + nullable (existing agencies get a code lazily on
-- first view; existing hotels keep working with createdByUserId NULL).

-- Agency invite code (unique across all agencies).
ALTER TABLE "Agency" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Agency" ADD COLUMN "inviteCodeGeneratedAt" TIMESTAMP(3);
ALTER TABLE "Agency" ADD COLUMN "inviteCodeStatus" TEXT DEFAULT 'ACTIVE';
CREATE UNIQUE INDEX "Agency_inviteCode_key" ON "Agency"("inviteCode");

-- HotelClient owner-supplied details + the Clerk owner id (authz for /hotel/[id]).
ALTER TABLE "HotelClient" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "HotelClient" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "HotelClient" ADD COLUMN "address" TEXT;
ALTER TABLE "HotelClient" ADD COLUMN "whatsappNumber" TEXT;
ALTER TABLE "HotelClient" ADD COLUMN "roomCount" INTEGER;
ALTER TABLE "HotelClient" ADD COLUMN "channelManager" TEXT;
CREATE INDEX "HotelClient_createdByUserId_idx" ON "HotelClient"("createdByUserId");

-- Invite audit trail.
CREATE TABLE "HotelInvite" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "hotelEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "HotelInvite_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelInvite_agencyId_idx" ON "HotelInvite"("agencyId");
CREATE INDEX "HotelInvite_inviteCode_idx" ON "HotelInvite"("inviteCode");
CREATE INDEX "HotelInvite_hotelClientId_idx" ON "HotelInvite"("hotelClientId");

ALTER TABLE "HotelInvite" ADD CONSTRAINT "HotelInvite_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelInvite" ADD CONSTRAINT "HotelInvite_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
