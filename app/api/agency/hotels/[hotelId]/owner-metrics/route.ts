import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { loadOwnerMetrics, type OwnerMetrics } from "@/lib/owner-metrics";

// GET /api/agency/hotels/[hotelId]/owner-metrics?startDate=&endDate= — the Tier A
// owner-overview metrics (marketing spend, cost/booking, ROAS, conversion rate,
// new-vs-returning, device split, bounce rate, avg time on site, top campaigns,
// bookings by source) for one hotel over the given window.
//
// Agency-scoped: ownership is verified on EVERY request (before the cache) so a
// cached result can never be served to another agency. The computed bundle is
// cached 5 minutes per (hotelId, startDate, endDate) — it needn't be real-time.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<OwnerMetrics>(200, 5 * 60_000);

export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const { start, end } = parseAgencyWindow(new URL(request.url).searchParams);

  // Tenant check on EVERY request (cheap, indexed) — gate the cache behind it so
  // another agency can never read this hotel even on a cache hit.
  let owned: { id: string } | null;
  try {
    owned = await agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!owned) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const key = `${hotelId}|${start.toISOString()}|${end.toISOString()}`;
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  let metrics: OwnerMetrics;
  try {
    metrics = await loadOwnerMetrics(hotelId, start, end);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  cache.set(key, metrics);
  return Response.json(metrics);
}
