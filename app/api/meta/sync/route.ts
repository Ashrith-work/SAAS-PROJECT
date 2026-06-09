import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import type { SecretToken } from "@/lib/encryption";
import { getDailyInsights, getDailyCampaignInsights, MetaAuthError } from "@/lib/meta";
import { runDailyAlerts, type RunAlertsResult } from "@/lib/alerts";
import { recordSyncFailure } from "@/lib/backfill";
import { refreshCampaignPerformance } from "@/lib/campaign-attribution";

// Scheduled Meta Ads sync. Runs on Vercel Cron once a day (see vercel.json) and
// can be triggered manually for testing. Guarded by CRON_SECRET — Vercel Cron
// sends `Authorization: Bearer <CRON_SECRET>` automatically.
//
// For every agency with a CONNECTED Meta token, it pulls daily insights for
// each hotel that has an ad account mapped and upserts one AdSnapshot per day.
// Idempotent: the unique [hotelClientId, date] key means re-running overwrites
// the same day's row with fresh numbers rather than duplicating.
//
// Resilient: a dead token disconnects just that agency; one hotel's error never
// aborts the whole job. NEVER logs or returns the access token.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Higher ceiling: this daily run also does the (rate-limit-spaced) social sync.
// Capped to the plan's max; partial work persists via idempotent upserts.
export const maxDuration = 300;

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

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

  // How many trailing days to (re)sync. Re-syncing a small window each run keeps
  // recent days fresh as Meta finalises late-attributed conversions.
  const url = new URL(request.url);
  const daysRaw = url.searchParams.get("days");
  const daysParam = daysRaw == null ? NaN : Number(daysRaw);
  const days = Number.isFinite(daysParam)
    ? Math.min(Math.max(Math.trunc(daysParam), 1), 90)
    : 7;

  const now = new Date();
  const range = {
    since: ymd(new Date(now.getTime() - (days - 1) * DAY_MS)),
    until: ymd(now),
  };

  const tokens = await prisma.metaToken.findMany({
    where: { status: "connected" },
    select: { id: true, agencyId: true },
  });

  let agenciesProcessed = 0;
  let hotelsSynced = 0;
  let snapshotsWritten = 0;
  let campaignSnapshotsWritten = 0;
  let tokensDisconnected = 0;
  const errors: { agencyId: string; hotelId?: string; error: string }[] = [];

  for (const token of tokens) {
    agenciesProcessed += 1;

    const hotels = await prisma.hotelClient.findMany({
      where: { agencyId: token.agencyId, metaAdAccountId: { not: null } },
      select: { id: true, metaAdAccountId: true },
    });
    if (hotels.length === 0) continue;

    let accessToken: SecretToken;
    try {
      accessToken = await getTokenForApiCall("meta_ads", token.id, {
        agencyId: token.agencyId,
        source: "api:/api/meta/sync",
      });
    } catch {
      errors.push({ agencyId: token.agencyId, error: "Could not decrypt token." });
      continue;
    }

    for (const hotel of hotels) {
      const accountId = hotel.metaAdAccountId!;
      try {
        const rows = await getDailyInsights(accessToken.reveal(), accountId, range);

        for (const row of rows) {
          if (!row.date) continue;
          const date = new Date(`${row.date}T00:00:00.000Z`);
          const data = {
            metaAccountId: accountId,
            spend: row.spend.toFixed(2),
            impressions: row.impressions,
            reach: row.reach,
            clicks: row.clicks,
            ctr: row.ctr,
            cpc: row.cpc.toFixed(4),
            cpm: row.cpm.toFixed(4),
            conversions: row.conversions,
            roas: row.roas,
            pixelPurchases: row.pixelPurchases,
            pixelLeads: row.pixelLeads,
            pixelPageViews: row.pixelPageViews,
          };
          await prisma.adSnapshot.upsert({
            where: {
              hotelClientId_metaAccountId_date: {
                hotelClientId: hotel.id,
                metaAccountId: accountId,
                date,
              },
            },
            create: { agencyId: token.agencyId, hotelClientId: hotel.id, date, ...data },
            update: data,
          });
          snapshotsWritten += 1;
        }

        // Campaign-level insights (same window) → AdCampaignSnapshot, then
        // recompute the materialized campaign↔booking attribution for the
        // window. Same idempotent-upsert pattern as the account-level rows.
        const campaignRows = await getDailyCampaignInsights(
          accessToken.reveal(),
          accountId,
          range,
        );
        for (const row of campaignRows) {
          const date = new Date(`${row.date}T00:00:00.000Z`);
          const data = {
            metaAccountId: accountId,
            campaignName: row.campaignName,
            spend: row.spend.toFixed(2),
            impressions: row.impressions,
            clicks: row.clicks,
            conversions: row.conversions,
            purchaseValue: row.purchaseValue.toFixed(2),
          };
          await prisma.adCampaignSnapshot.upsert({
            where: {
              hotelClientId_metaCampaignId_date: {
                hotelClientId: hotel.id,
                metaCampaignId: row.campaignId,
                date,
              },
            },
            create: {
              agencyId: token.agencyId,
              hotelClientId: hotel.id,
              metaCampaignId: row.campaignId,
              date,
              ...data,
            },
            update: data,
          });
          campaignSnapshotsWritten += 1;
        }
        await refreshCampaignPerformance(
          token.agencyId,
          hotel.id,
          new Date(`${range.since}T00:00:00.000Z`),
          now,
        );

        await prisma.hotelClient.update({
          where: { id: hotel.id },
          data: { lastSyncedAt: new Date() },
        });
        hotelsSynced += 1;
      } catch (err) {
        if (err instanceof MetaAuthError) {
          // Token is dead — mark it expired, record a SyncFailure so the gap is
          // never silent, and stop syncing this agency's hotels. Reconnecting
          // will backfill the window and resolve the failure.
          await prisma.metaToken.update({
            where: { id: token.id },
            data: { status: "expired" },
          });
          await recordSyncFailure(
            token.agencyId,
            null,
            "meta_ads",
            err.message || "Meta token expired/revoked during sync.",
          );
          tokensDisconnected += 1;
          errors.push({
            agencyId: token.agencyId,
            error: "Meta token expired/revoked — marked expired.",
          });
          break;
        }
        errors.push({
          agencyId: token.agencyId,
          hotelId: hotel.id,
          error: err instanceof Error ? err.message : "Unknown sync error.",
        });
      }
    }
  }

  // Instagram organic now syncs separately via /api/instagram/sync (IGAA
  // connections, daily 6am cron) — this job is ADS ONLY.

  // Email alerts run after the data is fresh so performance/summary alerts
  // reflect the latest numbers. Fully isolated: a failure here NEVER affects the
  // sync result above. The weekly summary self-gates to Mondays inside the engine.
  let alerts: RunAlertsResult | { error: string };
  try {
    alerts = await runDailyAlerts({ now });
  } catch (err) {
    alerts = { error: err instanceof Error ? err.message : "Alerts run failed." };
  }

  return Response.json({
    ok: true,
    range,
    agenciesProcessed,
    hotelsSynced,
    snapshotsWritten,
    campaignSnapshotsWritten,
    tokensDisconnected,
    errors,
    alerts,
    syncedAt: now.toISOString(),
  });
}
