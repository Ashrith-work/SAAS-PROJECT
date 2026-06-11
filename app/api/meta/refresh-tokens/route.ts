import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import { encryptWithAudit } from "@/lib/token-audit";
import {
  exchangeForLongLivedToken,
  nextExpiryWarning,
  MetaAuthError,
  type ExpiryWarning,
} from "@/lib/meta";
import { sendEmail, renderEmail, lead, p, statTable, statRow } from "@/lib/email";

// Daily Meta token maintenance (Vercel Cron, see vercel.json). Guarded by
// CRON_SECRET. Two jobs in one pass over connected tokens:
//
//   OAUTH tokens   → auto-refresh when ≤7 days from expiry (a fresh fb_exchange
//                    pushes expiry back ~60 days). On failure: status="expired"
//                    + notify the agency.
//   MANUAL tokens  → can't be refreshed (Meta needs user re-auth). Email a
//                    14-day heads-up, a 7-day urgent notice, and an at-expiry
//                    notice (each sent at most once via expiryWarningStage), and
//                    flip status="expired" once past expiry.
//
// Resilient: one token's failure never aborts the run. NEVER logs the token.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const DAY_MS = 86_400_000;
const LOG = "[META-REFRESH]";

function isNeverExpires(d: Date): boolean {
  return d.getUTCFullYear() >= 2900;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

function recipientFor(agency: {
  email: string;
  alertEmailAddress: string | null;
}): string | null {
  return agency.alertEmailAddress || agency.email || null;
}

async function emailRefreshFailed(
  to: string,
  agencyName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "[HotelTrack] Your Meta connection needs reconnecting",
    html: renderEmail({
      heading: "Meta connection expired",
      preheader: "We couldn't refresh your Meta (Facebook) connection automatically.",
      accent: "critical",
      bodyHtml:
        lead(`We tried to automatically refresh ${agencyName ? `${agencyName}'s` : "your"} Meta (Facebook) connection but Meta rejected it.`) +
        p("Ad-spend and ROI syncing is paused until you reconnect. Reconnecting with Facebook Login takes about a minute and restores auto-refresh."),
      cta: appUrl() ? { label: "Reconnect Meta", url: `${appUrl()}/agency/settings` } : undefined,
    }),
  });
}

async function emailManualWarning(
  to: string,
  stage: ExpiryWarning,
  daysToExpiry: number,
  expiresAt: Date,
): Promise<void> {
  const expired = stage === "expired";
  await sendEmail({
    to,
    subject: expired
      ? "[HotelTrack] Your Meta token has expired"
      : `[HotelTrack] Your Meta token expires in ${Math.max(0, Math.ceil(daysToExpiry))} days`,
    html: renderEmail({
      heading: expired ? "Meta token expired" : "Meta token expiring soon",
      preheader: expired
        ? "Reconnect to resume ad-spend and ROI syncing."
        : "Reconnect via Facebook Login to enable automatic refresh.",
      accent: expired ? "critical" : stage === "7d" ? "warning" : "info",
      bodyHtml:
        lead(
          expired
            ? "Your manually-pasted Meta access token has expired, so ad-spend and ROI syncing is paused."
            : `Your manually-pasted Meta access token expires soon.`,
        ) +
        statTable(
          statRow("Status", expired ? "Expired" : `Expires in ${Math.max(0, Math.ceil(daysToExpiry))} day(s)`) +
            statRow("Expiry", expiresAt.toLocaleDateString()),
        ) +
        p("Reconnecting with <strong>Facebook Login</strong> instead of a pasted token lets HotelTrack refresh it automatically, so this won't happen again."),
      cta: appUrl() ? { label: "Reconnect Meta", url: `${appUrl()}/agency/settings` } : undefined,
    }),
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tokens = await prisma.metaToken.findMany({
    where: { status: "connected" },
    select: {
      id: true,
      agencyId: true,
      tokenExpiresAt: true,
      tokenSource: true,
      refreshableViaOAuth: true,
      expiryWarningStage: true,
      agency: { select: { name: true, email: true, alertEmailAddress: true } },
    },
  });

  let refreshed = 0;
  let refreshFailed = 0;
  let warned = 0;
  let expiredMarked = 0;
  const errors: { agencyId: string; error: string }[] = [];

  for (const token of tokens) {
    try {
      if (isNeverExpires(token.tokenExpiresAt)) continue; // system-user / non-expiring
      const daysToExpiry = (token.tokenExpiresAt.getTime() - now.getTime()) / DAY_MS;

      // ── OAuth: auto-refresh inside the 7-day window ──
      if (token.tokenSource === "OAUTH" && token.refreshableViaOAuth) {
        if (daysToExpiry > 7) continue;

        try {
          const current = await getTokenForApiCall("meta_ads", token.id, {
            agencyId: token.agencyId,
            source: "cron:meta-refresh",
          });
          const fresh = await exchangeForLongLivedToken(current.reveal());
          const encryptedToken = await encryptWithAudit(fresh.accessToken, {
            agencyId: token.agencyId,
            tokenType: "meta_ads",
            source: "cron:meta-refresh",
            action: "refreshed",
          });
          await prisma.metaToken.update({
            where: { id: token.id },
            data: {
              encryptedToken,
              tokenExpiresAt: fresh.expiresAt ?? new Date(now.getTime() + 60 * DAY_MS),
              lastRefreshedAt: now,
              expiryWarningStage: null,
            },
          });
          refreshed += 1;
          console.log(`${LOG} refreshed OAuth token for agency ${token.agencyId}`);
        } catch (err) {
          // Refresh failed (token already dead, or Meta error). Mark expired +
          // notify so the agency reconnects. MetaAuthError is the common case.
          refreshFailed += 1;
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`${LOG} OAuth refresh FAILED for agency ${token.agencyId}: ${reason}`);
          await prisma.metaToken.update({
            where: { id: token.id },
            data: { status: "expired", expiryWarningStage: "expired" },
          });
          expiredMarked += 1;
          const to = recipientFor(token.agency);
          if (to && token.expiryWarningStage !== "expired") {
            await emailRefreshFailed(to, token.agency.name);
          }
          if (!(err instanceof MetaAuthError)) {
            errors.push({ agencyId: token.agencyId, error: reason });
          }
        }
        continue;
      }

      // ── Manual: warn (14d / 7d / expired), each at most once ──
      const stage = nextExpiryWarning(daysToExpiry, token.expiryWarningStage);
      if (!stage) continue;

      const to = recipientFor(token.agency);
      if (to) {
        await emailManualWarning(to, stage, daysToExpiry, token.tokenExpiresAt);
        warned += 1;
      }
      await prisma.metaToken.update({
        where: { id: token.id },
        data: {
          expiryWarningStage: stage,
          // At expiry, also flip status so the dashboard shows the reconnect banner.
          ...(stage === "expired" ? { status: "expired" } : {}),
        },
      });
      if (stage === "expired") expiredMarked += 1;
    } catch (err) {
      errors.push({
        agencyId: token.agencyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    ok: true,
    tokensChecked: tokens.length,
    refreshed,
    refreshFailed,
    warned,
    expiredMarked,
    errors,
  });
}
