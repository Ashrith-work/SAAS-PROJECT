import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { classifySourceType, SOURCE_TYPE_LABEL, type SourceType } from "@/lib/source-classifier";
import { formatDuration } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Owner-overview metrics (Tier A) — READ-ONLY calculations over data already in
// the DB (TrackingEvent conversions, Session/PageView journey rows, AdSnapshot /
// AdCampaignSnapshot ad spend). No schema changes, no new integrations.
//
// Money is represented as plain `number` (rupees) — NOT Prisma.Decimal — to match
// the rest of the codebase (lib/savings.ts, lib/attribution.ts all Number() the
// Decimal columns immediately) and to serialise cleanly to JSON for the client.
//
// Multi-tenant: every read goes through agencyScoped(...), which injects the
// caller's agencyId, AND is additionally filtered by hotelClientId — so a hotel
// from another agency simply yields no rows. The route also does an explicit
// ownership check (404) before any of these run.
//
// Notes on two places where the spec referenced fields that don't exist:
//   • AdSnapshot is ACCOUNT-level and has no campaignName; the campaign name +
//     per-campaign spend live on AdCampaignSnapshot, so calculateTopCampaigns
//     joins there (case-insensitive trimmed name match).
//   • PageView has no deviceType column, only viewportWidth — so calculateDeviceSplit
//     classifies by viewportWidth (the exact thresholds the spec gives), and falls
//     back to a Session.userAgent heuristic when the width wasn't captured.
// ─────────────────────────────────────────────────────────────────────────────

const num = (d: { toString(): string } | null | undefined): number =>
  d == null ? 0 : Number(d);

// ── 1. Marketing spend (Meta only in v1; Google not integrated yet) ──────────

export type MarketingSpend = { total: number; meta: number; google: number | null };

export async function calculateMarketingSpend(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<MarketingSpend> {
  const agg = await agencyScoped(prisma.adSnapshot).aggregate({
    where: { hotelClientId, archived: false, date: { gte: startDate, lte: endDate } },
    _sum: { spend: true },
  });
  const meta = num(agg._sum.spend);
  return { total: meta, meta, google: null };
}

// ── 2. Cost per booking ──────────────────────────────────────────────────────

export type CostPerBooking = { costPerBooking: number | null; bookings: number; totalSpend: number };

export async function calculateCostPerBooking(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<CostPerBooking> {
  const [spendAgg, bookings] = await Promise.all([
    agencyScoped(prisma.adSnapshot).aggregate({
      where: { hotelClientId, archived: false, date: { gte: startDate, lte: endDate } },
      _sum: { spend: true },
    }),
    agencyScoped(prisma.trackingEvent).count({
      where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);
  const totalSpend = num(spendAgg._sum.spend);
  return {
    costPerBooking: bookings > 0 ? totalSpend / bookings : null,
    bookings,
    totalSpend,
  };
}

// ── 3. ROAS (overall + Meta; Google null) ────────────────────────────────────

export type Roas = { overall: number | null; meta: number | null; google: number | null };

export async function calculateROAS(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<Roas> {
  const [spendAgg, conversions] = await Promise.all([
    agencyScoped(prisma.adSnapshot).aggregate({
      where: { hotelClientId, archived: false, date: { gte: startDate, lte: endDate } },
      _sum: { spend: true },
    }),
    agencyScoped(prisma.trackingEvent).findMany({
      where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
      select: { conversionValue: true, utmSource: true, utmMedium: true, utmContent: true },
    }),
  ]);
  const metaSpend = num(spendAgg._sum.spend); // all integrated ad spend is Meta in v1
  let totalRevenue = 0;
  let metaRevenue = 0;
  for (const c of conversions) {
    const value = num(c.conversionValue);
    totalRevenue += value;
    if (classifySourceType(c) === "meta_ads") metaRevenue += value;
  }
  // Use "—" (null) — not 0× — whenever the denominator is 0 (Part 5 #5).
  return {
    overall: metaSpend > 0 ? totalRevenue / metaSpend : null,
    meta: metaSpend > 0 ? metaRevenue / metaSpend : null,
    google: null,
  };
}

// ── 4. Conversion rate (bookings ÷ sessions × 100) ───────────────────────────

export type ConversionRate = { conversionRate: number; bookings: number; sessions: number };

export async function calculateConversionRate(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<ConversionRate> {
  const [sessions, bookings] = await Promise.all([
    agencyScoped(prisma.session).count({
      where: { hotelClientId, startedAt: { gte: startDate, lte: endDate } },
    }),
    agencyScoped(prisma.trackingEvent).count({
      where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);
  // 0 when there are no sessions (the UI shows "—" for that "no data yet" case;
  // a real 0% — traffic but no bookings — is shown as 0%, see Part 5 #1/#3).
  return {
    conversionRate: sessions > 0 ? (bookings / sessions) * 100 : 0,
    bookings,
    sessions,
  };
}

// ── 5. New vs returning visitors (ad-driven sessions) ────────────────────────

export type NewVsReturning = { newVisitors: number; returningVisitors: number; totalAdVisitors: number };

const isPaidAdSession = (s: { utmSource: string | null; utmMedium: string | null }): boolean => {
  const t = classifySourceType({ utmSource: s.utmSource, utmMedium: s.utmMedium });
  return t === "meta_ads" || t === "google_ads";
};

export async function calculateNewVsReturningFromAds(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<NewVsReturning> {
  const sessions = await agencyScoped(prisma.session).findMany({
    where: { hotelClientId, startedAt: { gte: startDate, lte: endDate } },
    select: { visitorId: true, utmSource: true, utmMedium: true },
  });
  const adSessions = sessions.filter(isPaidAdSession);
  const visitorIds = [...new Set(adSessions.map((s) => s.visitorId))];

  // Which of these visitors were seen in ANY session before this period started?
  const priorVisitorIds =
    visitorIds.length > 0
      ? new Set(
          (
            await agencyScoped(prisma.session).findMany({
              where: { hotelClientId, visitorId: { in: visitorIds }, startedAt: { lt: startDate } },
              select: { visitorId: true },
              distinct: ["visitorId"],
            })
          ).map((r) => r.visitorId),
        )
      : new Set<string>();

  let newVisitors = 0;
  let returningVisitors = 0;
  for (const s of adSessions) {
    if (priorVisitorIds.has(s.visitorId)) returningVisitors += 1;
    else newVisitors += 1;
  }
  return { newVisitors, returningVisitors, totalAdVisitors: adSessions.length };
}

// ── 6. Device split (mobile / desktop / tablet / unknown) ────────────────────

export type DeviceSplit = { mobile: number; desktop: number; tablet: number; unknown: number };

type Device = keyof DeviceSplit;

function deviceFromWidth(width: number | null | undefined): Device | null {
  if (width == null) return null;
  if (width < 768) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

function deviceFromUserAgent(ua: string | null | undefined): Device {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "unknown";
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(s)) return "mobile";
  return "desktop";
}

export async function calculateDeviceSplit(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<DeviceSplit> {
  const sessions = await agencyScoped(prisma.session).findMany({
    where: { hotelClientId, startedAt: { gte: startDate, lte: endDate } },
    select: { id: true, userAgent: true },
  });
  const result: DeviceSplit = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
  if (sessions.length === 0) return result;

  const sessionIds = sessions.map((s) => s.id);
  // First pageview (by enteredAt) per session carries the viewport width we
  // classify on. Fetch ascending and keep the earliest seen per session.
  const pageViews = await agencyScoped(prisma.pageView).findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { enteredAt: "asc" },
    select: { sessionId: true, viewportWidth: true },
  });
  const firstWidth = new Map<string, number | null>();
  for (const pv of pageViews) {
    if (!firstWidth.has(pv.sessionId)) firstWidth.set(pv.sessionId, pv.viewportWidth);
  }

  for (const s of sessions) {
    // Prefer the first pageview's viewport; fall back to a UA heuristic when the
    // width wasn't captured (older snippet versions) — Part 5 #4.
    const byWidth = firstWidth.has(s.id) ? deviceFromWidth(firstWidth.get(s.id)) : null;
    const device = byWidth ?? deviceFromUserAgent(s.userAgent);
    result[device] += 1;
  }
  return result;
}

// ── 7. Bounce rate (1 pageview AND < 10s on site) ────────────────────────────

export type BounceRate = { bounceRate: number; bouncedSessions: number; totalSessions: number };

export async function calculateBounceRate(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<BounceRate> {
  const [totalSessions, bouncedSessions] = await Promise.all([
    agencyScoped(prisma.session).count({
      where: { hotelClientId, startedAt: { gte: startDate, lte: endDate } },
    }),
    agencyScoped(prisma.session).count({
      where: {
        hotelClientId,
        startedAt: { gte: startDate, lte: endDate },
        pageViewCount: 1,
        totalTimeMs: { lt: 10_000 },
      },
    }),
  ]);
  return {
    bounceRate: totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0,
    bouncedSessions,
    totalSessions,
  };
}

// ── 8. Average time on site ──────────────────────────────────────────────────

export type AverageTimeOnSite = { averageMs: number; averageFormatted: string; sessions: number };

export async function calculateAverageTimeOnSite(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<AverageTimeOnSite> {
  const agg = await agencyScoped(prisma.session).aggregate({
    where: { hotelClientId, startedAt: { gte: startDate, lte: endDate }, totalTimeMs: { gt: 0 } },
    _avg: { totalTimeMs: true },
    _count: { _all: true },
  });
  const sessions = agg._count._all;
  const averageMs = Math.round(agg._avg.totalTimeMs ?? 0);
  return {
    averageMs,
    averageFormatted: sessions > 0 ? formatDuration(averageMs) : "—",
    sessions,
  };
}

// ── 9. Top campaigns (by booking revenue), joined to Meta spend by name ──────

export type TopCampaign = {
  campaignName: string;
  source: "meta" | "google" | "other";
  spend: number | null;
  revenue: number;
  bookings: number;
  roas: number | null;
  costPerBooking: number | null;
};
export type TopCampaigns = { campaigns: TopCampaign[] };

export async function calculateTopCampaigns(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
  limit = 5,
): Promise<TopCampaigns> {
  const [conversions, campaignSnaps] = await Promise.all([
    agencyScoped(prisma.trackingEvent).findMany({
      where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
      select: { utmCampaign: true, utmSource: true, utmMedium: true, utmContent: true, conversionValue: true },
    }),
    // Per-campaign Meta spend (AdSnapshot has no campaign dimension).
    agencyScoped(prisma.adCampaignSnapshot).findMany({
      where: { hotelClientId, archived: false, date: { gte: startDate, lte: endDate } },
      select: { campaignName: true, spend: true },
    }),
  ]);

  // Meta spend per campaign, keyed by case-insensitive trimmed name.
  const spendByName = new Map<string, number>();
  for (const s of campaignSnaps) {
    const key = s.campaignName.trim().toLowerCase();
    if (!key) continue;
    spendByName.set(key, (spendByName.get(key) ?? 0) + num(s.spend));
  }

  type Agg = { campaignName: string; revenue: number; bookings: number; source: TopCampaign["source"] };
  const byCampaign = new Map<string, Agg>();
  for (const c of conversions) {
    const name = (c.utmCampaign ?? "").trim();
    if (!name) continue; // no campaign → excluded from this table (the "Direct" bucket)
    const key = name.toLowerCase();
    const type = classifySourceType(c);
    const source: TopCampaign["source"] =
      type === "meta_ads" ? "meta" : type === "google_ads" ? "google" : "other";
    const row = byCampaign.get(key) ?? { campaignName: name, revenue: 0, bookings: 0, source };
    row.revenue += num(c.conversionValue);
    row.bookings += 1;
    byCampaign.set(key, row);
  }

  const campaigns: TopCampaign[] = [...byCampaign.entries()]
    .map(([key, a]): TopCampaign => {
      const spend = spendByName.has(key) ? spendByName.get(key)! : null;
      return {
        campaignName: a.campaignName,
        source: a.source,
        spend,
        revenue: a.revenue,
        bookings: a.bookings,
        roas: spend != null && spend > 0 ? a.revenue / spend : null,
        costPerBooking: spend != null && a.bookings > 0 ? spend / a.bookings : null,
      };
    })
    .sort((x, y) => y.revenue - x.revenue)
    .slice(0, limit);

  return { campaigns };
}

// ── 10. Bookings by source (R1 source-classifier as the visualization layer) ──

export type SourceBreakdownRow = { type: SourceType; label: string; revenue: number; bookings: number };
export type BookingsBySource = { sources: SourceBreakdownRow[]; totalRevenue: number; totalBookings: number };

export async function calculateBookingsBySource(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<BookingsBySource> {
  const conversions = await agencyScoped(prisma.trackingEvent).findMany({
    where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
    select: { conversionValue: true, utmSource: true, utmMedium: true, utmContent: true },
  });
  const byType = new Map<SourceType, { revenue: number; bookings: number }>();
  let totalRevenue = 0;
  let totalBookings = 0;
  for (const c of conversions) {
    const type = classifySourceType(c);
    const value = num(c.conversionValue);
    const row = byType.get(type) ?? { revenue: 0, bookings: 0 };
    row.revenue += value;
    row.bookings += 1;
    byType.set(type, row);
    totalRevenue += value;
    totalBookings += 1;
  }
  const sources: SourceBreakdownRow[] = [...byType.entries()]
    .map(([type, v]) => ({ type, label: SOURCE_TYPE_LABEL[type], revenue: v.revenue, bookings: v.bookings }))
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
  return { sources, totalRevenue, totalBookings };
}

// ── Aggregate: everything the owner-metrics endpoint returns ──────────────────

export type OwnerMetrics = {
  marketingSpend: MarketingSpend;
  costPerBooking: CostPerBooking;
  roas: Roas;
  conversionRate: ConversionRate;
  newVsReturning: NewVsReturning;
  deviceSplit: DeviceSplit;
  bounceRate: BounceRate;
  averageTimeOnSite: AverageTimeOnSite;
  topCampaigns: TopCampaigns;
  bookingsBySource: BookingsBySource;
  meta: { metaConnected: boolean };
};

/** Run every calculation for one hotel + period in parallel. */
export async function loadOwnerMetrics(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<OwnerMetrics> {
  const [
    marketingSpend,
    costPerBooking,
    roas,
    conversionRate,
    newVsReturning,
    deviceSplit,
    bounceRate,
    averageTimeOnSite,
    topCampaigns,
    bookingsBySource,
    adSnapshotCount,
  ] = await Promise.all([
    calculateMarketingSpend(hotelClientId, startDate, endDate),
    calculateCostPerBooking(hotelClientId, startDate, endDate),
    calculateROAS(hotelClientId, startDate, endDate),
    calculateConversionRate(hotelClientId, startDate, endDate),
    calculateNewVsReturningFromAds(hotelClientId, startDate, endDate),
    calculateDeviceSplit(hotelClientId, startDate, endDate),
    calculateBounceRate(hotelClientId, startDate, endDate),
    calculateAverageTimeOnSite(hotelClientId, startDate, endDate),
    calculateTopCampaigns(hotelClientId, startDate, endDate),
    calculateBookingsBySource(hotelClientId, startDate, endDate),
    // "Has this hotel ever had any (non-archived) Meta ad data?" — drives the
    // "Connect Meta Ads…" hint vs a real ₹0 (Part 5 #2).
    agencyScoped(prisma.adSnapshot).count({ where: { hotelClientId, archived: false } }),
  ]);

  return {
    marketingSpend,
    costPerBooking,
    roas,
    conversionRate,
    newVsReturning,
    deviceSplit,
    bounceRate,
    averageTimeOnSite,
    topCampaigns,
    bookingsBySource,
    meta: { metaConnected: adSnapshotCount > 0 },
  };
}
