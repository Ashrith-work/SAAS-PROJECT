-- Defensive surfacing of broken integrations: a per-connection flag the dashboard
-- reads to show a one-click "Reconnect needed" banner, plus the raw provider error.
-- Storage architecture is unchanged — these are additive, nullable/defaulted columns.

-- AlterTable
ALTER TABLE "InstagramConnection"
  ADD COLUMN "requiresReconnect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastErrorReason" TEXT;

-- AlterTable
ALTER TABLE "Ga4Connection"
  ADD COLUMN "requiresReconnect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastErrorReason" TEXT;
