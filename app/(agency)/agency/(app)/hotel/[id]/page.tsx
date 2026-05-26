import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
import { ContentPerformanceTable } from "./ContentPerformanceTable";
import { SpendChart } from "./SpendChart";
import { ReportMenu } from "./ReportMenu";
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

  // Multi-tenant: scope by id AND agencyId so one agency can't open another's hotel.
  const hotel = await prisma.hotelClient.findFirst({
    where: { id, agencyId: member.agencyId },
    select: { id: true, name: true, websiteUrl: true, metaAdAccountId: true },
  });
  if (!hotel) notFound();

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const range = resolveRange({
    range: one(sp.range),
    from: one(sp.from),
    to: one(sp.to),
  });

  // All five queries scoped to this agency + hotel + range.
  const [content, events, snapshots] = await Promise.all([
    prisma.contentPiece.findMany({
      where: { agencyId: member.agencyId, hotelClientId: hotel.id },
      select: {
        id: true,
        title: true,
        contentType: true,
        platform: true,
        couponCode: true,
        influencerName: true,
      },
    }),
    prisma.trackingEvent.findMany({
      where: {
        agencyId: member.agencyId,
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
    prisma.adSnapshot.findMany({
      where: {
        agencyId: member.agencyId,
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
      ? await prisma.couponRedemption.findMany({
          where: {
            agencyId: member.agencyId,
            contentPieceId: { in: contentIds },
            redemptionDate: { gte: range.since, lte: range.until },
          },
          select: { contentPieceId: true, orderValue: true },
        })
      : [];

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
    influencers: influencerRows.map((r) => ({
      influencerName: r.influencerName,
      couponCode: r.couponCode,
      redemptions: r.redemptions,
      revenue: r.revenue,
    })),
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
            <Link
              href={`/agency/hotels/${hotel.id}/setup`}
              className="text-sm text-zinc-500 hover:underline"
            >
              Snippet setup →
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

      {/* Date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeSelector
          current={range.key}
          fromInput={range.fromInput}
          toInput={range.toInput}
        />
        <span className="text-sm text-zinc-500">{range.label}</span>
      </div>

      {/* Section 1 — KPI cards */}
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

      {/* Section 2 — Content performance */}
      <SectionCard
        title="Content performance"
        subtitle="Every content piece for this hotel, attributed via its utm_content tag. Click a column to sort."
      >
        <ContentPerformanceTable rows={contentPerf} />
      </SectionCard>

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
          <div className="bg-white p-4 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              True ROI
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {realRoi == null ? "—" : formatPercent(realRoi)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">Real bookings ÷ spend</p>
          </div>
        </div>

        <div className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Spend over time
          </p>
          <SpendChart data={ads.spendOverTime} />
        </div>

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
    </div>
  );
}
