-- Widen CampaignPerformance's per-day-per-campaign unique key to include the ad
-- account. campaignKey is a (lowercased) campaign NAME, so an archived old-
-- account row and a fresh new-account row could otherwise collide on the same
-- (hotel, date, name) and break the attribution refresh's insert. Including
-- metaAccountId lets both coexist (archived vs active).
DROP INDEX "CampaignPerformance_hotelClientId_date_campaignKey_key";
CREATE UNIQUE INDEX "CampaignPerformance_perAccount_key"
  ON "CampaignPerformance"("hotelClientId", "date", "campaignKey", "metaAccountId");
