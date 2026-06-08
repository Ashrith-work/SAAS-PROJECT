import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import {
  computeAdsSummary,
  computeContentPerformance,
  computeInfluencerImpact,
  computeKpis,
  resolveRange,
  trueRoi,
  type AdSnapshotInput,
  type ContentInput,
  type EventInput,
  type RedemptionInput,
} from "@/lib/attribution";
import {
  formatCurrency,
  formatCurrencyCents,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { DateRangeSelector } from "./DateRangeSelector";
import { PostTypeFilter } from "./PostTypeFilter";
import { ContentPerformanceTable } from "@/components/report/ContentPerformanceTable";
import {
  CampaignPerformanceTable,
  type CampaignRow,
} from "@/components/dashboard/CampaignPerformanceTable";
import {
  ConversionJourneys,
  type ConversionJourney,
} from "@/components/dashboard/ConversionJourneys";
import {
  attributeConversions,
  UNATTRIBUTED_KEY,
  UNATTRIBUTED_NAME,
  type CampaignDay,
} from "@/lib/campaign-attribution";
import { SpendChart } from "@/components/report/SpendChart";
import { FollowerChart } from "@/components/report/FollowerChart";
import { SourcePieChart, type SourceSlice } from "@/components/report/SourcePieChart";
import { ReportMenu } from "./ReportMenu";
import { ShareLinkManager } from "./ShareLinkManager";
import { loadHotelStates } from "@/lib/integration-status";
import { missingAdDays } from "@/lib/backfill";

const POST_TYPES = ["image", "video", "carousel", "reels"] as const;
type PostType = (typeof POST_TYPES)[number];
const DAY_MS = 86_400_000;
import { isPixelMode } from "@/lib/tracking-mode";
import type { ReportData } from "./ReportDocument";

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-medium">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function HotelDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");
  const pixelMode = isPixelMode();

  // Multi-tenant: scope by id AND agencyId so one agency can't open another's hotel.
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      metaAdAccountId: true,
      snippetStatus: true,
      lastEventAt: true,
    },
  });
  if (!hotel) notFound();

  // Integration health for the "needs attention" banner (broken/expired only).
  const integrationStatus = await loadHotelStates({
    hotelId: hotel.id,
    snippetStatus: hotel.snippetStatus,
    lastEventAt: hotel.lastEventAt,
    plan: member.agency.plan,
    pixelMode,
  });
  // Cumulative days of missing Meta ad data, shown as a badge when the token
  // isn't healthy (a reconnect will backfill the gap).
  const missingDays =
    integrationStatus.meta === "connected"
      ? 0
      : await missingAdDays(member.agencyId, hotel.id);

  // Latest non-revoked public share link for this hotel (may be expired — the
  // manager shows that so the agency can regenerate). Scoped to this agency.
  const shareLinkRow = await agencyScoped(prisma.shareLink).findFirst({
    where: { hotelClientId: hotel.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      passwordHash: true,
      expiresAt: true,
      viewCount: true,
      lastViewedAt: true,
    },
  });
  const activeLink = shareLinkRow
    ? {
        id: shareLinkRow.id,
        token: shareLinkRow.token,
        hasPassword: shareLinkRow.passwordHash != null,
        expiresAt: shareLinkRow.expiresAt.toISOString(),
        expired: shareLinkRow.expiresAt < new Date(),
        viewCount: shareLinkRow.viewCount,
        lastViewedAt: shareLinkRow.lastViewedAt?.toISOString() ?? null,
      }
    : null;
  const shareBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const range = resolveRange({
    range: one(sp.range),
    from: one(sp.from),
    to: one(sp.to),
  });
  const rawPostType = one(sp.postType);
  const postType: PostType | null =
    rawPostType && (POST_TYPES as readonly string[]).includes(rawPostType)
      ? (rawPostType as PostType)
      : null;

  // All five queries scoped to this agency + hotel + range.
  const [content, events, snapshots] = await Promise.all([
    agencyScoped(prisma.contentPiece).findMany({
      where: { hotelClientId: hotel.id },
      select: {
        id: true,
        title: true,
        contentType: true,
        platform: true,
        couponCode: true,
        influencerName: true,
      },
    }),
    pixelMode
      ? Promise.resolve([] as Array<{
          eventType: "visit" | "conversion";
          utmContent: string | null;
          utmCampaign: string | null;
          sessionId: string;
          conversionValue: import("@prisma/client").Prisma.Decimal | null;
        }>)
      : agencyScoped(prisma.trackingEvent).findMany({
          where: {
            hotelClientId: hotel.id,
            createdAt: { gte: range.since, lte: range.until },
          },
          select: {
            eventType: true,
            utmContent: true,
            utmCampaign: true,
            sessionId: true,
            conversionValue: true,
          },
        }),
    agencyScoped(prisma.adSnapshot).findMany({
      where: {
        hotelClientId: hotel.id,
        date: { gte: range.since, lte: range.until },
      },
      orderBy: { date: "asc" },
      select: { date: true, spend: true, conversions: true, roas: true },
    }),
  ]);

  const contentIds = content.map((c) => c.id);
  const redemptions =
    contentIds.length > 0
      ? await agencyScoped(prisma.couponRedemption).findMany({
          where: {
            contentPieceId: { in: contentIds },
            redemptionDate: { gte: range.since, lte: range.until },
          },
          select: { contentPieceId: true, orderValue: true },
        })
      : [];

  // ── Campaign attribution: Meta campaigns ↔ real tracked bookings ──
  // Materialized per-day rows (refreshed by the Meta sync) + the raw events
  // needed for the per-conversion journey drill-down. Hidden in pixel mode
  // (no snippet events to attribute). All queries agency-scoped.
  const [campaignPerfRows, campaignSnapRows, recentConversionRows] = pixelMode
    ? [[], [], []]
    : await Promise.all([
        agencyScoped(prisma.campaignPerformance).findMany({
          where: {
            hotelClientId: hotel.id,
            date: { gte: range.since, lte: range.until },
          },
          select: {
            campaignKey: true,
            campaignName: true,
            metaSpend: true,
            metaReportedConversions: true,
            realBookings: true,
            realBookingValue: true,
          },
        }),
        agencyScoped(prisma.adCampaignSnapshot).findMany({
          where: {
            hotelClientId: hotel.id,
            date: { gte: range.since, lte: range.until },
          },
          select: {
            date: true,
            metaCampaignId: true,
            campaignName: true,
            spend: true,
            conversions: true,
            purchaseValue: true,
          },
        }),
        agencyScoped(prisma.trackingEvent).findMany({
          where: {
            hotelClientId: hotel.id,
            eventType: "conversion",
            createdAt: { gte: range.since, lte: range.until },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            sessionId: true,
            utmCampaign: true,
            utmContent: true,
            pageUrl: true,
            conversionValue: true,
            createdAt: true,
          },
        }),
      ]);
  // The journeys need each conversion session's visit history (30 days back,
  // matching the snippet's first-touch cookie window).
  const journeySessionIds = [...new Set(recentConversionRows.map((c) => c.sessionId))];
  const journeyVisitRows =
    journeySessionIds.length > 0
      ? await agencyScoped(prisma.trackingEvent).findMany({
          where: {
            hotelClientId: hotel.id,
            eventType: "visit",
            sessionId: { in: journeySessionIds },
            createdAt: {
              gte: new Date(range.since.getTime() - 30 * DAY_MS),
              lte: range.until,
            },
          },
          orderBy: { createdAt: "asc" },
          select: {
            sessionId: true,
            utmCampaign: true,
            utmContent: true,
            utmSource: true,
            pageUrl: true,
            createdAt: true,
          },
        })
      : [];

  // ── Organic social (Instagram) — all scoped to this agency + hotel ──
  // `priorFollowerSnap` is the last reading BEFORE the range, so follower growth
  // can be measured against the prior period. Post metrics drive engagement rate
  // (account-level engagement isn't synced), and the top-posts table.
  const [socialAccount, socialSnaps, priorFollowerSnap, topPosts, postAgg] =
    await Promise.all([
      agencyScoped(prisma.instagramConnection).findFirst({
        where: { hotelClientId: hotel.id, tokenType: "igaa_direct" },
        select: { status: true, username: true, lastSyncedAt: true },
      }),
      agencyScoped(prisma.socialSnapshot).findMany({
        where: {
          hotelClientId: hotel.id,
          date: { gte: range.since, lte: range.until },
        },
        orderBy: { date: "asc" },
        select: { date: true, followers: true, reach: true, impressions: true, views: true, profileViews: true },
      }),
      agencyScoped(prisma.socialSnapshot).findFirst({
        where: { hotelClientId: hotel.id, date: { lt: range.since } },
        orderBy: { date: "desc" },
        select: { followers: true },
      }),
      agencyScoped(prisma.postSnapshot).findMany({
        where: {
          hotelClientId: hotel.id,
          postedAt: { gte: range.since, lte: range.until },
          ...(postType ? { mediaType: postType } : {}),
        },
        orderBy: { reach: "desc" },
        take: 10,
        select: {
          mediaId: true,
          caption: true,
          mediaType: true,
          permalink: true,
          postedAt: true,
          reach: true,
          likes: true,
          comments: true,
          engagement: true,
          saves: true,
        },
      }),
      agencyScoped(prisma.postSnapshot).aggregate({
        where: {
          hotelClientId: hotel.id,
          postedAt: { gte: range.since, lte: range.until },
        },
        _sum: { engagement: true, reach: true },
      }),
    ]);

  // ── Stories: last 30 days only (older stories disappear from the Graph API,
  //    but we still keep their snapshots — query window is a UX cap, not data
  //    retention). ────────────────────────────────────────────────────────
  const storyWindowStart = new Date(Date.now() - 30 * DAY_MS);
  const [recentStories, storyAgg] = await Promise.all([
    agencyScoped(prisma.storySnapshot).findMany({
      where: {
        hotelClientId: hotel.id,
        postedAt: { gte: storyWindowStart },
      },
      orderBy: { postedAt: "desc" },
      take: 20,
      select: {
        storyId: true,
        mediaType: true,
        postedAt: true,
        reach: true,
        impressions: true,
        tapsForward: true,
        tapsBack: true,
        exits: true,
        replies: true,
      },
    }),
    agencyScoped(prisma.storySnapshot).aggregate({
      where: {
        hotelClientId: hotel.id,
        postedAt: { gte: range.since, lte: range.until },
      },
      _sum: { impressions: true, exits: true },
    }),
  ]);
  const storyImpressionsRange = storyAgg._sum.impressions ?? 0;
  const storyExitsRange = storyAgg._sum.exits ?? 0;
  const storyCompletionRate =
    storyImpressionsRange > 0
      ? (storyImpressionsRange - storyExitsRange) / storyImpressionsRange
      : null;

  // ── Google Analytics — total website performance + source breakdown ──
  const [gaConnection, gaSnaps, gaSources, hotelTrackVisitsAgg] = await Promise.all([
    agencyScoped(prisma.googleAnalyticsConnection).findFirst({
      where: { hotelClientId: hotel.id },
      select: { status: true, propertyId: true, lastSyncedAt: true },
    }),
    agencyScoped(prisma.gaSnapshot).findMany({
      where: {
        hotelClientId: hotel.id,
        date: { gte: range.since, lte: range.until },
      },
      orderBy: { date: "asc" },
    }),
    agencyScoped(prisma.gaSourceBreakdown).groupBy({
      by: ["source"],
      where: {
        hotelClientId: hotel.id,
        date: { gte: range.since, lte: range.until },
      },
      _sum: { sessions: true, conversions: true },
    }),
    // HotelTrack snippet "visit" events with a UTM tag in the same range —
    // this is the agency-attributable share for the comparison block.
    pixelMode
      ? Promise.resolve(0)
      : agencyScoped(prisma.trackingEvent).findMany({
          where: {
            hotelClientId: hotel.id,
            eventType: "visit",
            createdAt: { gte: range.since, lte: range.until },
            OR: [
              { utmContent: { not: null } },
              { utmCampaign: { not: null } },
            ],
          },
          select: { sessionId: true },
          distinct: ["sessionId"],
        }).then((rows) => rows.length),
  ]);

  const gaConnected = gaConnection?.status === "connected";
  type GaTotals = {
    totalUsers: number;
    newUsers: number;
    sessions: number;
    pageviews: number;
    conversions: number;
    bounceSum: number;
    durationSum: number;
  };
  const gaTotals = gaSnaps.reduce<GaTotals>(
    (acc, s) => ({
      totalUsers: acc.totalUsers + s.totalUsers,
      newUsers: acc.newUsers + s.newUsers,
      sessions: acc.sessions + s.sessions,
      pageviews: acc.pageviews + s.pageviews,
      conversions: acc.conversions + s.conversions,
      bounceSum: acc.bounceSum + s.bounceRate * s.sessions,
      durationSum: acc.durationSum + s.avgSessionDuration * s.sessions,
    }),
    { totalUsers: 0, newUsers: 0, sessions: 0, pageviews: 0, conversions: 0, bounceSum: 0, durationSum: 0 },
  );
  const gaBounceRate = gaTotals.sessions > 0 ? gaTotals.bounceSum / gaTotals.sessions : 0;
  const gaAvgSessionDuration =
    gaTotals.sessions > 0 ? gaTotals.durationSum / gaTotals.sessions : 0;
  const gaSourceSlices: SourceSlice[] = gaSources.map((r: { source: string; _sum: { sessions: number | null } }) => ({
    source: r.source,
    sessions: r._sum.sessions ?? 0,
  }));
  const hotelTrackTaggedVisits =
    typeof hotelTrackVisitsAgg === "number" ? hotelTrackVisitsAgg : 0;
  const contentSharePct =
    gaTotals.sessions > 0 ? hotelTrackTaggedVisits / gaTotals.sessions : null;
  const gaLastUpdated = gaConnection?.lastSyncedAt ?? null;
  const hasGaData = gaSnaps.length > 0 || gaSources.length > 0;

  const hasSocialData =
    socialSnaps.length > 0 || topPosts.length > 0 || recentStories.length > 0;
  const followerSeries = socialSnaps.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    followers: s.followers,
  }));
  const currentFollowers = socialSnaps.length
    ? socialSnaps[socialSnaps.length - 1].followers
    : (priorFollowerSnap?.followers ?? 0);
  const priorFollowers =
    priorFollowerSnap?.followers ?? (socialSnaps.length ? socialSnaps[0].followers : 0);
  const followerGrowth = currentFollowers - priorFollowers;
  const followerGrowthPct = priorFollowers > 0 ? followerGrowth / priorFollowers : null;
  const socialReach = socialSnaps.reduce((sum, s) => sum + s.reach, 0);
  // "views" is the v22+ successor to account impressions; fall back to legacy
  // impressions for historical rows synced before the metric switch.
  const socialViews = socialSnaps.reduce((sum, s) => sum + (s.views || s.impressions), 0);
  const socialProfileViews = socialSnaps.reduce((sum, s) => sum + s.profileViews, 0);
  const postReachSum = postAgg._sum.reach ?? 0;
  const engagementRate = postReachSum > 0 ? (postAgg._sum.engagement ?? 0) / postReachSum : null;
  const socialLastUpdated = socialAccount?.lastSyncedAt ?? null;

  // ── Normalise Prisma Decimals -> plain numbers for the pure helpers ──
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

  // ── Compute ──
  const ads = computeAdsSummary(snapshotInputs);
  const kpis = computeKpis(eventInputs, ads.spend);
  const contentPerf = computeContentPerformance(contentInputs, eventInputs);
  const influencerRows = computeInfluencerImpact(contentInputs, redemptionInputs);

  const paidCampaigns = contentPerf.filter((c) => c.contentType === "paid_ad");
  const realAdRevenue = paidCampaigns.reduce((sum, c) => sum + c.revenue, 0);
  const realRoi = trueRoi(realAdRevenue, ads.spend);

  // ── Campaign performance: aggregate the per-day rows over the range ──
  const campaignAgg = new Map<string, CampaignRow>();
  for (const r of campaignPerfRows) {
    const row =
      campaignAgg.get(r.campaignKey) ??
      ({
        campaignKey: r.campaignKey,
        campaignName: r.campaignName,
        unattributed: r.campaignKey === UNATTRIBUTED_KEY,
        spend: 0,
        realBookings: 0,
        realRevenue: 0,
        realRoas: null,
        metaConversions: 0,
      } satisfies CampaignRow);
    row.spend += Number(r.metaSpend);
    row.metaConversions += r.metaReportedConversions;
    row.realBookings += r.realBookings;
    row.realRevenue += Number(r.realBookingValue);
    campaignAgg.set(r.campaignKey, row);
  }
  const campaignRows = [...campaignAgg.values()].map((r) => ({
    ...r,
    realRoas: r.spend > 0 ? r.realRevenue / r.spend : null,
  }));
  const matchedCampaignRows = campaignRows.filter((r) => !r.unattributed);
  const campaignTotalSpend = matchedCampaignRows.reduce((s, r) => s + r.spend, 0);
  const campaignRealRevenue = matchedCampaignRows.reduce((s, r) => s + r.realRevenue, 0);
  const campaignRealRoi = trueRoi(campaignRealRevenue, campaignTotalSpend);
  const matchedBookings = matchedCampaignRows.reduce((s, r) => s + r.realBookings, 0);
  const totalTrackedConversions = kpis.bookings;

  // ── Per-conversion journeys (the drill-down proof artifact) ──
  const journeyCampaignDays: CampaignDay[] = campaignSnapRows.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    campaignId: s.metaCampaignId,
    campaignName: s.campaignName,
    spend: Number(s.spend),
    conversions: s.conversions,
    purchaseValue: Number(s.purchaseValue),
  }));
  const attributedRecent = attributeConversions(
    recentConversionRows.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      utmCampaign: e.utmCampaign,
      utmContent: e.utmContent,
      pageUrl: e.pageUrl,
      conversionValue: e.conversionValue == null ? null : Number(e.conversionValue),
      createdAt: e.createdAt,
    })),
    journeyVisitRows,
    journeyCampaignDays,
  );
  const journeys: ConversionJourney[] = attributedRecent.map((a) => {
    const conv = a.conversion;
    const sessionVisits = journeyVisitRows.filter(
      (v) => v.sessionId === conv.sessionId && v.createdAt <= conv.createdAt,
    );
    const first = sessionVisits[0] ?? null;
    const between = first
      ? sessionVisits.slice(1).map((v) => v.pageUrl)
      : [];
    // Collapse consecutive repeats of the same page.
    const pagesVisited = between.filter((p, i) => i === 0 || p !== between[i - 1]).slice(0, 12);
    return {
      id: conv.id,
      convertedAt: conv.createdAt.toISOString(),
      conversionValue: conv.conversionValue,
      bookingPage: conv.pageUrl,
      firstTouch: first
        ? {
            campaign: first.utmCampaign,
            adTag: first.utmContent,
            source: first.utmSource,
            date: first.createdAt.toISOString(),
            landingPage: first.pageUrl,
          }
        : null,
      pagesVisited,
      daysToConvert: first
        ? Math.floor((conv.createdAt.getTime() - first.createdAt.getTime()) / DAY_MS)
        : null,
      attributedTo: a.campaignName,
      attributionReason: a.reason,
    };
  });

  // Serializable snapshot passed to the client report generator.
  const reportData: ReportData = {
    hotelName: hotel.name,
    websiteUrl: hotel.websiteUrl,
    agencyName: member.agency.name,
    rangeLabel: range.label,
    from: range.fromInput,
    to: range.toInput,
    generatedAt: new Date().toLocaleDateString(),
    kpis: {
      visits: kpis.visits,
      bookings: kpis.bookings,
      revenue: kpis.revenue,
      spend: kpis.spend,
      costPerBooking: kpis.costPerBooking,
      roas: kpis.roas,
    },
    topContent: [...contentPerf]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((c) => ({
        title: c.title,
        contentType: c.contentType,
        clicks: c.clicks,
        sessions: c.sessions,
        bookings: c.bookings,
        revenue: c.revenue,
        conversionRate: c.conversionRate,
      })),
    ads: {
      spend: ads.spend,
      bookingsFromAds: ads.bookingsFromAds,
      metaRoas: ads.metaRoas,
      trueRoi: realRoi,
      campaigns: paidCampaigns.map((c) => ({
        title: c.title,
        sessions: c.sessions,
        bookings: c.bookings,
        revenue: c.revenue,
      })),
    },
    campaignPerformance: [...campaignRows]
      .sort((a, b) => {
        if (a.unattributed !== b.unattributed) return a.unattributed ? 1 : -1;
        return (b.realRoas ?? -1) - (a.realRoas ?? -1);
      })
      .map((r) => ({
        campaignName: r.campaignName,
        unattributed: r.unattributed,
        spend: r.spend,
        realBookings: r.realBookings,
        realRevenue: r.realRevenue,
        realRoas: r.realRoas,
        metaConversions: r.metaConversions,
      })),
    influencers: influencerRows.map((r) => ({
      influencerName: r.influencerName,
      couponCode: r.couponCode,
      redemptions: r.redemptions,
      revenue: r.revenue,
    })),
    social: {
      handle: socialAccount?.username ?? null,
      followers: currentFollowers,
      followerGrowth,
      engagementRate,
      storyCompletionRate,
      topPosts: topPosts.map((p) => ({
        caption: p.caption,
        mediaType: p.mediaType,
        postedAt: p.postedAt ? p.postedAt.toLocaleDateString() : null,
        reach: p.reach,
        likes: p.likes,
        comments: p.comments,
        engagement: p.engagement,
        saves: p.saves,
      })),
      stories: recentStories.map((s) => ({
        postedAt: s.postedAt ? s.postedAt.toLocaleString() : null,
        mediaType: s.mediaType,
        reach: s.reach,
        impressions: s.impressions,
        tapsForward: s.tapsForward,
        exits: s.exits,
        replies: s.replies,
      })),
    },
    ga: {
      connected: gaConnected,
      propertyId: gaConnection?.propertyId ?? null,
      totalUsers: gaTotals.totalUsers,
      newUsers: gaTotals.newUsers,
      sessions: gaTotals.sessions,
      bounceRate: gaBounceRate,
      avgSessionDuration: gaAvgSessionDuration,
      conversions: gaTotals.conversions,
      contentSessions: hotelTrackTaggedVisits,
      contentSharePct,
      sources: gaSourceSlices
        .filter((s) => s.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions)
        .map((s) => ({
          source: s.source,
          sessions: s.sessions,
          pct: gaTotals.sessions > 0 ? s.sessions / gaTotals.sessions : 0,
        })),
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/agency/hotels"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Hotel Clients
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{hotel.name}</h1>
            <p className="text-zinc-500">{hotel.websiteUrl}</p>
          </div>
          <div className="flex items-center gap-4">
            {missingDays > 0 && (
              <Link
                href={`/agency/hotel/${hotel.id}/integrations`}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {missingDays} day{missingDays === 1 ? "" : "s"} of data missing — reconnect Meta to backfill
              </Link>
            )}
            <Link
              href={`/agency/hotel/${hotel.id}/integrations`}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Manage Integrations
            </Link>
            <ReportMenu
              hotelId={hotel.id}
              from={range.fromInput}
              to={range.toInput}
              data={reportData}
            />
          </div>
        </div>
      </div>

      {/* Integration health banner — only when something is broken or expired */}
      {integrationStatus.anyBrokenOrExpired && (
        <Link
          href={`/agency/hotel/${hotel.id}/integrations`}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
        >
          <span>
            <strong>An integration needs attention.</strong> A connection for this
            hotel is broken or expired — data may be missing from this dashboard.
          </span>
          <span className="shrink-0 font-medium underline">Fix it →</span>
        </Link>
      )}

      {/* Date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeSelector
          current={range.key}
          fromInput={range.fromInput}
          toInput={range.toInput}
        />
        <span className="text-sm text-zinc-500">{range.label}</span>
      </div>

      {/* Section 1 — KPI cards (attribution-dependent; hidden in pixel mode) */}
      {!pixelMode && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Visits" value={formatNumber(kpis.visits)} />
          <KpiCard label="Bookings" value={formatNumber(kpis.bookings)} />
          <KpiCard label="Revenue attributed" value={formatCurrency(kpis.revenue)} />
          <KpiCard
            label="Cost / booking"
            value={
              kpis.costPerBooking == null
                ? "—"
                : formatCurrencyCents(kpis.costPerBooking)
            }
            hint="Ad spend ÷ bookings"
          />
          <KpiCard
            label="Overall ROAS"
            value={formatMultiple(kpis.roas)}
            hint="Revenue ÷ ad spend"
          />
        </div>
      )}

      {/* Section 2 — Content performance (attribution-dependent; hidden in pixel mode) */}
      {!pixelMode && (
        <SectionCard
          title="Content performance"
          subtitle="Every content piece for this hotel, attributed via its utm_content tag. Click a column to sort."
        >
          <ContentPerformanceTable rows={contentPerf} />
        </SectionCard>
      )}

      {/* Section 2.5 — Campaign performance: Meta's claims vs reality */}
      {!pixelMode && (
        <SectionCard
          title="Campaign performance"
          subtitle="Each Meta campaign's spend joined to the bookings our snippet actually tracked on the hotel's website — what Meta claims vs what really happened."
        >
          {matchedBookings === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">
                Campaign performance will appear once we&apos;ve collected at least 5
                conversions across your ads.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Currently tracking: {formatNumber(totalTrackedConversions)} conversion
                {totalTrackedConversions === 1 ? "" : "s"}.
                {totalTrackedConversions < 5 &&
                  ` Need: ${5 - totalTrackedConversions} more.`}
                {totalTrackedConversions >= 5 &&
                  " None carried a utm_campaign matching a Meta campaign yet — check that your ad URLs include utm_campaign tags."}
              </p>
            </div>
          ) : (
            <>
              <CampaignPerformanceTable rows={campaignRows} />
              <div className="grid grid-cols-1 gap-px border-t border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
                <div className="bg-white p-4 dark:bg-zinc-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Total ad spend (selected period)
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatCurrency(campaignTotalSpend)}
                  </p>
                </div>
                <div className="bg-white p-4 dark:bg-zinc-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Real revenue from ads
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatCurrency(campaignRealRevenue)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">Snippet-tracked bookings</p>
                </div>
                <div className="bg-white p-4 dark:bg-zinc-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Real ROI
                  </p>
                  <p
                    className={`mt-1 text-xl font-semibold tabular-nums ${
                      campaignRealRoi == null
                        ? ""
                        : campaignRealRoi >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {campaignRealRoi == null ? "—" : formatPercent(campaignRealRoi)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    (Revenue − spend) ÷ spend
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <p className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Recent tracked bookings
            </p>
            <ConversionJourneys journeys={journeys} />
          </div>
        </SectionCard>
      )}

      {/* Section 3 — Paid ads */}
      <SectionCard
        title="Paid ads performance"
        subtitle={
          hotel.metaAdAccountId
            ? `Meta ad account ${hotel.metaAdAccountId}`
            : "No Meta ad account mapped — map one in Settings to sync ad data."
        }
      >
        <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
          <div className="bg-white p-4 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Meta ad spend
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatCurrency(ads.spend)}
            </p>
          </div>
          <div className="bg-white p-4 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Bookings from ads
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatNumber(ads.bookingsFromAds)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">Meta-reported</p>
          </div>
          <div className="bg-white p-4 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Meta ROAS
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatMultiple(ads.metaRoas)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">Platform-reported</p>
          </div>
          {!pixelMode && (
            <div className="bg-white p-4 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                True ROI
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {realRoi == null ? "—" : formatPercent(realRoi)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">Real bookings ÷ spend</p>
            </div>
          )}
        </div>

        <div className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Spend over time
          </p>
          <SpendChart data={ads.spendOverTime} />
        </div>

        {!pixelMode && (
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <p className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Campaign breakdown
            </p>
            {paidCampaigns.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">
                No paid-ad content for this hotel yet.
              </p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 text-right font-medium">Sessions</th>
                    <th className="px-4 py-2 text-right font-medium">Bookings</th>
                    <th className="px-4 py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {paidCampaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-4 py-2 font-medium">{c.title}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNumber(c.sessions)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNumber(c.bookings)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(c.revenue)}
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Section 4 — Influencer impact */}
      <SectionCard
        title="Influencer impact"
        subtitle="Coupon redemptions and revenue per influencer collaboration."
      >
        {influencerRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            No influencer content for this hotel yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 font-medium">Influencer</th>
                  <th className="px-4 py-3 font-medium">Coupon</th>
                  <th className="px-4 py-3 text-right font-medium">Redemptions</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Cost / booking</th>
                </tr>
              </thead>
              <tbody>
                {influencerRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.influencerName}</div>
                      <div className="text-xs text-zinc-500">{r.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.couponCode ? (
                        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                          {r.couponCode}
                        </code>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(r.redemptions)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(r.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {r.costPerBooking == null
                        ? "—"
                        : formatCurrencyCents(r.costPerBooking)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-zinc-500">
              Cost / booking shows once influencer fees are tracked per
              collaboration.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Section 5 — Social media performance (organic Instagram) */}
      <SectionCard
        title="Social media performance"
        subtitle={
          socialAccount?.username ? `Organic Instagram · @${socialAccount.username}` : "Organic Instagram"
        }
      >
        {!hasSocialData ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">No organic social data yet.</p>
            <Link
              href={`/agency/hotel/${hotel.id}/integrations`}
              className="mt-2 inline-block text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
            >
              Connect this hotel&apos;s Instagram in Setup →
            </Link>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <p className="text-xs text-zinc-500">
              {socialLastUpdated
                ? `Last updated ${new Date(socialLastUpdated).toLocaleString()} · `
                : ""}
              Refreshes on a schedule, not in real time.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Followers"
                value={formatNumber(currentFollowers)}
                hint={`${followerGrowth >= 0 ? "+" : "−"}${formatNumber(
                  Math.abs(followerGrowth),
                )} vs prior${
                  followerGrowthPct != null ? ` · ${formatPercent(Math.abs(followerGrowthPct))}` : ""
                }`}
              />
              <KpiCard label="Reach" value={formatNumber(socialReach)} hint="Unique accounts" />
              <KpiCard label="Views" value={formatNumber(socialViews)} hint="Content plays & displays" />
              <KpiCard label="Profile views" value={formatNumber(socialProfileViews)} />
              <KpiCard
                label="Engagement rate"
                value={engagementRate == null ? "—" : formatPercent(engagementRate)}
                hint="Engagement ÷ reach"
              />
              <KpiCard
                label="Story completion"
                value={storyCompletionRate == null ? "—" : formatPercent(storyCompletionRate)}
                hint="(impressions − exits) ÷ impressions"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Follower growth
              </p>
              <FollowerChart data={followerSeries} />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Top posts by reach
                </p>
                <PostTypeFilter current={postType ?? "all"} />
              </div>
              {topPosts.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No {postType ? `${postType} ` : ""}posts published in this range.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                      <tr>
                        <th className="px-4 py-2 font-medium">Post</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 text-right font-medium">Reach</th>
                        <th className="px-4 py-2 text-right font-medium">Likes</th>
                        <th className="px-4 py-2 text-right font-medium">Comments</th>
                        <th className="px-4 py-2 text-right font-medium">Engagement</th>
                        <th className="px-4 py-2 text-right font-medium">Saves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPosts.map((p) => (
                        <tr key={p.mediaId} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-4 py-2">
                            {p.permalink ? (
                              <a
                                href={p.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:underline"
                              >
                                {p.caption ? p.caption.slice(0, 60) : p.mediaType ?? "Post"}
                              </a>
                            ) : (
                              <span className="font-medium">
                                {p.caption ? p.caption.slice(0, 60) : p.mediaType ?? "Post"}
                              </span>
                            )}
                            {p.postedAt && (
                              <span className="block text-xs text-zinc-500">
                                {new Date(p.postedAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs capitalize text-zinc-500">
                            {p.mediaType ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.reach)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.likes)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNumber(p.comments)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNumber(p.engagement)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.saves)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Stories performance · last 30 days
              </p>
              {recentStories.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No stories captured in the last 30 days. Stories expire 24h
                  after posting — the cron at <code>/api/social/sync-stories</code>{" "}
                  runs every 2 hours to catch them.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                      <tr>
                        <th className="px-4 py-2 font-medium">Story</th>
                        <th className="px-4 py-2 text-right font-medium">Reach</th>
                        <th className="px-4 py-2 text-right font-medium">Impressions</th>
                        <th className="px-4 py-2 text-right font-medium">Taps fwd</th>
                        <th className="px-4 py-2 text-right font-medium">Exits</th>
                        <th className="px-4 py-2 text-right font-medium">Replies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentStories.map((s) => (
                        <tr key={s.storyId} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-4 py-2">
                            <span className="text-xs capitalize text-zinc-500">
                              {s.mediaType ?? "story"}
                            </span>
                            {s.postedAt && (
                              <span className="block text-xs text-zinc-500">
                                {new Date(s.postedAt).toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(s.reach)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNumber(s.impressions)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNumber(s.tapsForward)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(s.exits)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatNumber(s.replies)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Section 6 — Total Website Performance (Google Analytics 4) */}
      <SectionCard
        title="Total website performance (from Google Analytics)"
        subtitle={
          gaConnection?.propertyId
            ? `GA4 property ${gaConnection.propertyId}`
            : "Pulls every visit, not just the UTM-tagged ones — connect GA in Setup."
        }
      >
        {!gaConnected ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">
              No Google Analytics data yet.
            </p>
            <Link
              href={`/agency/hotel/${hotel.id}/integrations`}
              className="mt-2 inline-block text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
            >
              Connect this hotel&apos;s GA4 in Setup →
            </Link>
          </div>
        ) : !hasGaData ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">
              GA connected — run a sync from Setup to pull metrics for this date
              range.
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <p className="text-xs text-zinc-500">
              {gaLastUpdated
                ? `Last updated ${new Date(gaLastUpdated).toLocaleString()} · `
                : ""}
              Refreshes daily via /api/ga/sync.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Total users" value={formatNumber(gaTotals.totalUsers)} />
              <KpiCard label="Sessions" value={formatNumber(gaTotals.sessions)} />
              <KpiCard label="New users" value={formatNumber(gaTotals.newUsers)} />
              <KpiCard
                label="Bounce rate"
                value={formatPercent(gaBounceRate)}
                hint="Weighted by sessions"
              />
              <KpiCard
                label="Avg session"
                value={`${Math.round(gaAvgSessionDuration)}s`}
                hint="Duration"
              />
              <KpiCard
                label="Conversions"
                value={formatNumber(gaTotals.conversions)}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Traffic by source
              </p>
              <SourcePieChart data={gaSourceSlices} />
            </div>

            {!pixelMode && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-200">
                <p className="font-medium">
                  Of {formatNumber(gaTotals.sessions)} total website visits,{" "}
                  {formatNumber(hotelTrackTaggedVisits)} came from our content
                  {contentSharePct != null && (
                    <> ({formatPercent(contentSharePct)})</>
                  )}
                  .
                </p>
                <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                  Comparing HotelTrack&apos;s UTM-tagged snippet visits against
                  GA&apos;s total sessions for this date range.
                </p>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Shareable read-only link for the hotel owner */}
      <SectionCard
        title="Share with the hotel"
        subtitle="A private, read-only link the hotel owner can open on their phone — no login required."
      >
        <ShareLinkManager
          hotelId={hotel.id}
          shareBaseUrl={shareBaseUrl}
          link={activeLink}
        />
      </SectionCard>
    </div>
  );
}
