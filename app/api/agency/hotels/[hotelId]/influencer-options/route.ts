import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";

// GET /api/agency/hotels/[hotelId]/influencer-options — minimal influencer list
// (id, name, handle) for this hotel (hotel-specific + agency-wide, active only),
// used by the "Link to Influencer" modal on the Reach Split panel. Agency-only.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { hotelId } = await params;
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } });
  if (!hotel) return Response.json({ error: "Hotel not found" }, { status: 404 });

  const influencers = await agencyScoped(prisma.influencer).findMany({
    where: { archivedAt: null, OR: [{ hotelClientId: hotelId }, { hotelClientId: null }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, instagramHandle: true },
  });
  return Response.json({ influencers });
}
