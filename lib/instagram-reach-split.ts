import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import type {
  ReachSplit, ReachSplitInfluencerRow, ReachSplitTopInfluencer, UnattributedMentionItem,
} from "@/lib/channel-view-types";

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Reach Split aggregation — OWNED reach (the hotel's own PostSnapshot
// posts) vs INFLUENCER reach (InfluencerInstagramPost: posts that tagged/
// mentioned the hotel, attributed to a known influencer), plus the as-yet
// UnattributedMention posts and a daily owned/influencer trend.
//
// All reads are agencyScoped() and filtered by hotelClientId, so the same loader
// is safe on both the agency dashboard and the hotel-owner dashboard (the
// hotel-owner route wraps the call in runWithAgencyScope). READ-ONLY; no schema
// writes here.
//
// `reach` is nullable in the DB (the API can't always report it). Sums count
// only known reach; "Not available" rendering is the UI's job.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Map the spec's ?range=7d|30d|90d to a {start,end} window (default 30d). */
export function parseReachSplitWindow(params: URLSearchParams): { start: Date; end: Date } {
  const range = params.get("range");
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  return { start, end };
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Inclusive list of UTC day keys (YYYY-MM-DD) spanning [start, end], capped. */
function dayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let guard = 0;
  while (d <= last && guard < 367) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    guard += 1;
  }
  return keys;
}

function preview(s: string | null, n = 80): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export async function loadInstagramReachSplit(
  hotelClientId: string,
  start: Date,
  end: Date,
): Promise<ReachSplit> {
  const [ownedPosts, infPosts, mentions] = await Promise.all([
    agencyScoped(prisma.postSnapshot).findMany({
      where: { hotelClientId, postedAt: { gte: start, lte: end } },
      select: { permalink: true, caption: true, reach: true, postedAt: true },
    }) as Promise<{ permalink: string | null; caption: string | null; reach: number; postedAt: Date | null }[]>,
    agencyScoped(prisma.influencerInstagramPost).findMany({
      where: { hotelClientId, postedAt: { gte: start, lte: end } },
      select: {
        influencerId: true, permalink: true, captionText: true, reach: true,
        likes: true, comments: true, saves: true, shares: true, postedAt: true,
        influencer: { select: { name: true, instagramHandle: true } },
      },
    }) as Promise<{
      influencerId: string; permalink: string; captionText: string | null; reach: number | null;
      likes: number; comments: number; saves: number; shares: number; postedAt: Date;
      influencer: { name: string; instagramHandle: string | null } | null;
    }[]>,
    agencyScoped(prisma.unattributedMention).findMany({
      where: { hotelClientId, postedAt: { gte: start, lte: end } },
      orderBy: { postedAt: "desc" },
      take: 50,
      select: { id: true, posterUsername: true, postedAt: true, reach: true, permalink: true, mediaType: true },
    }) as Promise<{ id: string; posterUsername: string | null; postedAt: Date; reach: number | null; permalink: string; mediaType: string }[]>,
  ]);

  // ── Owned content ──────────────────────────────────────────────────────────
  let ownedReach = 0;
  let ownedTop: { permalink: string | null; reach: number; caption: string | null } | null = null;
  for (const p of ownedPosts) {
    ownedReach += p.reach;
    if (!ownedTop || p.reach > ownedTop.reach) {
      ownedTop = { permalink: p.permalink, reach: p.reach, caption: p.caption };
    }
  }

  // ── Influencer content ───────────────────────────────────────────────────────
  let influencerReach = 0;
  let infTop: { permalink: string; reach: number | null; name: string; caption: string | null } | null = null;
  const byInfluencer = new Map<string, {
    name: string; handle: string; postCount: number; totalReach: number; totalEngagement: number;
    topReach: number; topPermalink: string | null;
  }>();
  for (const p of infPosts) {
    const r = p.reach ?? 0;
    influencerReach += r;
    const engagement = p.likes + p.comments + p.saves + p.shares;
    // top influencer post overall — a known reach always beats an unknown one
    const better = infTop == null
      || (p.reach != null && (infTop.reach == null || p.reach > infTop.reach));
    if (better) {
      infTop = { permalink: p.permalink, reach: p.reach, name: p.influencer?.name ?? "(removed influencer)", caption: p.captionText };
    }
    const agg = byInfluencer.get(p.influencerId) ?? {
      name: p.influencer?.name ?? "(removed influencer)",
      handle: p.influencer?.instagramHandle ?? "",
      postCount: 0, totalReach: 0, totalEngagement: 0, topReach: -1, topPermalink: null,
    };
    agg.postCount += 1;
    agg.totalReach += r;
    agg.totalEngagement += engagement;
    if ((p.reach ?? -1) > agg.topReach) { agg.topReach = p.reach ?? -1; agg.topPermalink = p.permalink; }
    byInfluencer.set(p.influencerId, agg);
  }

  const breakdown: ReachSplitInfluencerRow[] = [...byInfluencer.entries()]
    .map(([influencerId, a]) => ({
      influencerId,
      influencerName: a.name,
      instagramHandle: a.handle,
      postCount: a.postCount,
      totalReach: a.totalReach,
      totalEngagement: a.totalEngagement,
      topPostPermalink: a.topPermalink,
    }))
    .sort((x, y) => y.totalReach - x.totalReach || y.totalEngagement - x.totalEngagement);

  const influencerTopPost: ReachSplitTopInfluencer = infTop
    ? { permalink: infTop.permalink, reach: infTop.reach, influencerName: infTop.name, captionPreview: preview(infTop.caption) }
    : null;

  // ── Unattributed mentions panel ──────────────────────────────────────────────
  const unattributedItems: UnattributedMentionItem[] = mentions.map((m) => ({
    id: m.id,
    posterUsername: m.posterUsername,
    postedAt: m.postedAt.toISOString(),
    reach: m.reach,
    permalink: m.permalink,
    mediaType: m.mediaType,
  }));

  // ── Daily trend (owned + influencer reach, known reach only) ─────────────────
  const ownedByDay = new Map<string, number>();
  for (const p of ownedPosts) {
    if (!p.postedAt) continue;
    ownedByDay.set(dayKey(p.postedAt), (ownedByDay.get(dayKey(p.postedAt)) ?? 0) + p.reach);
  }
  const infByDay = new Map<string, number>();
  for (const p of infPosts) {
    if (p.reach == null) continue;
    infByDay.set(dayKey(p.postedAt), (infByDay.get(dayKey(p.postedAt)) ?? 0) + p.reach);
  }
  const trendDaily = dayKeys(start, end).map((date) => ({
    date,
    ownedReach: ownedByDay.get(date) ?? 0,
    influencerReach: infByDay.get(date) ?? 0,
  }));

  return {
    totalReach: ownedReach + influencerReach,
    ownedContent: {
      reach: ownedReach,
      postCount: ownedPosts.length,
      topPost: ownedTop
        ? { permalink: ownedTop.permalink, reach: ownedTop.reach, captionPreview: preview(ownedTop.caption) }
        : null,
    },
    influencerContent: {
      reach: influencerReach,
      postCount: infPosts.length,
      influencerCount: byInfluencer.size,
      topPost: influencerTopPost,
      breakdown,
    },
    unattributed: { count: unattributedItems.length, items: unattributedItems },
    trendDaily,
  };
}
