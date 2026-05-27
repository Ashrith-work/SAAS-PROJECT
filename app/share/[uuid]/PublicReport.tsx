import { ContentPerformanceTable } from "@/components/report/ContentPerformanceTable";
import { SpendChart } from "@/components/report/SpendChart";
import {
  formatCurrency,
  formatCurrencyCents,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { HotelReport } from "@/lib/report-data";

const RANGES = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
] as const;

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
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

export function PublicReport({
  token,
  hotelName,
  websiteUrl,
  agencyName,
  rangeKey,
  rangeLabel,
  report,
}: {
  token: string;
  hotelName: string;
  websiteUrl: string;
  agencyName: string;
  rangeKey: string;
  rangeLabel: string;
  report: HotelReport;
}) {
  const { kpis, contentPerf, ads, influencerRows, realRoi } = report;
  const paidCampaigns = contentPerf.filter((c) => c.contentType === "paid_ad");

  return (
    <div className="min-h-full bg-white dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            HotelTrack
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{hotelName}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Report shared by {agencyName} · {websiteUrl}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {/* Range selector (read-only navigation) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {RANGES.map((r) => {
              const active = r.key === rangeKey;
              return (
                <a
                  key={r.key}
                  href={`/share/${token}?range=${r.key}`}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    active
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  Last {r.label}
                </a>
              );
            })}
          </div>
          <span className="hidden text-sm text-zinc-500 sm:inline">{rangeLabel}</span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Visits" value={formatNumber(kpis.visits)} />
          <KpiCard label="Bookings" value={formatNumber(kpis.bookings)} />
          <KpiCard label="Revenue attributed" value={formatCurrency(kpis.revenue)} />
          <KpiCard
            label="Cost / booking"
            value={kpis.costPerBooking == null ? "—" : formatCurrencyCents(kpis.costPerBooking)}
            hint="Ad spend ÷ bookings"
          />
          <KpiCard label="Overall ROAS" value={formatMultiple(kpis.roas)} hint="Revenue ÷ ad spend" />
        </div>

        {/* Content performance */}
        <SectionCard
          title="Content performance"
          subtitle="Every content piece, attributed to the bookings it drove."
        >
          <ContentPerformanceTable rows={contentPerf} />
        </SectionCard>

        {/* Paid ads */}
        <SectionCard title="Paid ads performance">
          <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
            <div className="bg-white p-4 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ad spend</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(ads.spend)}</p>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Bookings from ads
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatNumber(ads.bookingsFromAds)}
              </p>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Meta ROAS</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatMultiple(ads.metaRoas)}</p>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">True ROI</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {realRoi == null ? "—" : formatPercent(realRoi)}
              </p>
            </div>
          </div>
          <div className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Spend over time
            </p>
            <SpendChart data={ads.spendOverTime} />
          </div>
          {paidCampaigns.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800">
              <p className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Campaign breakdown
              </p>
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
                      <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
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
            </div>
          )}
        </SectionCard>

        {/* Influencer impact */}
        {influencerRows.length > 0 && (
          <SectionCard
            title="Influencer impact"
            subtitle="Coupon redemptions and revenue per influencer collaboration."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3 font-medium">Influencer</th>
                    <th className="px-4 py-3 font-medium">Coupon</th>
                    <th className="px-4 py-3 text-right font-medium">Redemptions</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {influencerRows.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        <p className="pt-2 text-center text-xs text-zinc-400">
          Powered by HotelTrack · This is a private, read-only report.
        </p>
      </main>
    </div>
  );
}
