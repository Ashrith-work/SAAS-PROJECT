-- CreateTable
CREATE TABLE "GoogleAnalyticsConnection" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAnalyticsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaSnapshot" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaSourceBreakdown" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "GaSourceBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleAnalyticsConnection_agencyId_idx" ON "GoogleAnalyticsConnection"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAnalyticsConnection_hotelClientId_key" ON "GoogleAnalyticsConnection"("hotelClientId");

-- CreateIndex
CREATE INDEX "GaSnapshot_agencyId_idx" ON "GaSnapshot"("agencyId");

-- CreateIndex
CREATE INDEX "GaSnapshot_hotelClientId_idx" ON "GaSnapshot"("hotelClientId");

-- CreateIndex
CREATE UNIQUE INDEX "GaSnapshot_hotelClientId_date_key" ON "GaSnapshot"("hotelClientId", "date");

-- CreateIndex
CREATE INDEX "GaSourceBreakdown_agencyId_idx" ON "GaSourceBreakdown"("agencyId");

-- CreateIndex
CREATE INDEX "GaSourceBreakdown_hotelClientId_idx" ON "GaSourceBreakdown"("hotelClientId");

-- CreateIndex
CREATE UNIQUE INDEX "GaSourceBreakdown_hotelClientId_date_source_key" ON "GaSourceBreakdown"("hotelClientId", "date", "source");

-- AddForeignKey
ALTER TABLE "GoogleAnalyticsConnection" ADD CONSTRAINT "GoogleAnalyticsConnection_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAnalyticsConnection" ADD CONSTRAINT "GoogleAnalyticsConnection_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaSnapshot" ADD CONSTRAINT "GaSnapshot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaSnapshot" ADD CONSTRAINT "GaSnapshot_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaSourceBreakdown" ADD CONSTRAINT "GaSourceBreakdown_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaSourceBreakdown" ADD CONSTRAINT "GaSourceBreakdown_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
