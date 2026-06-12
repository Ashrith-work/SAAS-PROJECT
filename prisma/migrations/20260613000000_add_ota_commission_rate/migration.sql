-- OTA commission savings (per-hotel): the average commission % a hotel pays OTAs,
-- used to show how much direct snippet-tracked bookings saved. Additive + defaulted
-- so existing hotels read as 18% until configured. Range 0–50 enforced in the app.
ALTER TABLE "HotelClient" ADD COLUMN "otaCommissionRate" DECIMAL(5,2) DEFAULT 18.0;
