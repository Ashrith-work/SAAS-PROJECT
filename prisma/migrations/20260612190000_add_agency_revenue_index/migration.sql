-- Agency-wide revenue rollups (Phase R3): a composite index on
-- (agencyId, eventType, createdAt) so the agency-level revenue-by-source +
-- overview queries (conversions across ALL of an agency's hotels over a date
-- range) are an index hit rather than a scan. Index-only change.
CREATE INDEX "TrackingEvent_agencyId_eventType_createdAt_idx"
  ON "TrackingEvent" ("agencyId", "eventType", "createdAt");
