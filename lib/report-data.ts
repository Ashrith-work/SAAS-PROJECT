import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant-scope";
import {
  computeAdsSummary,
  computeContentPerformance,
  computeInfluencerImpact,
  computeKpis,
  trueRoi,
  type AdSnapshotInput,
  type AdsSummary,
  type ContentInput,
  type ContentPerf,
  type EventInput,
  type InfluencerRow,
  type Kpis,
  type RedemptionInput,
} from "@/lib/attribution";

// Loads + computes the full attribution picture for one hotel over a date range.
// Shared by the agency dashboard logic and the public /share view so both show
// identical numbers. Always scoped by BOTH agencyId and hotelClientId, so it can
// never read another tenant's data even when called from the public, unauthed
// share page (the caller resolves agencyId from the share token, not the URL).

export type HotelReport = {
  kpis: Kpis;
  contentPerf: ContentPerf[];
  ads: AdsSummary;
  influencerRows: InfluencerRow[];
  /** Real ad-driven revenue ÷ spend (HotelTrack's "true ROI"). */
  realRoi: number | null;
  /** OTA commission saved by direct bookings this period (Part 7). */
  otaSavings: { rate: number; bookingRevenue: number; amount: number };
};

export async function loadHotelReport(args: {
  agencyId: string;
  hotelId: string;
  since: Date;
  until: Date;
}): Promise<HotelReport> {
  const { agencyId, hotelId, since, until } = args;

  // agencyScopedFor injects { agencyId } into every where below. This function
  // is also called from the public /share page (which resolves agencyId from the
  // share token, NOT a session), so it takes agencyId as a param rather than
  // reading the Clerk context.
  const [content, events, snapshots, hotelMeta] = await Promise.all([
    agencyScopedFor(agencyId, prisma.contentPiece).findMany({
      where: { hotelClientId: hotelId },
      select: {
        id: true,
        title: true,
        contentType: true,
        platform: true,
        couponCode: true,
        influencerName: true,
      },
    }),
    agencyScopedFor(agencyId, prisma.trackingEvent).findMany({
      where: { hotelClientId: hotelId, createdAt: { gte: since, lte: until } },
      select: {
        eventType: true,
        utmContent: true,
        utmCampaign: true,
        sessionId: true,
        conversionValue: true,
      },
    }),
    agencyScopedFor(agencyId, prisma.adSnapshot).findMany({
      where: { hotelClientId: hotelId, archived: false, date: { gte: since, lte: until } },
      orderBy: { date: "asc" },
      select: { date: true, spend: true, conversions: true, roas: true },
    }),
    agencyScopedFor(agencyId, prisma.hotelClient).findFirst({
      where: { id: hotelId },
      select: { otaCommissionRate: true },
    }),
  ]);

  const contentIds = content.map((c) => c.id);
  const redemptions =
    contentIds.length > 0
      ? await agencyScopedFor(agencyId, prisma.couponRedemption).findMany({
          where: {
            contentPieceId: { in: contentIds },
            redemptionDate: { gte: since, lte: until },
          },
          select: { contentPieceId: true, orderValue: true },
        })
      : [];

  // Normalise Prisma Decimals -> plain numbers for the pure helpers.
  const contentInputs: ContentInput[] = content;
  const eventInputs: EventInput[] = events.map((e) => ({
    eventType: e.eventType,
    utmContent: e.utmContent,
    utmCampaign: e.utmCampaign,
    sessionId: e.sessionId,
    conversionValue: e.conversionValue == null ? null : Number(e.conversionValue),
  }));
  const snapshotInputs: AdSnapshotInput[] = snapshots.map((s) => ({
    date: s.date,
    spend: Number(s.spend),
    conversions: s.conversions,
    roas: s.roas,
  }));
  const redemptionInputs: RedemptionInput[] = redemptions.map((r) => ({
    contentPieceId: r.contentPieceId,
    orderValue: Number(r.orderValue),
  }));

  const ads = computeAdsSummary(snapshotInputs);
  const kpis = computeKpis(eventInputs, ads.spend);
  const contentPerf = computeContentPerformance(contentInputs, eventInputs);
  const influencerRows = computeInfluencerImpact(contentInputs, redemptionInputs);

  const realAdRevenue = contentPerf
    .filter((c) => c.contentType === "paid_ad")
    .reduce((sum, c) => sum + c.revenue, 0);
  const realRoi = trueRoi(realAdRevenue, ads.spend);

  // OTA commission saved by direct (snippet-tracked) bookings this period.
  const otaRate = hotelMeta?.otaCommissionRate == null ? 18 : Number(hotelMeta.otaCommissionRate);
  const bookingRevenue = eventInputs
    .filter((e) => e.eventType === "conversion")
    .reduce((sum, e) => sum + (e.conversionValue ?? 0), 0);
  const otaSavings = {
    rate: otaRate,
    bookingRevenue,
    amount: otaRate > 0 ? bookingRevenue * (otaRate / 100) : 0,
  };

  return { kpis, contentPerf, ads, influencerRows, realRoi, otaSavings };
}
