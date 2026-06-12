-- Refactor MetaToken from AGENCY-scoped (one token per agency) to HOTEL-scoped
-- (one token per hotel), so hotels living in SEPARATE Meta accounts no longer
-- overwrite each other's token. Mirrors InstagramConnection / Ga4Connection,
-- which are already @@unique([hotelClientId]).
--
-- agencyId stays on the row (tenant scoping + RLS, which keys on agencyId only,
-- so the existing tenant_isolation policy is unaffected). This migration runs as
-- the table owner via `prisma migrate deploy`, which bypasses RLS — so the data
-- copy below sees every row regardless of the GUC.

-- 1. Add the column nullable so existing rows survive the data copy below.
ALTER TABLE "MetaToken" ADD COLUMN "hotelClientId" TEXT;

-- 2. Attach each existing agency-scoped token to the hotel(s) under that agency
--    that have a Meta ad account mapped. The first such hotel (oldest) reuses the
--    original row; any additional hotels get a full copy. This preserves the live
--    token (e.g. Neelakurinji's) with zero data gap.
DO $$
DECLARE
  t  "MetaToken"%ROWTYPE;
  h  RECORD;
  is_first BOOLEAN;
BEGIN
  FOR t IN SELECT * FROM "MetaToken" WHERE "hotelClientId" IS NULL LOOP
    is_first := TRUE;
    FOR h IN
      SELECT id
      FROM "HotelClient"
      WHERE "agencyId" = t."agencyId"
        AND "metaAdAccountId" IS NOT NULL
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
    LOOP
      IF is_first THEN
        UPDATE "MetaToken" SET "hotelClientId" = h.id WHERE id = t.id;
        is_first := FALSE;
      ELSE
        INSERT INTO "MetaToken" (
          id, "agencyId", "hotelClientId", "encryptedToken", "tokenExpiresAt",
          status, "createdAt", "tokenSource", "oauthScopes", "refreshableViaOAuth",
          "connectedFacebookUserId", "connectedFacebookUserName",
          "disconnectedAt", "lastRefreshedAt", "expiryWarningStage"
        )
        VALUES (
          gen_random_uuid()::text, t."agencyId", h.id, t."encryptedToken",
          t."tokenExpiresAt", t.status, t."createdAt", t."tokenSource",
          t."oauthScopes", t."refreshableViaOAuth", t."connectedFacebookUserId",
          t."connectedFacebookUserName", t."disconnectedAt", t."lastRefreshedAt",
          t."expiryWarningStage"
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Drop any token that couldn't be attached to a hotel (the agency had no hotel
--    with an ad account mapped). Such tokens are now unusable — the agency will
--    reconnect per hotel through the new UI.
DELETE FROM "MetaToken" WHERE "hotelClientId" IS NULL;

-- 4. Enforce the hotel-scoped shape: NOT NULL + FK + one token per hotel.
ALTER TABLE "MetaToken" ALTER COLUMN "hotelClientId" SET NOT NULL;

ALTER TABLE "MetaToken"
  ADD CONSTRAINT "MetaToken_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MetaToken_hotelClientId_key" ON "MetaToken"("hotelClientId");
