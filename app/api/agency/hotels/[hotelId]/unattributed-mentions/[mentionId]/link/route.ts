import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";

// POST /api/agency/hotels/[hotelId]/unattributed-mentions/[mentionId]/link
// Agency action (PART 5D / PART 6): assign an UnattributedMention to a known
// influencer. Promotes the mention into InfluencerInstagramPost, learns the
// poster's IG user id onto the influencer (so future posts auto-attribute), and
// removes the mention. Agency-only — a non-member (incl. hotel owners) gets 403.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hotelId: string; mentionId: string }> },
) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { hotelId, mentionId } = await params;
  const body = await request.json().catch(() => ({}));
  const influencerId = typeof body.influencerId === "string" ? body.influencerId : "";
  if (!influencerId) return Response.json({ error: "influencerId is required." }, { status: 400 });

  // Scope mention + influencer to this agency (agencyScoped) and this hotel.
  const [mention, influencer] = await Promise.all([
    agencyScoped(prisma.unattributedMention).findFirst({ where: { id: mentionId, hotelClientId: hotelId }, select: {
      id: true, instagramPostId: true, posterInstagramUserId: true, postedAt: true,
      mediaType: true, permalink: true, captionText: true, reach: true,
      likes: true, comments: true, saves: true, shares: true,
      taggedHotelAccount: true, mentionedHotelInCaption: true,
    } }),
    agencyScoped(prisma.influencer).findFirst({
      where: { id: influencerId, OR: [{ hotelClientId: hotelId }, { hotelClientId: null }] },
      select: { id: true, instagramUserId: true },
    }),
  ]);
  if (!mention) return Response.json({ error: "Mention not found" }, { status: 404 });
  if (!influencer) return Response.json({ error: "Choose an influencer that belongs to your agency." }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.influencerInstagramPost.upsert({
        where: { instagramPostId: mention.instagramPostId },
        create: {
          agencyId: member.agencyId,
          hotelClientId: hotelId,
          influencerId,
          instagramPostId: mention.instagramPostId,
          instagramUserId: mention.posterInstagramUserId ?? influencer.instagramUserId ?? "",
          postedAt: mention.postedAt,
          mediaType: mention.mediaType,
          permalink: mention.permalink,
          captionText: mention.captionText,
          reach: mention.reach,
          likes: mention.likes,
          comments: mention.comments,
          saves: mention.saves,
          shares: mention.shares,
          taggedHotelAccount: mention.taggedHotelAccount,
          mentionedHotelInCaption: mention.mentionedHotelInCaption,
        },
        update: { influencerId, syncedAt: new Date() },
      });
      // Learn the poster id for future auto-matching; stamp last-detected.
      await tx.influencer.update({
        where: { id: influencerId },
        data: {
          lastDetectedAt: new Date(),
          ...(influencer.instagramUserId == null && mention.posterInstagramUserId
            ? { instagramUserId: mention.posterInstagramUserId }
            : {}),
        },
      });
      await tx.unattributedMention.delete({ where: { id: mention.id } });
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not link the mention." }, { status: 503 });
  }
}
