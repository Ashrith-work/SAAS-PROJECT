import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { loadChannelView, isChannelKey, type ChannelView } from "@/lib/channel-view";

// GET /api/agency/hotels/[hotelId]/channel-view?channel=&startDate=&endDate=
// Channel-specific deep-dive data for one hotel over a window. "all" returns
// null (the frontend renders the existing full dashboard instead).
//
// Agency-scoped: ownership is verified on EVERY request before the cache, so a
// cached payload can never be served to another agency. Cached 5 minutes per
// (hotelId, channel, startDate, endDate).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<ChannelView | null>(400, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const url = new URL(request.url);
  const channelParam = url.searchParams.get("channel") ?? "all";
  if (!isChannelKey(channelParam)) {
    return Response.json({ error: "Unknown channel" }, { status: 400 });
  }
  const { start, end } = parseAgencyWindow(url.searchParams);

  // Tenant check on EVERY request (cheap, indexed) — gate the cache behind it.
  let owned: { id: string } | null;
  try {
    owned = await agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!owned) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const key = `${hotelId}|${channelParam}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json(hit ?? { channel: "all" });

  let data: ChannelView | null;
  try {
    data = await loadChannelView(hotelId, channelParam, start, end);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  cache.set(key, data);
  return Response.json(data ?? { channel: "all" });
}
