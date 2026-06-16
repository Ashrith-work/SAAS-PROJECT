import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import { recordSyncFailure } from "@/lib/sync-failures";
import {
  getTaggedMedia, resolveBusinessAccountByUsername, InstagramAuthError, type IgTaggedMedia,
} from "@/lib/instagram";

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Reach Split — daily tag-detection (PART 8).
//
// For every active hotel Instagram connection we read the `/{ig-user-id}/tags`
// edge (posts that @-tagged the hotel). Each tagged post is matched to a known
// Influencer (by resolved instagramUserId, else by @handle); matched posts are
// upserted into InfluencerInstagramPost, unmatched ones into UnattributedMention
// so the agency can link them later. Caption is also scanned for the hotel's own
// @handle (mentionedHotelInCaption) as a secondary signal.
//
// No session here (cron context), so we use raw prisma and stamp agencyId /
// hotelClientId explicitly from the connection row. Rate limiting is handled in
// lib/instagram.ts (igGet backoff); we additionally space connections out.
// Reach is NOT fetched for other users' media — the API doesn't expose it — so
// it stays null ("Not available" in the UI). like_count/comments_count do come
// back on the tags node and are stored.
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Map IG media_type → the canonical lowercase set our tables store. */
function canonicalMediaType(raw: string | null): string {
  switch ((raw ?? "").toLowerCase()) {
    case "reels":
    case "reel":
    case "video":
      return "reel";
    case "carousel":
    case "carousel_album":
      return "carousel";
    case "story":
      return "story";
    default:
      return "image";
  }
}

const stripAt = (h: string) => h.trim().replace(/^@/, "").toLowerCase();

/**
 * Parse an Instagram post/reel URL into a stable id (the shortcode) + media type
 * for manual entry (PART 3 method 2). The shortcode is unique per post, so it's a
 * safe dedup key for instagramPostId. Returns null for anything that isn't a
 * recognisable post/reel/tv URL.
 */
export function parseInstagramPostUrl(
  url: string,
): { shortcode: string; mediaType: string; permalink: string } | null {
  const m = url.trim().match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const shortcode = m[2];
  const mediaType = kind === "reel" || kind === "reels" ? "reel" : kind === "tv" ? "video" : "image";
  return { shortcode, mediaType, permalink: `https://www.instagram.com/${kind === "reels" ? "reel" : kind}/${shortcode}/` };
}

export type TagDetectionResult = {
  connectionsProcessed: number;
  connectionsSynced: number;
  attributedUpserted: number;
  unattributedUpserted: number;
  connectionsFailed: number;
  errors: { agencyId: string; hotelClientId: string; error: string }[];
};

type Conn = {
  id: string;
  agencyId: string;
  hotelClientId: string;
  igUserId: string;
  hotelClient: { instagramHandle: string | null };
};

type KnownInfluencer = { id: string; instagramUserId: string | null; instagramHandle: string | null };

/** Detect tagged influencer posts for one connection. Never throws. */
async function detectForConnection(conn: Conn): Promise<{
  ok: boolean; attributed: number; unattributed: number; error?: string;
}> {
  let token;
  try {
    token = await getTokenForApiCall("instagram", conn.id, {
      agencyId: conn.agencyId,
      hotelClientId: conn.hotelClientId,
      source: "cron:instagram-detect",
    });
  } catch {
    return { ok: false, attributed: 0, unattributed: 0, error: "Stored token could not be decrypted." };
  }

  let media: IgTaggedMedia[];
  try {
    media = await getTaggedMedia(token.reveal(), conn.igUserId, 50);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tagged-media fetch failed.";
    if (err instanceof InstagramAuthError) {
      await recordSyncFailure(conn.agencyId, conn.hotelClientId, "instagram", message);
    }
    return { ok: false, attributed: 0, unattributed: 0, error: message };
  }

  // Known influencers for this hotel (hotel-specific OR agency-wide), active only.
  const influencers = (await prisma.influencer.findMany({
    where: {
      agencyId: conn.agencyId,
      archivedAt: null,
      OR: [{ hotelClientId: conn.hotelClientId }, { hotelClientId: null }],
    },
    select: { id: true, instagramUserId: true, instagramHandle: true },
  })) as KnownInfluencer[];

  const byUserId = new Map<string, KnownInfluencer>();
  const byHandle = new Map<string, KnownInfluencer>();
  for (const inf of influencers) {
    if (inf.instagramUserId) byUserId.set(inf.instagramUserId, inf);
    if (inf.instagramHandle) byHandle.set(stripAt(inf.instagramHandle), inf);
  }

  const hotelHandle = conn.hotelClient.instagramHandle ? stripAt(conn.hotelClient.instagramHandle) : null;
  let attributed = 0;
  let unattributed = 0;

  for (const m of media) {
    const postedAt = m.timestamp ? new Date(m.timestamp) : new Date();
    const mediaType = canonicalMediaType(m.mediaType);
    const permalink = m.permalink ?? "";
    const mentionedHotelInCaption = !!hotelHandle && (m.caption ?? "").toLowerCase().includes(`@${hotelHandle}`);

    const match =
      (m.posterUserId ? byUserId.get(m.posterUserId) : undefined) ??
      (m.posterUsername ? byHandle.get(stripAt(m.posterUsername)) : undefined);

    if (match) {
      await prisma.influencerInstagramPost.upsert({
        where: { instagramPostId: m.mediaId },
        create: {
          agencyId: conn.agencyId,
          hotelClientId: conn.hotelClientId,
          influencerId: match.id,
          instagramPostId: m.mediaId,
          instagramUserId: m.posterUserId ?? match.instagramUserId ?? "",
          postedAt,
          mediaType,
          permalink,
          captionText: m.caption,
          reach: null, // not available for other users' media
          likes: m.likes,
          comments: m.comments,
          taggedHotelAccount: true,
          mentionedHotelInCaption,
        },
        update: {
          likes: m.likes,
          comments: m.comments,
          captionText: m.caption,
          mentionedHotelInCaption,
          syncedAt: new Date(),
        },
      });
      attributed += 1;

      // Learn the poster's id for future auto-matching; stamp last-detected.
      await prisma.influencer.update({
        where: { id: match.id },
        data: {
          lastDetectedAt: new Date(),
          ...(match.instagramUserId == null && m.posterUserId ? { instagramUserId: m.posterUserId } : {}),
        },
      });

      // If this post had been parked as unattributed, it's now attributed.
      await prisma.unattributedMention.deleteMany({ where: { instagramPostId: m.mediaId } });
    } else {
      await prisma.unattributedMention.upsert({
        where: { instagramPostId: m.mediaId },
        create: {
          agencyId: conn.agencyId,
          hotelClientId: conn.hotelClientId,
          instagramPostId: m.mediaId,
          posterInstagramUserId: m.posterUserId,
          posterUsername: m.posterUsername,
          postedAt,
          mediaType,
          permalink,
          captionText: m.caption,
          reach: null,
          likes: m.likes,
          comments: m.comments,
          taggedHotelAccount: true,
          mentionedHotelInCaption,
        },
        update: {
          likes: m.likes,
          comments: m.comments,
          captionText: m.caption,
          posterUsername: m.posterUsername,
          posterInstagramUserId: m.posterUserId,
          mentionedHotelInCaption,
          syncedAt: new Date(),
        },
      });
      unattributed += 1;
    }
  }

  return { ok: true, attributed, unattributed };
}

/** Run tag detection for every active IGAA connection (optionally one agency). */
export async function runTagDetection(
  opts: { agencyId?: string; maxConnections?: number; connectionDelayMs?: number } = {},
): Promise<TagDetectionResult> {
  const maxConnections = opts.maxConnections ?? 100;
  const connectionDelayMs = opts.connectionDelayMs ?? 1500;

  const connections = (await prisma.instagramConnection.findMany({
    where: {
      status: "active",
      tokenType: "igaa_direct",
      hotelClient: { deletedAt: null },
      ...(opts.agencyId ? { agencyId: opts.agencyId } : {}),
    },
    orderBy: { lastSyncedAt: "asc" },
    take: maxConnections,
    select: {
      id: true, agencyId: true, hotelClientId: true, igUserId: true,
      hotelClient: { select: { instagramHandle: true } },
    },
  })) as Conn[];

  const result: TagDetectionResult = {
    connectionsProcessed: 0, connectionsSynced: 0,
    attributedUpserted: 0, unattributedUpserted: 0,
    connectionsFailed: 0, errors: [],
  };

  for (let i = 0; i < connections.length; i++) {
    if (i > 0 && connectionDelayMs > 0) await sleep(connectionDelayMs);
    const conn = connections[i];
    result.connectionsProcessed += 1;
    const res = await detectForConnection(conn);
    if (res.ok) {
      result.connectionsSynced += 1;
      result.attributedUpserted += res.attributed;
      result.unattributedUpserted += res.unattributed;
    } else {
      result.connectionsFailed += 1;
      result.errors.push({ agencyId: conn.agencyId, hotelClientId: conn.hotelClientId, error: res.error ?? "Unknown error." });
    }
  }

  return result;
}

/**
 * Resolve an influencer's @handle to an IG user id, using any active connection
 * for the agency (preferring the influencer's own hotel). Best-effort: returns
 * null when there's no connection to query against or the handle can't be
 * resolved. Used by the influencer create/update action (PART 7).
 */
export async function resolveHandleForAgency(
  agencyId: string,
  hotelClientId: string | null,
  handle: string,
): Promise<string | null> {
  const select = { id: true, igUserId: true, agencyId: true, hotelClientId: true } as const;
  const base = { agencyId, status: "active", tokenType: "igaa_direct", hotelClient: { deletedAt: null } } as const;

  // Prefer the influencer's own hotel connection; fall back to any agency one.
  const connection =
    (hotelClientId
      ? await prisma.instagramConnection.findFirst({ where: { ...base, hotelClientId }, select })
      : null) ??
    (await prisma.instagramConnection.findFirst({ where: base, orderBy: { lastSyncedAt: "desc" }, select }));
  if (!connection) return null;

  let token;
  try {
    token = await getTokenForApiCall("instagram", connection.id, {
      agencyId: connection.agencyId,
      hotelClientId: connection.hotelClientId,
      source: "action:resolveInfluencerHandle",
    });
  } catch {
    return null;
  }

  try {
    const resolved = await resolveBusinessAccountByUsername(token.reveal(), connection.igUserId, handle);
    return resolved?.id ?? null;
  } catch {
    return null; // auth or other error — treat as unresolved (non-blocking)
  }
}
