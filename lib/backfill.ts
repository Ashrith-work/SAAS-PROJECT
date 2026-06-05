import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import type { SecretToken } from "@/lib/encryption";
import { getDailyInsights, MetaAuthError } from "@/lib/meta";
import { getAccountInsights, getMediaInsights, InstagramAuthError } from "@/lib/instagram";

// Automatic backfill engine. When an agency reconnects a Meta/Instagram token,
// we fill the gap between the last stored snapshot and yesterday so the
// dashboard has no visual holes. It is driven by a BackfillJob row that the UI
// polls for live progress.
//
// EFFICIENCY: insight calls fetch a whole date range in one request
// (`getDailyInsights` / `getAccountInsights` already use per-day breakdowns), so
// a typical ≤60-day gap is a handful of calls. Long gaps are split into ≤30-day
// chunks with a short delay to stay well under Meta's ~200 calls/hour limit.
//
// RESILIENCE: a dead token never aborts the whole job — it's logged to
// BackfillLog + SyncFailure and the run continues; partial results persist via
// idempotent upserts (same unique keys the scheduled sync uses).
//
// SECURITY: tokens are resolved only via getTokenForApiCall and never logged.

const DAY_MS = 86_400_000;
const CHUNK_DAYS = 30;
const CHUNK_DELAY_MS = 1500;
const MAX_GAP_DAYS = 90; // a 60-day token can't have left a longer real gap

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Midnight-UTC Date for "yesterday" — Meta's current day is always incomplete. */
function yesterday(now = new Date()): Date {
  return new Date(`${ymd(new Date(now.getTime() - DAY_MS))}T00:00:00.000Z`);
}

export type Gap = { start: Date; end: Date; days: number };

/**
 * The missing window after `lastDate`, bounded to yesterday and capped at
 * MAX_GAP_DAYS. Returns null when there's no baseline snapshot (nothing to
 * anchor a bounded range) or when the data is already current.
 */
export function computeGap(lastDate: Date | null, now = new Date()): Gap | null {
  if (!lastDate) return null;
  const end = yesterday(now);
  let start = new Date(lastDate.getTime() + DAY_MS);
  // Normalise to midnight UTC.
  start = new Date(`${ymd(start)}T00:00:00.000Z`);
  if (start > end) return null;
  const earliest = new Date(end.getTime() - (MAX_GAP_DAYS - 1) * DAY_MS);
  if (start < earliest) start = earliest;
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return { start, end, days };
}

/** Split a gap into ≤CHUNK_DAYS ranges of "YYYY-MM-DD" strings. */
function chunkRanges(gap: Gap): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  let cursor = gap.start;
  while (cursor <= gap.end) {
    const chunkEnd = new Date(
      Math.min(cursor.getTime() + (CHUNK_DAYS - 1) * DAY_MS, gap.end.getTime()),
    );
    out.push({ since: ymd(cursor), until: ymd(chunkEnd) });
    cursor = new Date(chunkEnd.getTime() + DAY_MS);
  }
  return out;
}

async function lastAdDate(agencyId: string, hotelClientId: string): Promise<Date | null> {
  const row = await prisma.adSnapshot.findFirst({
    where: { agencyId, hotelClientId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

async function lastSocialDate(agencyId: string, hotelClientId: string): Promise<Date | null> {
  const row = await prisma.socialSnapshot.findFirst({
    where: { agencyId, hotelClientId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

/**
 * Days of missing ad data for a hotel (last AdSnapshot → yesterday), or 0 when
 * current. Used for the dashboard "N days of data missing" badge.
 */
export async function missingAdDays(agencyId: string, hotelClientId: string): Promise<number> {
  const gap = computeGap(await lastAdDate(agencyId, hotelClientId));
  return gap?.days ?? 0;
}

/**
 * Earliest gap start across an agency's hotels (ad + social), bounded to
 * yesterday — used to seed a BackfillJob's range on reconnect. Null when there's
 * nothing to backfill.
 */
export async function computeAgencyBackfillRange(
  agencyId: string,
): Promise<{ start: Date; end: Date } | null> {
  const now = new Date();
  const [adHotels, igAccounts] = await Promise.all([
    prisma.hotelClient.findMany({
      where: { agencyId, metaAdAccountId: { not: null } },
      select: { id: true },
    }),
    prisma.socialAccount.findMany({
      where: { agencyId, status: "connected", platform: "instagram" },
      select: { hotelClientId: true },
    }),
  ]);

  let earliest: Date | null = null;
  const consider = (gap: Gap | null) => {
    if (gap && (!earliest || gap.start < earliest)) earliest = gap.start;
  };
  for (const h of adHotels) consider(computeGap(await lastAdDate(agencyId, h.id), now));
  for (const a of igAccounts)
    consider(computeGap(await lastSocialDate(agencyId, a.hotelClientId), now));

  return earliest ? { start: earliest, end: yesterday(now) } : null;
}

// ── Backfill writers ──────────────────────────────────────────────────────────

async function backfillAds(
  agencyId: string,
  accumulate: (days: number) => void,
): Promise<{ anySuccess: boolean; tokenDead: boolean; failedDays: number; sampleError: string | null }> {
  let anySuccess = false;
  let tokenDead = false;
  let failedDays = 0;
  let sampleError: string | null = null;

  const token = await prisma.metaToken.findFirst({
    where: { agencyId, status: "connected" },
    select: { id: true },
  });
  if (!token) return { anySuccess, tokenDead, failedDays, sampleError };

  let secret: SecretToken;
  try {
    secret = await getTokenForApiCall("meta_ads", token.id, {
      agencyId,
      source: "backfill:ads",
    });
  } catch {
    return { anySuccess, tokenDead, failedDays, sampleError };
  }

  const hotels = await prisma.hotelClient.findMany({
    where: { agencyId, metaAdAccountId: { not: null } },
    select: { id: true, metaAdAccountId: true },
  });

  for (const hotel of hotels) {
    const gap = computeGap(await lastAdDate(agencyId, hotel.id));
    if (!gap) continue;
    const accountId = hotel.metaAdAccountId!;
    try {
      let written = 0;
      const chunks = chunkRanges(gap);
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await sleep(CHUNK_DELAY_MS);
        const rows = await getDailyInsights(secret.reveal(), accountId, chunks[i]);
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
            where: { hotelClientId_date: { hotelClientId: hotel.id, date } },
            create: { agencyId, hotelClientId: hotel.id, date, ...data },
            update: data,
          });
          written += 1;
        }
      }
      await prisma.hotelClient.update({
        where: { id: hotel.id },
        data: { lastSyncedAt: new Date() },
      });
      accumulate(written);
      anySuccess = true;
      await logBackfill(agencyId, hotel.id, "ad", gap, "success");
    } catch (err) {
      failedDays += gap.days;
      const message = err instanceof Error ? err.message : "Unknown ad backfill error.";
      sampleError ??= message;
      if (err instanceof MetaAuthError) {
        tokenDead = true;
        await prisma.metaToken.updateMany({
          where: { agencyId, status: "connected" },
          data: { status: "expired" },
        });
        await recordSyncFailure(agencyId, null, "meta_ads", err.message);
        await logBackfill(agencyId, hotel.id, "ad", gap, "failed", err.message);
        break; // token is dead for every hotel
      }
      await logBackfill(agencyId, hotel.id, "ad", gap, "failed", message);
    }
  }

  return { anySuccess, tokenDead, failedDays, sampleError };
}

async function backfillSocial(
  agencyId: string,
  accumulate: (days: number) => void,
): Promise<{ anySuccess: boolean; failedDays: number; sampleError: string | null }> {
  let anySuccess = false;
  let failedDays = 0;
  let sampleError: string | null = null;

  const accounts = await prisma.socialAccount.findMany({
    where: { agencyId, status: "connected", platform: "instagram" },
    select: { id: true, hotelClientId: true, igUserId: true },
  });

  for (const account of accounts) {
    const gap = computeGap(await lastSocialDate(agencyId, account.hotelClientId));
    if (!gap) continue;

    let secret: SecretToken;
    try {
      secret = await getTokenForApiCall("instagram", account.id, {
        agencyId,
        hotelClientId: account.hotelClientId,
        source: "backfill:social",
      });
    } catch {
      failedDays += gap.days;
      sampleError ??= "Token could not be decrypted.";
      await logBackfill(agencyId, account.hotelClientId, "social", gap, "failed", "Token could not be decrypted.");
      continue;
    }

    try {
      let written = 0;
      const chunks = chunkRanges(gap);
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await sleep(CHUNK_DELAY_MS);
        const insights = await getAccountInsights(secret.reveal(), account.igUserId, {
          since: new Date(`${chunks[i].since}T00:00:00.000Z`),
          until: new Date(`${chunks[i].until}T00:00:00.000Z`),
        });
        for (const day of insights.daily) {
          const date = new Date(`${day.date}T00:00:00.000Z`);
          const data = {
            followers: day.followers,
            reach: day.reach,
            impressions: day.impressions,
            profileViews: day.profileViews,
            engagement: 0,
          };
          await prisma.socialSnapshot.upsert({
            where: { hotelClientId_date: { hotelClientId: account.hotelClientId, date } },
            create: { agencyId, hotelClientId: account.hotelClientId, date, ...data },
            update: data,
          });
          written += 1;
        }
      }
      accumulate(written);
      anySuccess = true;
      await logBackfill(agencyId, account.hotelClientId, "social", gap, "success");

      // Refresh post metrics too (media fetch isn't date-ranged — re-pull the
      // most recent posts, capped at the Graph limit, and upsert by mediaId).
      try {
        const posts = await getMediaInsights(secret.reveal(), account.igUserId, 50, 350);
        for (const p of posts) {
          const data = {
            agencyId,
            caption: p.caption,
            mediaType: p.mediaType,
            permalink: p.permalink,
            postedAt: p.timestamp ? new Date(p.timestamp) : null,
            impressions: p.impressions,
            reach: p.reach,
            likes: p.likes,
            comments: p.comments,
            engagement: p.engagement,
            saves: p.saves,
            shares: p.shares,
            videoViews: p.videoViews,
            fetchedAt: new Date(),
          };
          await prisma.postSnapshot.upsert({
            where: {
              hotelClientId_mediaId: { hotelClientId: account.hotelClientId, mediaId: p.mediaId },
            },
            create: { hotelClientId: account.hotelClientId, mediaId: p.mediaId, ...data },
            update: data,
          });
        }
        await logBackfill(agencyId, account.hotelClientId, "post", gap, "success");
      } catch (err) {
        await logBackfill(
          agencyId,
          account.hotelClientId,
          "post",
          gap,
          "failed",
          err instanceof Error ? err.message : "Unknown post backfill error.",
        );
      }

      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), status: "connected" },
      });
    } catch (err) {
      failedDays += gap.days;
      const message = err instanceof Error ? err.message : "Unknown social backfill error.";
      sampleError ??= message;
      if (err instanceof InstagramAuthError) {
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { status: "expired" },
        });
        await recordSyncFailure(agencyId, account.hotelClientId, "instagram", err.message);
      }
      await logBackfill(agencyId, account.hotelClientId, "social", gap, "failed", message);
    }
  }

  return { anySuccess, failedDays, sampleError };
}

// ── Logging helpers ───────────────────────────────────────────────────────────

async function logBackfill(
  agencyId: string,
  hotelClientId: string,
  dataType: "ad" | "social" | "post",
  gap: Gap,
  status: "success" | "failed",
  errorMessage?: string,
) {
  await prisma.backfillLog.create({
    data: {
      agencyId,
      hotelClientId,
      dataType,
      dateRange: `${ymd(gap.start)}..${ymd(gap.end)}`,
      status,
      errorMessage: errorMessage ?? null,
    },
  });
}

/** Creates a SyncFailure unless an unresolved one already exists (dedupe). */
export async function recordSyncFailure(
  agencyId: string,
  hotelClientId: string | null,
  tokenType: "meta_ads" | "instagram",
  reason: string,
) {
  const existing = await prisma.syncFailure.findFirst({
    where: { agencyId, hotelClientId, tokenType, resolvedAt: null },
    select: { id: true },
  });
  if (existing) return;
  await prisma.syncFailure.create({
    data: { agencyId, hotelClientId, tokenType, reason },
  });
}

async function resolveSyncFailures(agencyId: string, tokenType: "meta_ads" | "instagram") {
  await prisma.syncFailure.updateMany({
    where: { agencyId, tokenType, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

// ── Job runner ────────────────────────────────────────────────────────────────

/**
 * Runs a BackfillJob to completion, updating its row as it goes so the UI poll
 * shows progress. Never throws — failures are captured in the job + BackfillLog.
 */
export async function runBackfillJob(jobId: string): Promise<void> {
  const job = await prisma.backfillJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "completed" || job.status === "running") return;

  const agencyId = job.agencyId;
  await prisma.backfillJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date() },
  });

  let daysRestored = 0;
  let daysFailed = 0;
  // Bump the job's counter after each hotel so polling reflects live progress.
  const bumpRestored = async (days: number) => {
    if (days <= 0) return;
    daysRestored += days;
    await prisma.backfillJob.update({
      where: { id: jobId },
      data: { daysRestored },
    });
  };

  const ads = await backfillAds(agencyId, (d) => void bumpRestored(d));
  const social = await backfillSocial(agencyId, (d) => void bumpRestored(d));
  daysFailed = ads.failedDays + social.failedDays;

  if (ads.anySuccess && !ads.tokenDead) await resolveSyncFailures(agencyId, "meta_ads");
  if (social.anySuccess) await resolveSyncFailures(agencyId, "instagram");

  const status =
    daysRestored > 0 && daysFailed > 0
      ? "partial"
      : daysFailed > 0 && daysRestored === 0
        ? "failed"
        : "completed";
  // Surface the first real API error so the user sees WHY it failed (e.g. a
  // permission error on the mapped ad account) instead of a generic hint.
  const cause = ads.sampleError ?? social.sampleError;
  const message =
    status === "completed"
      ? `Backfill complete — ${daysRestored} day${daysRestored === 1 ? "" : "s"} of data restored.`
      : status === "partial"
        ? `Successfully backfilled ${daysRestored} day${daysRestored === 1 ? "" : "s"}. ${daysFailed} day${daysFailed === 1 ? "" : "s"} failed due to API errors — these will retry on the next scheduled sync.`
        : `Backfill failed — ${daysFailed} day${daysFailed === 1 ? "" : "s"} could not be restored.${cause ? ` Meta said: "${cause}"` : " Check the token and try again."}`;

  await prisma.backfillJob.update({
    where: { id: jobId },
    data: { status, daysRestored, daysFailed, message, finishedAt: new Date() },
  });
}
