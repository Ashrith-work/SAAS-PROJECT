import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import type { SecretToken } from "@/lib/encryption";
import {
  getDailyAccountInsights,
  getFollowerDemographics,
  getMediaInsights,
  getProfile,
  getRecentMedia,
  InstagramAuthError,
} from "@/lib/instagram";
import { recordSyncFailure } from "@/lib/sync-failures";
import { sendEmail, renderEmail, lead, p, esc } from "@/lib/email";

// IGAA Instagram sync engine. Pulls daily account insights + recent media for
// every active InstagramConnection and upserts SocialSnapshot / PostSnapshot
// rows. Used by:
//   • the daily cron at /api/instagram/sync (6am UTC)
//   • the manual "Sync insights now" button on the hotel integrations page
//   • the reconnect backfill (lib/backfill.ts) for longer date windows
//
// RATE LIMITS: connections are processed one at a time; per-media insight
// calls are spaced by `perRequestDelayMs`; media insights are fetched only for
// media not yet in PostSnapshot (likes/comments still refresh for all).
//
// RESILIENCE: one connection's failure never aborts the batch — the connection
// is marked status="error" with the message stored, a SyncFailure row is
// recorded, and the agency is emailed (best-effort, never throws).

const DAY_MS = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type IgSyncTuning = {
  /** Trailing days of account insights to (re)pull. Default 2 (yesterday+today). */
  days?: number;
  /** Recent media to refresh per connection. Default 25. */
  mediaLimit?: number;
  /** Delay between per-media insights calls (ms). Default 350. */
  perRequestDelayMs?: number;
  /** Delay between connections (ms). Default 1500. */
  connectionDelayMs?: number;
};

export type IgConnectionSyncResult = {
  ok: boolean;
  followers?: number;
  daysSynced?: number;
  postsSynced?: number;
  /** The token was dead — the connection was marked status="error". */
  authFailed?: boolean;
  error?: string;
};

export type SyncableConnection = {
  id: string;
  agencyId: string;
  hotelClientId: string;
  igUserId: string;
};

/** Best-effort email to the agency when a connection breaks. Never throws. */
async function notifyAgencySyncFailure(agencyId: string, hotelClientId: string, reason: string) {
  try {
    const [agency, hotel] = await Promise.all([
      prisma.agency.findUnique({ where: { id: agencyId }, select: { email: true, name: true } }),
      prisma.hotelClient.findUnique({ where: { id: hotelClientId }, select: { name: true } }),
    ]);
    if (!agency?.email) return;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    await sendEmail({
      to: agency.email,
      subject: `Instagram sync failed for ${hotel?.name ?? "a hotel"}`,
      html: renderEmail({
        heading: "Instagram sync failed",
        preheader: "An Instagram connection needs attention.",
        accent: "warning",
        bodyHtml:
          lead(`The Instagram connection for <strong>${esc(hotel?.name ?? "a hotel")}</strong> stopped syncing.`) +
          p(`Reason: ${esc(reason)}`) +
          p("Open the hotel's Integrations page and reconnect with “Log in with Instagram” to resume data flow."),
        ...(appUrl
          ? { cta: { label: "Open Integrations", url: `${appUrl}/agency/hotel/${hotelClientId}/integrations` } }
          : {}),
      }),
    });
  } catch {
    // Email problems must never affect the sync.
  }
}

/**
 * Syncs one active InstagramConnection. Never throws — returns a result object.
 * On failure the connection is marked status="error" + errorMessage stored.
 */
export async function syncInstagramConnection(
  conn: SyncableConnection,
  tuning: IgSyncTuning = {},
): Promise<IgConnectionSyncResult> {
  const days = tuning.days ?? 2;
  const mediaLimit = tuning.mediaLimit ?? 25;
  const perRequestDelayMs = tuning.perRequestDelayMs ?? 350;

  let token: SecretToken;
  try {
    token = await getTokenForApiCall("instagram", conn.id, {
      agencyId: conn.agencyId,
      hotelClientId: conn.hotelClientId,
      source: "sync:instagram",
    });
  } catch {
    return { ok: false, error: "Stored token could not be decrypted." };
  }

  try {
    // ── Daily account insights → SocialSnapshot ───────────────────────────
    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * DAY_MS);
    const [profile, daily] = await Promise.all([
      getProfile(token.reveal()),
      getDailyAccountInsights(token.reveal(), conn.igUserId, { since, until }),
    ]);

    for (const day of daily) {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const data = {
        // Total followers come from the profile (the daily follower_count
        // metric is new-follows-per-day, not a running total).
        followers: profile.followersCount,
        reach: day.reach,
        impressions: day.impressions,
        views: day.views, // v22+ successor to impressions
        profileViews: day.profileViews,
        websiteClicks: day.websiteClicks,
        engagement: 0, // account-level engagement lives on posts
      };
      await prisma.socialSnapshot.upsert({
        where: { hotelClientId_date: { hotelClientId: conn.hotelClientId, date } },
        create: { agencyId: conn.agencyId, hotelClientId: conn.hotelClientId, date, ...data },
        update: data,
      });
    }

    // ── Recent media → PostSnapshot ───────────────────────────────────────
    const media = await getRecentMedia(token.reveal(), conn.igUserId, mediaLimit);
    const known = new Set(
      (
        await prisma.postSnapshot.findMany({
          where: {
            hotelClientId: conn.hotelClientId,
            mediaId: { in: media.map((m) => m.mediaId) },
          },
          select: { mediaId: true },
        })
      ).map((r) => r.mediaId),
    );

    let postsSynced = 0;
    for (const m of media) {
      // Insights are fetched only for NEW media (API budget); likes/comments
      // and caption refresh on every run for all listed media.
      const isNew = !known.has(m.mediaId);
      let insights = { reach: 0, impressions: 0, saved: 0, engagement: 0, shares: 0, plays: 0 };
      if (isNew) {
        if (postsSynced > 0 && perRequestDelayMs > 0) await sleep(perRequestDelayMs);
        insights = await getMediaInsights(token.reveal(), m.mediaId);
      }

      const base = {
        agencyId: conn.agencyId,
        caption: m.caption,
        mediaType: m.mediaType,
        permalink: m.permalink,
        postedAt: m.timestamp ? new Date(m.timestamp) : null,
        likes: m.likes,
        comments: m.comments,
        fetchedAt: new Date(),
      };
      await prisma.postSnapshot.upsert({
        where: { hotelClientId_mediaId: { hotelClientId: conn.hotelClientId, mediaId: m.mediaId } },
        create: {
          hotelClientId: conn.hotelClientId,
          mediaId: m.mediaId,
          ...base,
          impressions: insights.impressions,
          reach: insights.reach,
          saves: insights.saved,
          engagement: insights.engagement || m.likes + m.comments,
          shares: insights.shares,
          videoViews: insights.plays,
        },
        update: isNew
          ? {
              ...base,
              impressions: insights.impressions,
              reach: insights.reach,
              saves: insights.saved,
              engagement: insights.engagement || m.likes + m.comments,
              shares: insights.shares,
              videoViews: insights.plays,
            }
          : base,
      });
      postsSynced += 1;
    }

    // ── Follower demographics → InstagramAudience (best-effort) ────────────
    // Only available for 100+ follower accounts; a non-auth failure here must
    // never fail the sync, so it's isolated. Auth errors still propagate.
    try {
      const audience = await getFollowerDemographics(token.reveal(), conn.igUserId);
      for (const row of audience) {
        await prisma.instagramAudience.upsert({
          where: {
            hotelClientId_breakdown_dimension: {
              hotelClientId: conn.hotelClientId,
              breakdown: row.breakdown,
              dimension: row.dimension,
            },
          },
          create: {
            agencyId: conn.agencyId,
            hotelClientId: conn.hotelClientId,
            breakdown: row.breakdown,
            dimension: row.dimension,
            value: row.value,
            syncedAt: new Date(),
          },
          update: { value: row.value, syncedAt: new Date() },
        });
      }
    } catch (err) {
      if (err instanceof InstagramAuthError) throw err;
      // demographics are optional — ignore non-auth failures
    }

    await prisma.instagramConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncedAt: new Date(),
        status: "active",
        errorMessage: null,
        requiresReconnect: false,
        lastErrorReason: null,
      },
    });

    return { ok: true, followers: profile.followersCount, daysSynced: daily.length, postsSynced };
  } catch (err) {
    const authFailed = err instanceof InstagramAuthError;
    const message = err instanceof Error ? err.message : "Unknown Instagram sync error.";

    if (authFailed) {
      // ONLY a genuine token failure (401 / Graph code 190 / 102) means the
      // user must reconnect. Mark the connection broken + surface it (UI badge
      // flips to "Token Expired — Reconnect Needed", reconnect banner, SyncFailure,
      // email).
      console.error(
        "[INSTAGRAM-OAUTH-FAILURE]",
        JSON.stringify({ hotelClientId: conn.hotelClientId, connId: conn.id, message }),
      );
      await prisma.instagramConnection.update({
        where: { id: conn.id },
        data: {
          status: "error",
          errorMessage: message,
          requiresReconnect: true,
          lastErrorReason: message.slice(0, 200),
        },
      });
      await recordSyncFailure(conn.agencyId, conn.hotelClientId, "instagram", message);
      await notifyAgencySyncFailure(conn.agencyId, conn.hotelClientId, message);
    } else {
      // Any other error (invalid metric, rate limit, transient outage) is NOT a
      // token problem — keep the connection ACTIVE so we don't falsely tell the
      // user to reconnect. Record the message + log it; the next run retries.
      await prisma.instagramConnection.update({
        where: { id: conn.id },
        data: { status: "active", errorMessage: message },
      });
      console.error(
        `[IG-SYNC] non-auth error on connection ${conn.id} (status kept active): ${message}`,
      );
    }

    return { ok: false, authFailed, error: message };
  }
}

export type IgSyncResult = {
  connectionsProcessed: number;
  connectionsSynced: number;
  postsSynced: number;
  connectionsFailed: number;
  errors: { agencyId: string; hotelClientId: string; error: string }[];
};

/**
 * Syncs every ACTIVE IGAA connection (optionally one agency's), spacing calls
 * to respect Instagram's rate limit. Never throws.
 */
export async function runInstagramSync(
  opts: IgSyncTuning & { agencyId?: string; maxConnections?: number } = {},
): Promise<IgSyncResult> {
  const maxConnections = opts.maxConnections ?? 100;
  const connectionDelayMs = opts.connectionDelayMs ?? 1500;

  const connections = await prisma.instagramConnection.findMany({
    where: {
      status: "active",
      tokenType: "igaa_direct",
      ...(opts.agencyId ? { agencyId: opts.agencyId } : {}),
    },
    orderBy: { lastSyncedAt: "asc" }, // stale connections first; nulls sort first
    take: maxConnections,
    select: { id: true, agencyId: true, hotelClientId: true, igUserId: true },
  });

  const result: IgSyncResult = {
    connectionsProcessed: 0,
    connectionsSynced: 0,
    postsSynced: 0,
    connectionsFailed: 0,
    errors: [],
  };

  for (let i = 0; i < connections.length; i++) {
    if (i > 0 && connectionDelayMs > 0) await sleep(connectionDelayMs);

    const conn = connections[i];
    result.connectionsProcessed += 1;

    const res = await syncInstagramConnection(conn, opts);
    if (res.ok) {
      result.connectionsSynced += 1;
      result.postsSynced += res.postsSynced ?? 0;
    } else {
      result.connectionsFailed += 1;
      result.errors.push({
        agencyId: conn.agencyId,
        hotelClientId: conn.hotelClientId,
        error: res.error ?? "Unknown error.",
      });
    }
  }

  return result;
}
