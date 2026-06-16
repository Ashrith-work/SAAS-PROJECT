import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { parseInstagramPostUrl } from "@/lib/instagram-detect";

// POST /api/agency/hotels/[hotelId]/influencer-posts — manual entry (PART 3
// method 2). The agency pastes the URL of an influencer's Instagram post that
// mentions the hotel; we store it as an InfluencerInstagramPost. Reach/impressions
// aren't fetchable for other users' media (API limit), so they stay null/0 and
// render "Not available". Agency-only: a non-member (incl. hotel owners) gets 403.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ hotelId: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { hotelId } = await params;
  const body = await request.json().catch(() => ({}));
  const influencerId = typeof body.influencerId === "string" ? body.influencerId : "";
  const url = typeof body.url === "string" ? body.url : "";
  const postedAtRaw = typeof body.postedAt === "string" ? Date.parse(body.postedAt) : NaN;
  if (!influencerId || !url) return Response.json({ error: "influencerId and url are required." }, { status: 400 });

  const parsed = parseInstagramPostUrl(url);
  if (!parsed) return Response.json({ error: "That doesn't look like an Instagram post or reel URL." }, { status: 400 });

  // Ownership: both the hotel and the influencer must belong to this agency.
  const [hotel, influencer] = await Promise.all([
    agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelId }, select: { id: true } }),
    agencyScoped(prisma.influencer).findFirst({
      where: { id: influencerId, OR: [{ hotelClientId: hotelId }, { hotelClientId: null }] },
      select: { id: true, instagramUserId: true },
    }),
  ]);
  if (!hotel) return Response.json({ error: "Hotel not found" }, { status: 404 });
  if (!influencer) return Response.json({ error: "Choose an influencer that belongs to your agency." }, { status: 404 });

  const postedAt = Number.isFinite(postedAtRaw) ? new Date(postedAtRaw) : new Date();

  try {
    const post = await prisma.influencerInstagramPost.upsert({
      where: { instagramPostId: parsed.shortcode },
      create: {
        agencyId: member.agencyId,
        hotelClientId: hotelId,
        influencerId,
        instagramPostId: parsed.shortcode,
        instagramUserId: influencer.instagramUserId ?? "",
        postedAt,
        mediaType: parsed.mediaType,
        permalink: parsed.permalink,
        captionText: typeof body.caption === "string" ? body.caption : null,
        reach: null, // not available via API for others' posts
        taggedHotelAccount: false,
        mentionedHotelInCaption: true, // the agency is asserting this post mentions the hotel
      },
      update: { influencerId, mediaType: parsed.mediaType, permalink: parsed.permalink, syncedAt: new Date() },
      select: { id: true },
    });
    await prisma.influencer.updateMany({ where: { id: influencerId, agencyId: member.agencyId }, data: { lastDetectedAt: new Date() } });
    return Response.json({ ok: true, id: post.id });
  } catch {
    return Response.json({ error: "Could not save the post." }, { status: 503 });
  }
}
