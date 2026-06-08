-- Add the account-level "views" metric to SocialSnapshot (v22+ successor to the
-- retired "impressions" metric). Nullable-safe default so existing rows are 0.
ALTER TABLE "SocialSnapshot" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0;
