import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { loadInstagramReachSplit, parseReachSplitWindow } from "@/lib/instagram-reach-split";
import type { ReachSplit } from "@/lib/channel-view-types";

// GET /api/agency/hotels/[hotelId]/instagram-reach-split?range=7d|30d|90d
// Owned-vs-influencer Instagram reach for one hotel. The same payload is also
// embedded in the Instagram channel-view response (the dashboard reads it from
// there); this dedicated endpoint exists per the feature spec. Agency-scoped:
// ownership verified on every request before the 5-minute cache.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<ReachSplit>(400, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const { start, end } = parseReachSplitWindow(new URL(request.url).searchParams);

  let owned: { id: string } | null;
  try {
    owned = await agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!owned) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const key = `${hotelId}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json(hit);

  let data: ReachSplit;
  try {
    data = await loadInstagramReachSplit(hotelId, start, end);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  cache.set(key, data);
  return Response.json(data);
}
