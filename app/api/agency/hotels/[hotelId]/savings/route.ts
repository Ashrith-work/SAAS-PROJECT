import { getCurrentMember } from "@/lib/auth";
import { parseAgencyWindow } from "@/lib/agency-revenue";
import { calculateHotelSavings, hotelMonthlyTrend, lastNMonths } from "@/lib/savings";

// GET /api/agency/hotels/[hotelId]/savings — OTA commission savings for one hotel:
// period total + same-length previous period (for the KPI delta) + a 12-month
// trend (zero-filled). Agency-scoped — another agency's hotel returns 404.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { hotelId } = await params;
  const { start, end } = parseAgencyWindow(new URL(request.url).searchParams);

  let cur;
  try {
    cur = await calculateHotelSavings(hotelId, start, end);
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  if (!cur) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const span = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - span - 1);
  const prevEnd = new Date(start.getTime() - 1);
  const months = lastNMonths(end, 12);

  const [prev, monthlyTrend] = await Promise.all([
    calculateHotelSavings(hotelId, prevStart, prevEnd),
    hotelMonthlyTrend(hotelId, months, cur.otaRateUsed),
  ]);

  return Response.json({
    hotelId,
    hotelName: cur.hotelName,
    otaRateUsed: cur.otaRateUsed,
    totalRevenue: cur.totalBookingRevenue,
    totalSavings: cur.totalSavings,
    bookingCount: cur.bookingCount,
    previous: { totalSavings: prev?.totalSavings ?? 0 },
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    monthlyTrend,
  });
}
