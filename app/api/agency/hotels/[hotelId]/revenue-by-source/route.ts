import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { isGranularity, type Granularity } from "@/lib/revenue-by-source";
import { isSourceType, type SourceType } from "@/lib/source-classifier";
import { computeRevenueBySource } from "@/lib/revenue-by-source-loader";

// GET /api/agency/hotels/[hotelId]/revenue-by-source
//   ?granularity=source|source_medium|source_medium_campaign  (default source)
//   ?startDate=YYYY-MM-DD  &endDate=YYYY-MM-DD                 (default last 30d)
//   ?attributionModel=first_touch|last_touch|u_shaped         (default first_touch)
//   ?sourceTypes=meta_ads,influencer,…                        (optional chip filter)
//
// Multi-tenant: the hotel must belong to the caller's agency. agencyScoped()
// injects the agencyId filter AND default-excludes soft-deleted hotels, so a
// hotel owned by another agency (or soft-deleted) yields 404 — we never reveal
// that it exists. Conversion capture is untouched; we only READ TrackingEvent.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 92; // bounds the daily/sparkline arrays + query size

// Only first-touch credit is computed today (the snippet stores first-touch UTM
// on the conversion). The param is accepted/validated; last_touch / u_shaped land
// later, so the effective model is always first_touch for now.
const MODELS = new Set(["first_touch", "last_touch", "u_shaped"]);

// Parse a YYYY-MM-DD (or full ISO) into a UTC instant. `endOfDay` pushes a
// date-only value to 23:59:59.999 so the range is inclusive of that whole day.
function parseDate(raw: string | null, endOfDay: boolean): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const url = new URL(request.url);

  const granularity: Granularity = isGranularity(url.searchParams.get("granularity"))
    ? (url.searchParams.get("granularity") as Granularity)
    : "source";

  const modelParam = url.searchParams.get("attributionModel") ?? "first_touch";
  const requestedModel = MODELS.has(modelParam) ? modelParam : "first_touch";

  // Date window: default last 30 days; clamp the span to MAX_WINDOW_DAYS.
  const now = new Date();
  let end = parseDate(url.searchParams.get("endDate"), true) ?? now;
  let start = parseDate(url.searchParams.get("startDate"), false) ?? new Date(now.getTime() - 30 * DAY_MS);
  if (start > end) [start, end] = [end, start];
  if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    start = new Date(end.getTime() - MAX_WINDOW_DAYS * DAY_MS);
  }

  // Optional source-type chip filter.
  const sourceTypesRaw = url.searchParams.get("sourceTypes");
  const sourceTypeFilter: Set<SourceType> | null =
    sourceTypesRaw && sourceTypesRaw !== "all"
      ? new Set(sourceTypesRaw.split(",").map((s) => s.trim()).filter(isSourceType))
      : null;

  // Tenant + existence check in one scoped read (404, never 403, on a miss).
  let owned: { id: string } | null;
  try {
    owned = await agencyScoped(prisma.hotelClient).findFirst({
      where: { id: hotelId },
      select: { id: true },
    });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!owned) return Response.json({ error: "Hotel not found" }, { status: 404 });

  try {
    const result = await computeRevenueBySource({
      hotelId,
      granularity,
      requestedModel,
      start,
      end,
      sourceTypeFilter,
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
