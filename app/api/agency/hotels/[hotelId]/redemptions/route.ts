import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { isCouponRedeemable } from "@/lib/coupon";

// POST /api/agency/hotels/[hotelId]/redemptions — Path B: manually log a coupon
// redemption for a booking that happened OFF-snippet (channel-manager engines).
// Creates an InfluencerRedemption(manual_entry) and NO TrackingEvent.
//
// Multi-tenant: the hotel AND the coupon must belong to the caller's agency.
// A hotel/coupon owned by another agency → 404 (never 403; no existence leak).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Both agency roles may log redemptions (PART 5).
const ALLOWED_ROLES = new Set(["admin", "analyst"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(member.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { hotelId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;

  const couponCodeId = str(body.couponCodeId);
  const bookingValueNum = Number(body.bookingValue);
  if (!couponCodeId) return Response.json({ error: "couponCodeId is required" }, { status: 400 });
  if (!Number.isFinite(bookingValueNum) || bookingValueNum < 0) {
    return Response.json({ error: "A valid bookingValue is required" }, { status: 400 });
  }

  // Tenant + existence: the hotel must belong to this agency (404 on a miss).
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true, agencyId: true },
  });
  if (!hotel) return Response.json({ error: "Hotel not found" }, { status: 404 });

  // The coupon must belong to this agency AND this hotel (404 — no leak).
  const coupon = await agencyScoped(prisma.couponCode).findFirst({
    where: { id: couponCodeId, hotelClientId: hotelId },
    select: { id: true, influencerId: true, status: true, validFrom: true, validUntil: true },
  });
  if (!coupon) return Response.json({ error: "Coupon not found for this hotel" }, { status: 404 });
  if (!isCouponRedeemable(coupon)) {
    return Response.json({ error: "Coupon is not active" }, { status: 400 });
  }

  let bookingDate: Date | null = null;
  if (typeof body.bookingDate === "string" && body.bookingDate) {
    const t = Date.parse(body.bookingDate);
    if (Number.isFinite(t)) bookingDate = new Date(t);
  }

  const created = await agencyScoped(prisma.influencerRedemption).create({
    data: {
      agencyId: hotel.agencyId, // re-stamped by agencyScoped; satisfies the type
      couponCodeId: coupon.id,
      influencerId: coupon.influencerId,
      hotelClientId: hotelId,
      bookingValue: bookingValueNum.toFixed(2),
      bookingReference: str(body.bookingReference),
      guestName: str(body.guestName),
      bookingDate,
      redemptionSource: "manual_entry",
      enteredByMemberId: member.id,
      notes: str(body.notes),
    },
    select: { id: true },
  });

  return Response.json({ ok: true, id: created.id }, { status: 201 });
}
