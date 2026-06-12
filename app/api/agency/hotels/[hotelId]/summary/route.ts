import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { TtlLruCache } from "@/lib/lru-cache";
import { generateSummary, type Period, type SummaryResult } from "@/lib/owner-summary";

// GET /api/agency/hotels/[hotelId]/summary?period=1d|7d|30d — the owner summary.
// Agency-scoped: ownership is verified on EVERY request (before the cache) so a
// cached summary can never be served to another agency. The computed summary is
// cached 5 minutes per (hotelId, period) — it doesn't need to be real-time.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new TtlLruCache<SummaryResult>(100, 5 * 60_000);
const PERIODS = new Set<Period>(["1d", "7d", "30d"]);

export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const raw = new URL(request.url).searchParams.get("period");
  const period: Period = PERIODS.has(raw as Period) ? (raw as Period) : "7d";

  // Tenant check on EVERY request (cheap, indexed) — gate the cache behind it.
  let owned: { id: string } | null;
  try {
    owned = await agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!owned) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const key = `${hotelId}|${period}`;
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  let result: SummaryResult | null;
  try {
    result = await generateSummary(hotelId, period);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!result) return Response.json({ error: "Hotel not found" }, { status: 404 });

  cache.set(key, result);
  return Response.json(result);
}
