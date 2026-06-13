-- Agency contact info shown to hotel owners on their dashboard. All nullable for
-- backward-compat: existing agencies read as null (prompted via a banner), new
-- signups are required to fill them (enforced in the app, not the DB).
ALTER TABLE "Agency" ADD COLUMN "mobile" TEXT;
ALTER TABLE "Agency" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Agency" ADD COLUMN "address" TEXT;
ALTER TABLE "Agency" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Agency" ADD COLUMN "whatsappNumber" TEXT;
