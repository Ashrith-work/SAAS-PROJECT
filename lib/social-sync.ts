import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import type { SecretToken } from "@/lib/encryption";
import {
  getAccountInsights,
  getMediaInsights,
  getStoryInsights,
  InstagramAuthError,
} from "@/lib/instagram";
import { recordSyncFailure } from "@/lib/backfill";

// Shared organic-social sync engine. Pulls Instagram account + post insights and
// upserts SocialSnapshot / PostSnapshot rows. Used by:
//   • the scheduled cron at /api/social/sync (every 6 hours) and /api/meta/sync
//   • the manual "Sync insights now" button on the hotel setup page
//
// RATE LIMITS (Instagram ~200 requests/hour): accounts are processed one at a
// time, post-insight calls are spaced by `perRequestDelayMs`, and a short pause
// separates accounts. Bounded by `maxAccounts` + `postsPerAccount` per run.
//
// RESILIENCE: a single account's failure never aborts the batch. A dead/expired
// token marks just that account `disconnected` (flagged for reconnection), the
// same way the ads sync handles MetaAuthError.

const DAY_MS = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SyncTuning = {
  /** Trailing days of account insights to (re)pull. Default 30. */
  days?: number;
  /** Recent posts to refresh per account. Default 12. */
  postsPerAccount?: number;
  /** Delay between each per-post / per-story insights call (ms). Default 350. */
  perRequestDelayMs?: number;
  /** Delay between accounts (ms). Default 1500. */
  accountDelayMs?: number;
  /**
   * Which parts of the IG payload to refresh. Defaults to "full" (account +
   * posts + stories). The 2-hour stories cron passes "stories" to skip the
   * heavier post/account calls and only capture stories before they expire.
   */
  mode?: "full" | "stories" | "no-stories";
};

export type AccountSyncResult = {
  ok: boolean;
  followers?: number;
  postsSynced?: number;
  storiesSynced?: number;
  /** The token was dead — the account was marked disconnected. */
  disconnected?: boolean;
  error?: string;
};

type SyncableAccount = {
  id: string;
  agencyId: string;
  hotelClientId: string;
  igUserId: string;
};

/**
 * Syncs one connected SocialAccount. Never throws — returns a result object.
 * On a dead token, sets status `disconnected` so the UI prompts a reconnect.
 */
export async function syncSocialAccount(
  account: SyncableAccount,
  tuning: SyncTuning = {},
): Promise<AccountSyncResult> {
  const days = tuning.days ?? 30;
  const postsPerAccount = tuning.postsPerAccount ?? 12;
  const perRequestDelayMs = tuning.perRequestDelayMs ?? 350;
  const mode = tuning.mode ?? "full";

  let token: SecretToken;
  try {
    token = await getTokenForApiCall("instagram", account.id, {
      agencyId: account.agencyId,
      hotelClientId: account.hotelClientId,
      source: "sync:social",
    });
  } catch {
    return { ok: false, error: "Stored token could not be decrypted." };
  }

  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * DAY_MS);

  try {
    let followers = 0;
    let postsSynced = 0;
    let storiesSynced = 0;

    // ── Account + posts (skipped in stories-only mode) ────────────────────
    if (mode !== "stories") {
      const insights = await getAccountInsights(token.reveal(), account.igUserId, { since, until });
      for (const day of insights.daily) {
        const date = new Date(`${day.date}T00:00:00.000Z`);
        const data = {
          followers: day.followers,
          reach: day.reach,
          impressions: day.impressions,
          profileViews: day.profileViews,
          engagement: 0, // account-level engagement isn't fetched; it lives on posts
        };
        await prisma.socialSnapshot.upsert({
          where: { hotelClientId_date: { hotelClientId: account.hotelClientId, date } },
          create: { agencyId: account.agencyId, hotelClientId: account.hotelClientId, date, ...data },
          update: data,
        });
      }
      followers = insights.followers;

      const posts = await getMediaInsights(
        token.reveal(),
        account.igUserId,
        postsPerAccount,
        perRequestDelayMs,
      );
      for (const p of posts) {
        const data = {
          agencyId: account.agencyId,
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
      postsSynced = posts.length;
    }

    // ── Stories (skipped in no-stories mode) ──────────────────────────────
    // Stories expire after 24h, so we capture every story still visible on
    // each run and keep the StorySnapshot row forever for historical reports.
    if (mode !== "no-stories") {
      const stories = await getStoryInsights(token.reveal(), account.igUserId, perRequestDelayMs);
      for (const s of stories) {
        const data = {
          agencyId: account.agencyId,
          mediaType: s.mediaType,
          postedAt: s.timestamp ? new Date(s.timestamp) : null,
          reach: s.reach,
          impressions: s.impressions,
          tapsForward: s.tapsForward,
          tapsBack: s.tapsBack,
          exits: s.exits,
          replies: s.replies,
          fetchedAt: new Date(),
        };
        await prisma.storySnapshot.upsert({
          where: {
            hotelClientId_storyId: { hotelClientId: account.hotelClientId, storyId: s.storyId },
          },
          create: { hotelClientId: account.hotelClientId, storyId: s.storyId, ...data },
          update: data,
        });
      }
      storiesSynced = stories.length;
    }

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: "connected" },
    });

    return { ok: true, followers, postsSynced, storiesSynced };
  } catch (err) {
    if (err instanceof InstagramAuthError) {
      // Dead/expired/revoked token — mark expired + record a SyncFailure so the
      // gap is surfaced (same as the ads sync). Reconnecting backfills + resolves.
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "expired" },
      });
      await recordSyncFailure(
        account.agencyId,
        account.hotelClientId,
        "instagram",
        err.message || "Instagram token expired/revoked during sync.",
      );
      return { ok: false, disconnected: true, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown social sync error." };
  }
}

export type SocialSyncResult = {
  accountsProcessed: number;
  accountsSynced: number;
  postsSynced: number;
  storiesSynced: number;
  accountsDisconnected: number;
  errors: { agencyId: string; hotelClientId: string; error: string }[];
};

/**
 * Syncs every CONNECTED SocialAccount (optionally limited to one agency),
 * spacing calls to respect Instagram's rate limit. Never throws.
 */
export async function runSocialSync(
  opts: SyncTuning & { agencyId?: string; maxAccounts?: number } = {},
): Promise<SocialSyncResult> {
  const maxAccounts = opts.maxAccounts ?? 100;
  const accountDelayMs = opts.accountDelayMs ?? 1500;

  const accounts = await prisma.socialAccount.findMany({
    where: { status: "connected", ...(opts.agencyId ? { agencyId: opts.agencyId } : {}) },
    orderBy: { lastSyncedAt: "asc" }, // stale accounts first; nulls sort first
    take: maxAccounts,
    select: {
      id: true,
      agencyId: true,
      hotelClientId: true,
      igUserId: true,
    },
  });

  const result: SocialSyncResult = {
    accountsProcessed: 0,
    accountsSynced: 0,
    postsSynced: 0,
    storiesSynced: 0,
    accountsDisconnected: 0,
    errors: [],
  };

  for (let i = 0; i < accounts.length; i++) {
    if (i > 0 && accountDelayMs > 0) await sleep(accountDelayMs);

    const account = accounts[i];
    result.accountsProcessed += 1;

    const res = await syncSocialAccount(account, opts);
    if (res.ok) {
      result.accountsSynced += 1;
      result.postsSynced += res.postsSynced ?? 0;
      result.storiesSynced += res.storiesSynced ?? 0;
    } else {
      if (res.disconnected) result.accountsDisconnected += 1;
      result.errors.push({
        agencyId: account.agencyId,
        hotelClientId: account.hotelClientId,
        error: res.error ?? "Unknown error.",
      });
    }
  }

  return result;
}
