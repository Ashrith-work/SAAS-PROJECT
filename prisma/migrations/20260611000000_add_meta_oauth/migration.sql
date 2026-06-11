-- Meta OAuth (Facebook Login for Business) support, added alongside the existing
-- manual long-lived token flow. The token stays AGENCY-scoped; these columns just
-- record how it was obtained and the metadata the OAuth path captures.

-- CreateEnum
CREATE TYPE "MetaTokenSource" AS ENUM ('OAUTH', 'MANUAL_LONG_LIVED');

-- AlterTable
ALTER TABLE "MetaToken"
  ADD COLUMN "tokenSource" "MetaTokenSource" NOT NULL DEFAULT 'MANUAL_LONG_LIVED',
  ADD COLUMN "oauthScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "refreshableViaOAuth" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectedFacebookUserId" TEXT,
  ADD COLUMN "connectedFacebookUserName" TEXT,
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "expiryWarningStage" TEXT;
