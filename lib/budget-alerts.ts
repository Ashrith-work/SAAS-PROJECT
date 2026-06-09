import "server-only";

import { prisma } from "@/lib/prisma";
import {
  BUDGET_THRESHOLDS,
  budgetMonthBounds,
  calculateMonthlyAdSpend,
  rupeesFromPaise,
} from "@/lib/budget";
import { sendEmail, renderEmail, statTable, statRow, lead, p, esc } from "@/lib/email";
import { postSlackWebhook, buildBudgetSlackMessage, isSlackWebhookUrl } from "@/lib/slack";
import { formatCurrency } from "@/lib/format";

// Budget-threshold alert engine. Runs in the daily 3am cron (after the 2am Meta
// sync) and on demand at /api/budget/check. For every hotel with budget tracking
// on, it crosses 80/90/100% once per budget-month (BudgetAlert dedups), then
// fires up to three channels: in-app (an Alert row), email (Resend), Slack.
//
// RESILIENCE: never throws to the caller; a failing hotel/channel is recorded
// and the run continues.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in").replace(/\/+$/, "");
const inr = (paise: number) => formatCurrency(rupeesFromPaise(paise));

export type NotificationsSent = { inApp: boolean; email: boolean; slack: boolean };

export type RunBudgetResult = {
  agenciesProcessed: number;
  hotelsChecked: number;
  alertsRaised: number;
  notifications: { inApp: number; email: number; slack: number };
  errors: { hotelId: string; error: string }[];
};

type AgencyRow = {
  id: string;
  name: string;
  email: string;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  emailAlertsEnabled: boolean;
  alertEmailAddress: string | null;
  hotelClients: {
    id: string;
    name: string;
    monthlyAdBudget: number | null;
    budgetResetDay: number;
  }[];
};

export async function runBudgetAlerts(
  opts: { agencyId?: string; now?: Date; force?: boolean } = {},
): Promise<RunBudgetResult> {
  const now = opts.now ?? new Date();
  const result: RunBudgetResult = {
    agenciesProcessed: 0,
    hotelsChecked: 0,
    alertsRaised: 0,
    notifications: { inApp: 0, email: 0, slack: 0 },
    errors: [],
  };

  const agencies = (await prisma.agency.findMany({
    where: opts.agencyId ? { id: opts.agencyId } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      slackEnabled: true,
      slackWebhookUrl: true,
      emailAlertsEnabled: true,
      alertEmailAddress: true,
      hotelClients: {
        where: { budgetTrackingEnabled: true, monthlyAdBudget: { not: null } },
        select: { id: true, name: true, monthlyAdBudget: true, budgetResetDay: true },
      },
    },
  })) as AgencyRow[];

  for (const agency of agencies) {
    result.agenciesProcessed += 1;
    for (const hotel of agency.hotelClients) {
      result.hotelsChecked += 1;
      try {
        const budget = hotel.monthlyAdBudget!;
        if (budget <= 0) continue;
        const { monthKey, start, end } = budgetMonthBounds(hotel.budgetResetDay, now);
        const spend = await calculateMonthlyAdSpend({
          agencyId: agency.id,
          hotelClientId: hotel.id,
          resetDay: hotel.budgetResetDay,
          now,
        });
        const pct = (spend / budget) * 100;

        for (const threshold of BUDGET_THRESHOLDS) {
          if (pct < threshold) continue;

          // Dedup: at most one alert per (hotel, threshold, budget-month).
          const existing = await prisma.budgetAlert.findUnique({
            where: { hotelClientId_threshold_monthKey: { hotelClientId: hotel.id, threshold, monthKey } },
          });
          if (existing && !opts.force) continue;

          const row =
            existing ??
            (await prisma.budgetAlert.create({
              data: {
                agencyId: agency.id,
                hotelClientId: hotel.id,
                threshold,
                monthKey,
                spendAtTrigger: spend,
                budgetAtTrigger: budget,
                notificationsSent: { inApp: false, email: false, slack: false },
              },
            }));

          const sent = await fireNotifications({
            agency,
            hotel: { id: hotel.id, name: hotel.name },
            threshold,
            spend,
            budget,
            pct,
            periodLabel: periodLabel(start, end),
          });

          await prisma.budgetAlert.update({
            where: { id: row.id },
            data: { spendAtTrigger: spend, budgetAtTrigger: budget, notificationsSent: sent },
          });

          result.alertsRaised += 1;
          if (sent.inApp) result.notifications.inApp += 1;
          if (sent.email) result.notifications.email += 1;
          if (sent.slack) result.notifications.slack += 1;
        }
      } catch (err) {
        result.errors.push({ hotelId: hotel.id, error: err instanceof Error ? err.message : "unknown" });
      }
    }
  }

  return result;
}

function periodLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Delivers a single threshold alert across the three channels. Returns which
 * channels succeeded. Each channel is independent — a Slack failure never blocks
 * the email or the in-app record, and vice-versa.
 */
async function fireNotifications(input: {
  agency: AgencyRow;
  hotel: { id: string; name: string };
  threshold: number;
  spend: number;
  budget: number;
  pct: number;
  periodLabel: string;
}): Promise<NotificationsSent> {
  const { agency, hotel, threshold, spend, budget, pct } = input;
  const severity = threshold >= 90 ? "critical" : "warning";
  const pctRounded = Math.round(pct);
  const spendLabel = inr(spend);
  const budgetLabel = inr(budget);
  const dashboardUrl = `${APP_URL}/agency/hotel/${hotel.id}`;

  const sent: NotificationsSent = { inApp: false, email: false, slack: false };

  // ── EMAIL (sent first so its outcome can be recorded on the in-app Alert) ──
  const emailTo = input.agency.emailAlertsEnabled
    ? agency.alertEmailAddress?.trim() || agency.email?.trim() || null
    : null;
  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  let emailError: string | null = input.agency.emailAlertsEnabled ? null : "Email alerts disabled.";
  if (emailTo) {
    const subject = `[HotelTrack] ${threshold}% budget alert - ${hotel.name}`;
    const bodyHtml =
      lead(`Budget alert for <strong>${esc(hotel.name)}</strong>`) +
      statTable(
        statRow("Threshold", `${threshold}%`) +
          statRow("Current spend", spendLabel) +
          statRow("Monthly budget", budgetLabel) +
          statRow("Period", input.periodLabel),
      ) +
      p("Open the hotel's dashboard to review campaign spend and pace.");
    const text =
      `Hi,\n\nBudget alert for ${hotel.name}:\n` +
      `• Threshold: ${threshold}%\n• Current spend: ${spendLabel}\n` +
      `• Monthly budget: ${budgetLabel}\n• Period: ${input.periodLabel}\n\n` +
      `View details: ${dashboardUrl}\n\n— HotelTrack`;
    const res = await sendEmail({
      to: emailTo,
      subject,
      html: renderEmail({
        heading: `${threshold}% ad-budget reached`,
        preheader: `${hotel.name} has used ${pctRounded}% of its monthly ad budget.`,
        accent: severity,
        bodyHtml,
        cta: { label: "View dashboard", url: dashboardUrl },
      }),
      text,
    });
    if (res.ok) {
      emailStatus = "sent";
      sent.email = true;
    } else {
      emailStatus = res.skipped ? "skipped" : "failed";
      emailError = res.error ?? "Email send failed.";
    }
  }

  // ── IN-APP (an Alert row → /agency/alerts) ──
  try {
    await prisma.alert.create({
      data: {
        agencyId: agency.id,
        hotelClientId: hotel.id,
        type: "budget_threshold",
        severity,
        title: `${hotel.name}: ${threshold}% of ad budget consumed`,
        message: `⚠ ${hotel.name}: ${threshold}% of ad budget consumed (${spendLabel} of ${budgetLabel}).`,
        emailTo,
        emailStatus,
        emailError,
      },
    });
    sent.inApp = true;
  } catch (err) {
    console.error("[BUDGET-ALERT] in-app Alert create failed for hotel", hotel.id, err);
  }

  // ── SLACK ──
  if (input.agency.slackEnabled && isSlackWebhookUrl(agency.slackWebhookUrl)) {
    const res = await postSlackWebhook(
      agency.slackWebhookUrl!,
      buildBudgetSlackMessage({ hotelName: hotel.name, hotelId: hotel.id, threshold, spendLabel, budgetLabel, pct: pctRounded }),
    );
    if (res.ok) {
      sent.slack = true;
    } else {
      // Log but never crash the cron (spec requirement).
      console.error("[BUDGET-ALERT] Slack post failed for hotel", hotel.id, res.error);
    }
  }

  return sent;
}
