import { getCurrentMember } from "@/lib/auth";
import { loadAgencyRevenueRows, parseAgencyWindow, parseHotelFilter } from "@/lib/agency-revenue";
import { rowSourceKey } from "@/lib/revenue-by-source";

// GET /api/agency/revenue-by-source/[sourceKey]/hotels — drill-down: which hotels
// contributed to one source (e.g. sourceKey="instagram"), and how much. Powers the
// agency dashboard's per-row drawer. Same window/hotelFilter params as the rollup.
// Agency-scoped (reuses the cached agency rows).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceKey: string }> },
) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceKey: rawKey } = await params;
  const sourceKey = decodeURIComponent(rawKey).toLowerCase();

  const url = new URL(request.url);
  const { start, end } = parseAgencyWindow(url.searchParams);
  const hotelFilter = parseHotelFilter(url.searchParams);

  let data;
  try {
    data = await loadAgencyRevenueRows(member.agencyId, { start, end, hotelFilter });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  const byHotel = new Map<string, { revenue: number; bookings: number }>();
  let sourceRevenue = 0;
  for (const r of data.rows) {
    if (rowSourceKey(r) !== sourceKey) continue;
    const value = Number.isFinite(r.value) && r.value > 0 ? r.value : 0;
    const hid = r.hotelClientId ?? "";
    const acc = byHotel.get(hid) ?? { revenue: 0, bookings: 0 };
    acc.revenue += value;
    acc.bookings += 1;
    byHotel.set(hid, acc);
    sourceRevenue += value;
  }

  const hotels = [...byHotel.entries()]
    .map(([hotelClientId, a]) => ({
      hotelClientId,
      name: data.hotelNames.get(hotelClientId) ?? "—",
      revenue: a.revenue,
      bookings: a.bookings,
      averageBookingValue: a.bookings > 0 ? a.revenue / a.bookings : 0,
      percentOfSource: sourceRevenue > 0 ? (a.revenue / sourceRevenue) * 100 : 0,
    }))
    .sort((x, y) => y.revenue - x.revenue || x.name.localeCompare(y.name));

  return Response.json({
    sourceKey,
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    total: { revenue: sourceRevenue, bookings: hotels.reduce((s, h) => s + h.bookings, 0) },
    hotels,
  });
}
