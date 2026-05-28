import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";
import { ExportMenu } from "@/components/ui/ExportMenu";
import {
  formatCurrency,
  formatMultiple,
  formatNumber,
} from "@/lib/format";

const THIRTY_DAYS_MS = 30 * 86_400_000;

function formatLastSync(d: Date | null): string {
  if (!d) return "Never synced";
  return `Synced ${new Date(d).toLocaleDateString()}`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AgencyDashboardPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  // Multi-tenant: everything scoped to this agency.
  const [hotels, grouped, spendAgg] = await Promise.all([
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
    prisma.trackingEvent.groupBy({
      by: ["hotelClientId", "eventType"],
      where: { agencyId: member.agencyId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { conversionValue: true },
    }),
    prisma.adSnapshot.aggregate({
      where: { agencyId: member.agencyId, date: { gte: since } },
      _sum: { spend: true },
    }),
  ]);

  // Per-hotel visits / bookings / revenue (last 30 days).
  type Metric = { visits: number; bookings: number; revenue: number };
  const metrics = new Map<string, Metric>();
  for (const g of grouped) {
    const m = metrics.get(g.hotelClientId) ?? {
      visits: 0,
      bookings: 0,
      revenue: 0,
    };
    if (g.eventType === "visit") {
      m.visits = g._count._all;
    } else {
      m.bookings = g._count._all;
      m.revenue = Number(g._sum.conversionValue ?? 0);
    }
    metrics.set(g.hotelClientId, m);
  }

  const totals = [...metrics.values()].reduce(
    (acc, m) => ({
      visits: acc.visits + m.visits,
      bookings: acc.bookings + m.bookings,
      revenue: acc.revenue + m.revenue,
    }),
    { visits: 0, bookings: 0, revenue: 0 },
  );
  const totalSpend = Number(spendAgg._sum.spend ?? 0);
  const roas = totalSpend > 0 ? totals.revenue / totalSpend : null;

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Hotels" value={formatNumber(hotels.length)} />
        <SummaryCard label="Visits" value={formatNumber(totals.visits)} />
        <SummaryCard label="Bookings" value={formatNumber(totals.bookings)} />
        <SummaryCard label="Revenue" value={formatCurrency(totals.revenue)} />
        <SummaryCard label="ROAS" value={formatMultiple(roas)} />
      </div>

      {/* Hotel client grid */}
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
            const m = metrics.get(h.id) ?? {
              visits: 0,
              bookings: 0,
              revenue: 0,
            };
            return (
              <Link
                key={h.id}
                href={`/agency/hotel/${h.id}`}
                className="group rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium group-hover:underline">
                      {h.name}
                    </h2>
                    <p className="truncate text-xs text-zinc-500">
                      {h.websiteUrl}
                    </p>
                  </div>
                  <SnippetStatusBadge status={h.snippetStatus} />
                </div>

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

                <p className="mt-3 text-xs text-zinc-400">
                  {formatLastSync(h.lastSyncedAt)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
