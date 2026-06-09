-- ─────────────────────────────────────────────────────────────────────────────
-- Monthly ad-budget tracking + Slack/email budget alerts.
--   • HotelClient gains a monthly budget (paise), an enable flag, and a reset day.
--   • Agency gains Slack webhook + email-alert notification settings.
--   • BudgetAlert dedups threshold alerts (80/90/100%) to once per month.
--   • AlertType gains `budget_threshold` (reuses the existing in-app Alert + email).
-- ─────────────────────────────────────────────────────────────────────────────

-- New enum value (added on its own; never used within this migration, so it's
-- safe under PostgreSQL's "can't use a new enum value in the same transaction").
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'budget_threshold';

-- HotelClient: per-hotel monthly ad budget.
ALTER TABLE "HotelClient" ADD COLUMN "monthlyAdBudget" INTEGER;
ALTER TABLE "HotelClient" ADD COLUMN "budgetTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelClient" ADD COLUMN "budgetResetDay" INTEGER NOT NULL DEFAULT 1;

-- Agency: notification settings.
ALTER TABLE "Agency" ADD COLUMN "slackWebhookUrl" TEXT;
ALTER TABLE "Agency" ADD COLUMN "slackEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Agency" ADD COLUMN "slackLastTestAt" TIMESTAMP(3);
ALTER TABLE "Agency" ADD COLUMN "slackLastTestStatus" TEXT;
ALTER TABLE "Agency" ADD COLUMN "alertEmailAddress" TEXT;
ALTER TABLE "Agency" ADD COLUMN "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- BudgetAlert: dedup + delivery tracking.
CREATE TABLE "BudgetAlert" (
    "id"                TEXT NOT NULL,
    "agencyId"          TEXT NOT NULL,
    "hotelClientId"     TEXT NOT NULL,
    "threshold"         INTEGER NOT NULL,
    "monthKey"          TEXT NOT NULL,
    "spendAtTrigger"    INTEGER NOT NULL,
    "budgetAtTrigger"   INTEGER NOT NULL,
    "triggeredAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt"    TIMESTAMP(3),
    "notificationsSent" JSONB NOT NULL,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetAlert_hotelClientId_threshold_monthKey_key"
  ON "BudgetAlert"("hotelClientId", "threshold", "monthKey");
CREATE INDEX "BudgetAlert_agencyId_idx" ON "BudgetAlert"("agencyId");
CREATE INDEX "BudgetAlert_hotelClientId_idx" ON "BudgetAlert"("hotelClientId");

ALTER TABLE "BudgetAlert"
  ADD CONSTRAINT "BudgetAlert_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAlert"
  ADD CONSTRAINT "BudgetAlert_hotelClientId_fkey"
  FOREIGN KEY ("hotelClientId") REFERENCES "HotelClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same tenant_isolation policy as every other multi-tenant table.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['BudgetAlert'];
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
