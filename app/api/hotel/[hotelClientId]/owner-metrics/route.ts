import { requireHotelOwnerAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { loadOwnerMetrics, type OwnerMetrics } from "@/lib/owner-metrics";

// GET /api/hotel/[hotelClientId]/owner-metrics?startDate=&endDate= — hotel-owner
// mirror of the agency owner-metrics route. Authorized via requireHotelOwnerAccess;
// reads run inside runWithAgencyScope so every query is scoped to the owning
// agency + this hotel only.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<OwnerMetrics>(200, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const access = await requireHotelOwnerAccess(hotelClientId);
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { start, end } = parseAgencyWindow(new URL(request.url).searchParams);

  const key = `${hotelClientId}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  let metrics: OwnerMetrics;
  try {
    metrics = await runWithAgencyScope(access.agencyId, () => loadOwnerMetrics(hotelClientId, start, end));
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  cache.set(key, metrics);
  return Response.json(metrics);
}
