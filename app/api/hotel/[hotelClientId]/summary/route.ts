import { requireReadAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { generateSummary, type Period, type SummaryResult } from "@/lib/owner-summary";

// GET /api/hotel/[hotelClientId]/summary?period=1d|7d|30d — hotel-owner mirror of
// the agency owner-summary route. Authorized via requireHotelOwnerAccess (the
// signed-in user owns this hotel, or is an agency member of its agency); reads run
// inside runWithAgencyScope so every query is scoped to the owning agency + hotel.
// A hotel owner can therefore only ever read their OWN hotel — a foreign id 403s.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<SummaryResult>(100, 5 * 60_000);
const PERIODS = new Set<Period>(["1d", "7d", "30d"]);

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const auth = await requireReadAccess(request, hotelClientId);
  if (!auth.ok) return Response.json({ error: auth.status === 404 ? "Not found" : "Forbidden" }, { status: auth.status });
  const access = auth.access;

  const raw = new URL(request.url).searchParams.get("period");
  const period: Period = PERIODS.has(raw as Period) ? (raw as Period) : "7d";

  const key = `${hotelClientId}|${period}`;
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  let result: SummaryResult | null;
  try {
    result = await runWithAgencyScope(access.agencyId, () => generateSummary(hotelClientId, period));
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!result) return Response.json({ error: "Hotel not found" }, { status: 404 });

  cache.set(key, result);
  return Response.json(result);
}
