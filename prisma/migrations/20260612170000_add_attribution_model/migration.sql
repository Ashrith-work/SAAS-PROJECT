-- Revenue by Source (Part 1): record which attribution model assigned each
-- conversion's UTM credit. Additive + defaulted so every existing conversion
-- reads as first_touch (the snippet stores first-touch UTM today). The composite
-- index (hotelClientId, eventType, createdAt) the feature needs already exists.
ALTER TABLE "TrackingEvent" ADD COLUMN "attributionModel" TEXT DEFAULT 'first_touch';
