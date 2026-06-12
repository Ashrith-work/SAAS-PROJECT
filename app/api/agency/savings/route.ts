import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant";
import { parseAgencyWindow, parseHotelFilter } from "@/lib/agency-revenue";
import { calculateAgencySavings, agencyMonthlyTrend, lastNMonths, DEFAULT_OTA_RATE } from "@/lib/savings";

// GET /api/agency/savings — agency-wide OTA commission savings: period total
// (each hotel at its own rate) + previous period + per-hotel breakdown + a
// 12-month trend with the per-hotel stacked split. Agency-scoped; soft-deleted
// hotels excluded; a hotelFilter naming another agency's hotel is dropped.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const agencyId = member.agencyId;

  const url = new URL(request.url);
  const { start, end } = parseAgencyWindow(url.searchParams);
  const hotelFilter = parseHotelFilter(url.searchParams);

  const span = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - span - 1);
  const prevEnd = new Date(start.getTime() - 1);
  const months = lastNMonths(end, 12);

  let cur, prev, hotelsMeta;
  try {
    [cur, prev, hotelsMeta] = await Promise.all([
      calculateAgencySavings(agencyId, start, end, hotelFilter),
      calculateAgencySavings(agencyId, prevStart, prevEnd, hotelFilter),
      agencyScopedFor(agencyId, prisma.hotelClient).findMany({
        where: { deletedAt: null, ...(hotelFilter && hotelFilter.length ? { id: { in: hotelFilter } } : {}) },
        select: { id: true, name: true, otaCommissionRate: true },
      }),
    ]);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }

  const metaMap = new Map(
    hotelsMeta.map((h) => [h.id, { name: h.name, rate: h.otaCommissionRate == null ? DEFAULT_OTA_RATE : Number(h.otaCommissionRate) }]),
  );
  const { trend, byHotel } = await agencyMonthlyTrend(agencyId, metaMap, months);

  return Response.json({
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    totalRevenue: cur.totalBookingRevenue,
    totalSavings: cur.totalSavings,
    bookingCount: cur.bookingCount,
    activeHotelsCount: cur.activeHotelsCount,
    totalHotelsCount: hotelsMeta.length,
    previous: { totalSavings: prev.totalSavings },
    hotelBreakdown: cur.hotelBreakdown,
    hotels: hotelsMeta.map((h) => ({ id: h.id, name: h.name })),
    monthlyTrend: trend,
    monthlyByHotel: byHotel,
  });
}
