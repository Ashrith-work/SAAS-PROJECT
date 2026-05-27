-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('performance_drop', 'snippet_error', 'meta_token_expiry', 'weekly_summary');

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "hotelClientId" TEXT,
    "type" "AlertType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "emailTo" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'pending',
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_agencyId_idx" ON "Alert"("agencyId");

-- CreateIndex
CREATE INDEX "Alert_agencyId_type_createdAt_idx" ON "Alert"("agencyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_hotelClientId_idx" ON "Alert"("hotelClientId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_hotelClientId_fkey" FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
