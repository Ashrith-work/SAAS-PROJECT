import "server-only";

// Slack Incoming Webhook delivery for budget alerts. One webhook URL per agency;
// all alerts post to that one channel (no OAuth app, no per-channel routing).
//
// RESILIENCE: postSlackWebhook never throws — it returns a result object so the
// cron can log a failure and still deliver the in-app + email notifications.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in").replace(/\/+$/, "");

export type SlackResult = { ok: boolean; status?: number; error?: string };

/** Basic shape check for a Slack Incoming Webhook URL. */
export function isSlackWebhookUrl(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/hooks\.slack\.com\/services\/\S+/.test(url.trim());
}

/** POSTs a JSON payload to a Slack webhook. Never throws. */
export async function postSlackWebhook(url: string, payload: unknown): Promise<SlackResult> {
  if (!isSlackWebhookUrl(url)) {
    return { ok: false, error: "That doesn't look like a Slack Incoming Webhook URL (https://hooks.slack.com/services/…)." };
  }
  try {
    const res = await fetch(url.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `Slack returned HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error posting to Slack." };
  }
}

// Per-threshold visual accent: amber → orange → red as urgency rises.
const THRESHOLD_ACCENT: Record<number, { color: string; emoji: string }> = {
  80: { color: "#d97706", emoji: "⚠" },
  90: { color: "#f97316", emoji: "⚠⚠" },
  100: { color: "#dc2626", emoji: "🚨" },
};

/** The Block Kit message for a budget threshold alert (color bar by threshold). */
export function buildBudgetSlackMessage(a: {
  hotelName: string;
  hotelId: string;
  threshold: number;
  spendLabel: string;
  budgetLabel: string;
  pct: number;
}) {
  const accent = THRESHOLD_ACCENT[a.threshold] ?? THRESHOLD_ACCENT[100];
  return {
    text: `${accent.emoji} Budget alert: ${a.hotelName} — ${a.threshold}% of ad budget reached`,
    attachments: [
      {
        color: accent.color,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `${accent.emoji} ${a.threshold}% Budget Reached`, emoji: true },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Hotel:*\n${a.hotelName}` },
              { type: "mrkdwn", text: `*Spend:*\n${a.spendLabel}` },
              { type: "mrkdwn", text: `*Budget:*\n${a.budgetLabel}` },
              { type: "mrkdwn", text: `*Progress:*\n${a.pct}%` },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Dashboard" },
                url: `${APP_URL}/agency/hotel/${a.hotelId}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** The "Test connection" message. */
export function buildSlackTestMessage() {
  return {
    text: "✓ HotelTrack Slack integration test successful. Future budget alerts will appear here.",
  };
}
