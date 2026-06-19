import { requireReadAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { isGranularity, type Granularity } from "@/lib/revenue-by-source";
import { isSourceType, type SourceType } from "@/lib/source-classifier";
import { computeRevenueBySource } from "@/lib/revenue-by-source-loader";

// GET /api/hotel/[hotelClientId]/revenue-by-source — hotel-owner mirror of the
// agency revenue-by-source route. Same 3-way granularity (source / source+medium /
// source+medium+campaign), date window and source-type chip filter. Authorized via
// requireHotelOwnerAccess; the shared compute runs inside runWithAgencyScope so it
// is scoped to the owning agency + this hotel only.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 86_400_000;
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

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const auth = await requireReadAccess(request, hotelClientId);
  if (!auth.ok) return Response.json({ error: auth.status === 404 ? "Not found" : "Forbidden" }, { status: auth.status });
  const access = auth.access;

  const url = new URL(request.url);
  const granularity: Granularity = isGranularity(url.searchParams.get("granularity"))
    ? (url.searchParams.get("granularity") as Granularity)
    : "source";

  const modelParam = url.searchParams.get("attributionModel") ?? "first_touch";
  const requestedModel = MODELS.has(modelParam) ? modelParam : "first_touch";

  const now = new Date();
  const end = parseDate(url.searchParams.get("endDate"), true) ?? now;
  const start = parseDate(url.searchParams.get("startDate"), false) ?? new Date(now.getTime() - 30 * DAY_MS);

  const sourceTypesRaw = url.searchParams.get("sourceTypes");
  const sourceTypeFilter: Set<SourceType> | null =
    sourceTypesRaw && sourceTypesRaw !== "all"
      ? new Set(sourceTypesRaw.split(",").map((s) => s.trim()).filter(isSourceType))
      : null;

  try {
    const result = await runWithAgencyScope(access.agencyId, () =>
      computeRevenueBySource({ hotelId: hotelClientId, granularity, requestedModel, start, end, sourceTypeFilter }),
    );
    return Response.json(result);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
