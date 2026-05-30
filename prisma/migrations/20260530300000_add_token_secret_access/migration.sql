-- ─────────────────────────────────────────────────────────────────────────────
-- LAYER 4 — database-level secret access hardening (see SECURITY.md).
--
-- The app role `hoteltrack_app` must NOT be able to SELECT the encrypted-secret
-- columns directly. Instead it reads them only through a SECURITY DEFINER
-- function that guarantees an audit-log row is written for every access.
--
-- Owner-safe: this only changes privileges for `hoteltrack_app` and creates a
-- function. The current owner connection is unaffected (it keeps full access),
-- so applying this migration changes nothing until the app runs as the role.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Replace the table-level SELECT grant with column-level grants that EXCLUDE
--    the ciphertext column. (You can't revoke a single column from a table-wide
--    SELECT grant, so we drop the table grant and re-grant the safe columns.)
REVOKE SELECT ON "MetaToken" FROM hoteltrack_app;
GRANT SELECT ("id", "agencyId", "tokenExpiresAt", "status", "createdAt")
  ON "MetaToken" TO hoteltrack_app;

REVOKE SELECT ON "SocialAccount" FROM hoteltrack_app;
GRANT SELECT (
  "id", "agencyId", "hotelClientId", "platform", "igUserId", "username",
  "tokenExpiresAt", "status", "lastSyncedAt", "createdAt"
) ON "SocialAccount" TO hoteltrack_app;

REVOKE SELECT ON "GoogleAnalyticsConnection" FROM hoteltrack_app;
GRANT SELECT (
  "id", "agencyId", "hotelClientId", "propertyId", "status", "lastSyncedAt", "createdAt"
) ON "GoogleAnalyticsConnection" TO hoteltrack_app;

-- INSERT/UPDATE/DELETE remain table-level (granted by the RLS migration), so the
-- app can still WRITE the ciphertext when saving/rotating a token — it just can't
-- read it back directly.

-- 2. The only sanctioned reader: a SECURITY DEFINER function that runs as the
--    owner (so it can read the column), writes a TokenAuditLog row, and returns
--    the ciphertext. This makes auditing inseparable from access.
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
  ELSIF p_table = 'SocialAccount' THEN
    SELECT "encryptedToken", "agencyId", "hotelClientId" INTO v_ct, v_agency, v_hotel
      FROM "SocialAccount" WHERE "id" = p_id;
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

-- Only the app role may execute it (not arbitrary PUBLIC).
REVOKE ALL ON FUNCTION app_read_encrypted_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_read_encrypted_secret(text, text) TO hoteltrack_app;
