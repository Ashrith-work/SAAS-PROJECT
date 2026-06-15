import { requireHotelOwnerAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { loadChannelView, isChannelKey, type ChannelView } from "@/lib/channel-view";

// GET /api/hotel/[hotelClientId]/channel-view?channel=&startDate=&endDate= —
// hotel-owner mirror of the agency channel-view route. Same per-channel deep-dive
// payload (Meta Ads spend/CTR/CPC/CPM/campaigns, Instagram content, Facebook,
// Influencer, Direct, Other). Authorized via requireHotelOwnerAccess; reads run
// inside runWithAgencyScope so they are scoped to the owning agency + this hotel.
//
// Ad spend: the owner ALWAYS sees full Meta spend for their OWN hotel here. The
// showAdSpendToHotel flag only gates the public /h/ share link, not the logged-in
// owner's authenticated dashboard.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<ChannelView | null>(400, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const access = await requireHotelOwnerAccess(hotelClientId);
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const channelParam = url.searchParams.get("channel") ?? "all";
  if (!isChannelKey(channelParam)) {
    return Response.json({ error: "Unknown channel" }, { status: 400 });
  }
  const { start, end } = parseAgencyWindow(url.searchParams);

  const key = `${hotelClientId}|${channelParam}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json(hit ?? { channel: "all" });

  let data: ChannelView | null;
  try {
    data = await runWithAgencyScope(access.agencyId, () =>
      loadChannelView(hotelClientId, channelParam, start, end),
    );
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  cache.set(key, data);
  return Response.json(data ?? { channel: "all" });
}
