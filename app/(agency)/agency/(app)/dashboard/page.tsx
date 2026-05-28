import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { RevenueByHotelChart } from "@/components/dashboard/RevenueByHotelChart";
import { TrafficSourceChart } from "@/components/dashboard/TrafficSourceChart";
import { isPixelMode } from "@/lib/tracking-mode";
import {
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";

const THIRTY_DAYS_MS = 30 * 86_400_000;

function formatLastSync(d: Date | null): string {
  if (!d) return "Never synced";
  return `Synced ${new Date(d).toLocaleDateString()}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

const KPI_ACCENT = {
  zinc: { bar: "bg-zinc-400", text: "text-zinc-500" },
  blue: { bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  amber: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  violet: { bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
} as const;
type Accent = keyof typeof KPI_ACCENT;

function KpiCard({
  label,
  value,
  delta,
  accent = "zinc",
}: {
  label: string;
  value: string;
  // Percentage change vs prior period (null = no prior data, undefined = don't render)
  delta?: number | null;
  accent?: Accent;
}) {
  const a = KPI_ACCENT[accent];
  const renderDelta =
    delta != null && Number.isFinite(delta) ? (
      <p
        className={`mt-1 text-xs font-medium tabular-nums ${
          delta >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {delta >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(delta))} vs prior 30d
      </p>
    ) : delta === null ? (
      <p className="mt-1 text-xs text-zinc-400">No prior period</p>
    ) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <span className={`absolute inset-y-0 left-0 w-1 ${a.bar}`} aria-hidden />
      <p className={`text-xs font-medium uppercase tracking-wide ${a.text}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {renderDelta}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 ${className ?? ""}`}
    >
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-medium">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// Percent change. Null if there's no prior baseline (can't compute %).
function pctChange(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? null : 0;
  return (current - prior) / prior;
}

export default async function AgencyDashboardPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const pixelMode = isPixelMode();
  const now = new Date();
  const since = new Date(now.getTime() - THIRTY_DAYS_MS);
  const priorSince = new Date(now.getTime() - 2 * THIRTY_DAYS_MS);

  // Multi-tenant: everything scoped to this agency. In pixel mode we skip the
  // tracking-event queries entirely — those rows don't exist when the agency
  // uses FB Pixel instead of the HotelTrack snippet.
  const [hotels, events, priorEvents, spendAgg, priorSpendAgg, hotelNameRows] = await Promise.all([
    prisma.hotelClient.findMany({
      where: { agencyId: member.agencyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        snippetStatus: true,
        lastSyncedAt: true,
      },
    }),
    pixelMode
      ? Promise.resolve([] as Array<{
          createdAt: Date;
          eventType: string;
          utmSource: string | null;
          conversionValue: import("@prisma/client").Prisma.Decimal | null;
          hotelClientId: string;
        }>)
      : prisma.trackingEvent.findMany({
          where: { agencyId: member.agencyId, createdAt: { gte: since } },
          select: {
            createdAt: true,
            eventType: true,
            utmSource: true,
            conversionValue: true,
            hotelClientId: true,
          },
        }),
    pixelMode
      ? Promise.resolve([] as Array<{
          eventType: string;
          _count: { _all: number };
          _sum: { conversionValue: import("@prisma/client").Prisma.Decimal | null };
        }>)
      : prisma.trackingEvent.groupBy({
          by: ["eventType"],
          where: {
            agencyId: member.agencyId,
            createdAt: { gte: priorSince, lt: since },
          },
          _count: { _all: true },
          _sum: { conversionValue: true },
        }),
    prisma.adSnapshot.aggregate({
      where: { agencyId: member.agencyId, date: { gte: since } },
      _sum: { spend: true },
    }),
    prisma.adSnapshot.aggregate({
      where: { agencyId: member.agencyId, date: { gte: priorSince, lt: since } },
      _sum: { spend: true },
    }),
    prisma.hotelClient.findMany({
      where: { agencyId: member.agencyId },
      select: { id: true, name: true },
    }),
  ]);

  // ── Aggregate the event stream in JS (one pass) ──
  type Metric = { visits: number; bookings: number; revenue: number };
  const blank = (): Metric => ({ visits: 0, bookings: 0, revenue: 0 });

  const perHotel = new Map<string, Metric>();
  const perSource = new Map<string, number>(); // visits by source
  const perDay = new Map<string, { revenue: number; bookings: number }>();

  for (const e of events) {
    const m = perHotel.get(e.hotelClientId) ?? blank();
    const day = ymd(e.createdAt);
    const dayRow = perDay.get(day) ?? { revenue: 0, bookings: 0 };
    if (e.eventType === "visit") {
      m.visits += 1;
      const src = e.utmSource ?? "direct";
      perSource.set(src, (perSource.get(src) ?? 0) + 1);
    } else {
      m.bookings += 1;
      const v = e.conversionValue == null ? 0 : Number(e.conversionValue);
      m.revenue += v;
      dayRow.bookings += 1;
      dayRow.revenue += v;
    }
    perHotel.set(e.hotelClientId, m);
    perDay.set(day, dayRow);
  }

  const totals = [...perHotel.values()].reduce(
    (acc, m) => ({
      visits: acc.visits + m.visits,
      bookings: acc.bookings + m.bookings,
      revenue: acc.revenue + m.revenue,
    }),
    blank(),
  );
  const totalSpend = Number(spendAgg._sum.spend ?? 0);
  const priorTotalSpend = Number(priorSpendAgg._sum.spend ?? 0);
  const roas = totalSpend > 0 ? totals.revenue / totalSpend : null;
  const deltaSpend = pctChange(totalSpend, priorTotalSpend);

  // ── Prior period (for KPI deltas) ──
  const prior = blank();
  for (const g of priorEvents) {
    if (g.eventType === "visit") prior.visits = g._count._all;
    else {
      prior.bookings = g._count._all;
      prior.revenue = Number(g._sum.conversionValue ?? 0);
    }
  }
  const priorSpend = Number(priorSpendAgg._sum.spend ?? 0);
  const priorRoas = priorSpend > 0 ? prior.revenue / priorSpend : null;

  const deltaVisits = pctChange(totals.visits, prior.visits);
  const deltaBookings = pctChange(totals.bookings, prior.bookings);
  const deltaRevenue = pctChange(totals.revenue, prior.revenue);
  const deltaRoas =
    roas == null || priorRoas == null ? undefined : pctChange(roas, priorRoas);

  // ── Build zero-filled daily series for the trend chart ──
  const dailySeries: { date: string; revenue: number; bookings: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = ymd(d);
    const row = perDay.get(key) ?? { revenue: 0, bookings: 0 };
    dailySeries.push({
      date: key,
      revenue: Number(row.revenue.toFixed(2)),
      bookings: row.bookings,
    });
  }

  // ── Revenue-by-hotel series ──
  const hotelNameById = new Map(hotelNameRows.map((h) => [h.id, h.name]));
  const hotelRevenue = [...perHotel.entries()]
    .map(([id, m]) => ({ hotel: hotelNameById.get(id) ?? "(unknown)", revenue: m.revenue }))
    .filter((r) => r.revenue > 0);

  // ── Traffic-source series (mapped to friendly labels) ──
  const sourceSeries = [...perSource.entries()].map(([src, visits]) => ({
    source: SOURCE_LABELS[src] ?? (src === "direct" ? "Direct" : src),
    visits,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {member.agency.name}
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            All hotel clients · last 30 days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu basePath="/api/agency/export" />
          <Link
            href="/agency/hotels/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Add Hotel Client
          </Link>
        </div>
      </div>

      {/* Summary KPIs across all hotels */}
      {pixelMode ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard label="Hotels" value={formatNumber(hotels.length)} accent="zinc" />
          <KpiCard
            label="Meta ad spend"
            value={formatCurrency(totalSpend)}
            delta={deltaSpend}
            accent="violet"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Hotels" value={formatNumber(hotels.length)} accent="zinc" />
          <KpiCard
            label="Visits"
            value={formatNumber(totals.visits)}
            delta={deltaVisits}
            accent="blue"
          />
          <KpiCard
            label="Bookings"
            value={formatNumber(totals.bookings)}
            delta={deltaBookings}
            accent="amber"
          />
          <KpiCard
            label="Revenue"
            value={formatCurrency(totals.revenue)}
            delta={deltaRevenue}
            accent="emerald"
          />
          <KpiCard
            label="ROAS"
            value={formatMultiple(roas)}
            delta={deltaRoas}
            accent="violet"
          />
        </div>
      )}

      {/* Charts — only meaningful when the HotelTrack snippet is feeding events */}
      {!pixelMode && (
        <>
          <ChartCard
            title="Revenue & bookings"
            subtitle="Daily attributed revenue (area) and bookings (line) across all hotels"
          >
            <RevenueTrendChart data={dailySeries} />
          </ChartCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              title="Revenue by hotel"
              subtitle="Top hotels by attributed revenue (last 30 days)"
            >
              <RevenueByHotelChart data={hotelRevenue} />
            </ChartCard>
            <ChartCard
              title="Traffic by source"
              subtitle="Visits attributed to each platform via utm_source"
            >
              <TrafficSourceChart data={sourceSeries} />
            </ChartCard>
          </div>
        </>
      )}

      {pixelMode && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Per-content / per-source attribution is disabled in Facebook Pixel mode.
          The Pixel reports website conversions to Meta, not HotelTrack — open
          Meta Ads Manager for content-level breakdowns, and the{" "}
          <span className="font-medium">Paid ads performance</span> section on
          each hotel for Meta-reported ROAS.
        </div>
      )}

      {/* Hotel client grid */}
      <div>
        <h2 className="mb-3 font-medium">Hotel clients</h2>
        {hotels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              No hotel clients yet.
            </p>
            <Link
              href="/agency/hotels/new"
              className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Add your first hotel client
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hotels.map((h) => {
              const m = perHotel.get(h.id) ?? blank();
              return (
                <Link
                  key={h.id}
                  href={`/agency/hotel/${h.id}`}
                  className="group rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium group-hover:underline">
                        {h.name}
                      </h3>
                      <p className="truncate text-xs text-zinc-500">
                        {h.websiteUrl}
                      </p>
                    </div>
                    <SnippetStatusBadge status={h.snippetStatus} />
                  </div>

                  {!pixelMode && (
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      <div>
                        <p className="text-xs text-zinc-500">Visits</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatNumber(m.visits)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Bookings</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatNumber(m.bookings)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Revenue</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatCurrency(m.revenue)}
                        </p>
                      </div>
                    </div>
                  )}

                  <p className={`text-xs text-zinc-400 ${pixelMode ? "mt-3" : "mt-3"}`}>
                    {formatLastSync(h.lastSyncedAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
