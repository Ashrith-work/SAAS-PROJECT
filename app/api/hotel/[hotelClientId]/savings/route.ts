import { requireHotelOwnerAccess } from "@/lib/hotel-auth";
import { runWithAgencyScope } from "@/lib/tenant";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { calculateHotelSavings, hotelMonthlyTrend, lastNMonths } from "@/lib/savings";

// GET /api/hotel/[hotelClientId]/savings — hotel-owner mirror of the agency savings
// route: OTA commission saved this period + previous period (KPI delta) + a
// 12-month trend. Authorized via requireHotelOwnerAccess; reads run inside
// runWithAgencyScope so they are scoped to the owning agency + this hotel.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const access = await requireHotelOwnerAccess(hotelClientId);
  if (!access) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { start, end } = parseAgencyWindow(new URL(request.url).searchParams);

  try {
    return await runWithAgencyScope(access.agencyId, async () => {
      const cur = await calculateHotelSavings(hotelClientId, start, end);
      if (!cur) return Response.json({ error: "Hotel not found" }, { status: 404 });

      const span = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - span - 1);
      const prevEnd = new Date(start.getTime() - 1);
      const months = lastNMonths(end, 12);

      const [prev, monthlyTrend] = await Promise.all([
        calculateHotelSavings(hotelClientId, prevStart, prevEnd),
        hotelMonthlyTrend(hotelClientId, months, cur.otaRateUsed),
      ]);

      return Response.json({
        hotelId: hotelClientId,
        hotelName: cur.hotelName,
        otaRateUsed: cur.otaRateUsed,
        totalRevenue: cur.totalBookingRevenue,
        totalSavings: cur.totalSavings,
        bookingCount: cur.bookingCount,
        previous: { totalSavings: prev?.totalSavings ?? 0 },
        range: { startDate: start.toISOString(), endDate: end.toISOString() },
        monthlyTrend,
      });
    });
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
