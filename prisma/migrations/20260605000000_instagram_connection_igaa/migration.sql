-- ─────────────────────────────────────────────────────────────────────────────
-- Instagram restructure: SocialAccount (EAA-via-Page) → InstagramConnection
-- (IGAA via "Instagram API with Instagram Login").
--
-- Two completely separate Meta connections going forward:
--   • Meta Ads  — EAA token (MetaToken, unchanged)
--   • Instagram — IGAA token via OAuth on graph.instagram.com (this table)
--
-- Existing rows (created during the EAA-era debugging) are kept but stamped
-- tokenType 'eaa_via_page' + status 'deprecated_eaa' and never used again.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Rename the table and its constraints/indexes to Prisma's expected names.
ALTER TABLE "SocialAccount" RENAME TO "InstagramConnection";
ALTER INDEX "SocialAccount_pkey" RENAME TO "InstagramConnection_pkey";
ALTER INDEX "SocialAccount_agencyId_idx" RENAME TO "InstagramConnection_agencyId_idx";
ALTER INDEX "SocialAccount_hotelClientId_idx" RENAME TO "InstagramConnection_hotelClientId_idx";
ALTER TABLE "InstagramConnection" RENAME CONSTRAINT "SocialAccount_agencyId_fkey" TO "InstagramConnection_agencyId_fkey";
ALTER TABLE "InstagramConnection" RENAME CONSTRAINT "SocialAccount_hotelClientId_fkey" TO "InstagramConnection_hotelClientId_fkey";

-- 2. New IGAA fields.
ALTER TABLE "InstagramConnection"
  ADD COLUMN "tokenType"       TEXT NOT NULL DEFAULT 'igaa_direct',
  ADD COLUMN "igAccountType"   TEXT,
  ADD COLUMN "profilePicUrl"   TEXT,
  ADD COLUMN "errorMessage"    TEXT,
  ADD COLUMN "lastRefreshedAt" TIMESTAMP(3);

-- New connections are created by the OAuth callback as "active".
ALTER TABLE "InstagramConnection" ALTER COLUMN "status" SET DEFAULT 'active';

-- 3. Deprecate every pre-existing (EAA-era) row. New connections all use IGAA.
UPDATE "InstagramConnection"
SET "tokenType" = 'eaa_via_page', "status" = 'deprecated_eaa';

-- 4. This table is Instagram-only now: drop platform, one connection per hotel.
DROP INDEX "SocialAccount_hotelClientId_platform_key";
ALTER TABLE "InstagramConnection" DROP COLUMN "platform";
CREATE UNIQUE INDEX "InstagramConnection_hotelClientId_key" ON "InstagramConnection"("hotelClientId");

-- 5. Refresh the app role's column-level SELECT grant (the old grant referenced
--    the dropped column set; ciphertext stays excluded — see SECURITY.md).
REVOKE SELECT ON "InstagramConnection" FROM hoteltrack_app;
GRANT SELECT (
  "id", "agencyId", "hotelClientId", "tokenType", "igUserId", "username",
  "igAccountType", "profilePicUrl", "tokenExpiresAt", "status", "errorMessage",
  "lastSyncedAt", "lastRefreshedAt", "createdAt"
) ON "InstagramConnection" TO hoteltrack_app;

-- 6. Update the security-definer reader for the renamed table. The
--    'SocialAccount' branch is gone — that table no longer exists.
CREATE OR REPLACE FUNCTION app_read_encrypted_secret(p_table text, p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ct     text;
  v_agency text;
  v_hotel  text;
  v_type   text;
BEGIN
  IF p_table = 'MetaToken' THEN
    SELECT "encryptedToken", "agencyId", NULL INTO v_ct, v_agency, v_hotel
      FROM "MetaToken" WHERE "id" = p_id;
    v_type := 'meta_ads';
  ELSIF p_table = 'InstagramConnection' THEN
    SELECT "encryptedToken", "agencyId", "hotelClientId" INTO v_ct, v_agency, v_hotel
      FROM "InstagramConnection" WHERE "id" = p_id;
    v_type := 'instagram';
  ELSIF p_table = 'GoogleAnalyticsConnection' THEN
    SELECT "encryptedCredentials", "agencyId", "hotelClientId" INTO v_ct, v_agency, v_hotel
      FROM "GoogleAnalyticsConnection" WHERE "id" = p_id;
    v_type := 'ga_credentials';
  ELSE
    RAISE EXCEPTION 'app_read_encrypted_secret: unknown table %', p_table;
  END IF;

  IF v_ct IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guarantee auditing: every ciphertext read writes an audit row.
  INSERT INTO "TokenAuditLog"
    ("id", "agencyId", "hotelClientId", "tokenType", "action", "success", "source", "createdAt")
  VALUES
    (gen_random_uuid()::text, v_agency, v_hotel, v_type, 'decrypted', true, 'db:security_definer', CURRENT_TIMESTAMP);

  RETURN v_ct;
END;
$$;
