import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";

// Influencer Performance (Phase R2) — per-influencer redemption + revenue rollup
// for one hotel over a date range. Reads InfluencerRedemption (both snippet_auto
// and manual_entry, treated identically) joined to its influencer, plus the
// active-code count per influencer. Archived influencers still appear if they
// have redemptions in range (their history stays visible). Agency-scoped.

export type InfluencerPerfRow = {
  influencerId: string;
  name: string;
  instagramHandle: string | null;
  archived: boolean;
  activeCodes: number;
  redemptions: number;
  revenue: number;
  averageBookingValue: number;
  snippetCount: number; // captured automatically by the snippet
  manualCount: number; // entered by hand
};

export async function loadInfluencerPerformance(
  hotelClientId: string,
  range: { since: Date; until: Date },
): Promise<InfluencerPerfRow[]> {
  const [reds, activeCodeGroups] = await Promise.all([
    agencyScoped(prisma.influencerRedemption).findMany({
      where: { hotelClientId, redeemedAt: { gte: range.since, lte: range.until } },
      select: {
        influencerId: true,
        bookingValue: true,
        redemptionSource: true,
        influencer: { select: { name: true, instagramHandle: true, archivedAt: true } },
      },
    }),
    agencyScoped(prisma.couponCode).groupBy({
      by: ["influencerId"],
      where: { hotelClientId, status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  const activeByInfluencer = new Map<string, number>();
  for (const g of activeCodeGroups) activeByInfluencer.set(g.influencerId, g._count._all);

  type Acc = Omit<InfluencerPerfRow, "averageBookingValue" | "activeCodes">;
  const accs = new Map<string, Acc>();
  for (const r of reds) {
    let a = accs.get(r.influencerId);
    if (!a) {
      a = {
        influencerId: r.influencerId,
        name: r.influencer.name,
        instagramHandle: r.influencer.instagramHandle,
        archived: r.influencer.archivedAt != null,
        redemptions: 0,
        revenue: 0,
        snippetCount: 0,
        manualCount: 0,
      };
      accs.set(r.influencerId, a);
    }
    a.redemptions += 1;
    a.revenue += Number(r.bookingValue);
    if (r.redemptionSource === "manual_entry") a.manualCount += 1;
    else a.snippetCount += 1;
  }

  return [...accs.values()]
    .map((a) => ({
      ...a,
      activeCodes: activeByInfluencer.get(a.influencerId) ?? 0,
      averageBookingValue: a.redemptions > 0 ? a.revenue / a.redemptions : 0,
    }))
    .sort((x, y) => y.revenue - x.revenue || y.redemptions - x.redemptions || x.name.localeCompare(y.name));
}
