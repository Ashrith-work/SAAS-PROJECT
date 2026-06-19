import { requireReadAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { loadInstagramReachSplit, parseReachSplitWindow } from "@/lib/instagram-reach-split";
import type { ReachSplit } from "@/lib/channel-view-types";

// GET /api/hotel/[hotelClientId]/instagram-reach-split?range=7d|30d|90d —
// hotel-owner mirror of the agency reach-split route. Authorized via
// requireHotelOwnerAccess (the hotel's own owner OR an agency member of the
// owning agency); reads run inside runWithAgencyScope so they stay scoped to the
// owning agency + this hotel. READ-ONLY for everyone here.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<ReachSplit>(400, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const auth = await requireReadAccess(request, hotelClientId);
  if (!auth.ok) return Response.json({ error: auth.status === 404 ? "Not found" : "Forbidden" }, { status: auth.status });
  const access = auth.access;

  const { start, end } = parseReachSplitWindow(new URL(request.url).searchParams);

  const key = `${hotelClientId}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json(hit);

  let data: ReachSplit;
  try {
    data = await runWithAgencyScope(access.agencyId, () =>
      loadInstagramReachSplit(hotelClientId, start, end),
    );
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  cache.set(key, data);
  return Response.json(data);
}
