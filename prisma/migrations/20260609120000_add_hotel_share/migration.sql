-- ─────────────────────────────────────────────────────────────────────────────
-- Hotel-owner share link: a public, read-only dashboard at /h/<shareToken>.
--
--   • HotelClient gains a persistent 256-bit shareToken (+ created/revoked flags)
--     and a showAdSpendToHotel toggle (default OFF — hide ad spend from hotels).
--   • HotelShareAccess logs each public view (salted-hashed IP only) so the
--     agency gets an access audit trail.
--
-- Multi-tenant (agencyId) → HotelShareAccess gets the same tenant_isolation RLS
-- policy as every other table (matches 20260530100000_enable_rls).
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable: hotel share-link columns.
ALTER TABLE "HotelClient" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "HotelClient" ADD COLUMN "shareTokenCreatedAt" TIMESTAMP(3);
ALTER TABLE "HotelClient" ADD COLUMN "shareTokenRevoked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelClient" ADD COLUMN "showAdSpendToHotel" BOOLEAN NOT NULL DEFAULT false;

-- The token is the unguessable public id in the URL — must be unique.
CREATE UNIQUE INDEX "HotelClient_shareToken_key" ON "HotelClient"("shareToken");

-- CreateTable: public-view access log.
CREATE TABLE "HotelShareAccess" (
    "id"            TEXT NOT NULL,
    "agencyId"      TEXT NOT NULL,
    "hotelClientId" TEXT NOT NULL,
    "accessedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash"        TEXT,
    "userAgent"     TEXT,

    CONSTRAINT "HotelShareAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelShareAccess_agencyId_idx" ON "HotelShareAccess"("agencyId");
CREATE INDEX "HotelShareAccess_hotelClientId_accessedAt_idx" ON "HotelShareAccess"("hotelClientId", "accessedAt");

ALTER TABLE "HotelShareAccess"
    ADD CONSTRAINT "HotelShareAccess_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelShareAccess"
    ADD CONSTRAINT "HotelShareAccess_hotelClientId_fkey"
    FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['HotelShareAccess'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ('
      '  current_setting(''app.bypass_rls'', true) = ''on'''
      '  OR "agencyId" = current_setting(''app.current_agency_id'', true)'
      ') '
      'WITH CHECK ('
      '  current_setting(''app.bypass_rls'', true) = ''on'''
      '  OR "agencyId" = current_setting(''app.current_agency_id'', true)'
      ')',
      t
    );
  END LOOP;
END $$;

-- The app role's grants come from ALTER DEFAULT PRIVILEGES (enable_rls
-- migration), which covers tables created by the owner afterwards. No explicit
-- GRANT needed.
