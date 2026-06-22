import { formatNumber, formatCurrency, formatPercent } from "@/lib/format";
import type { Ga4Dashboard } from "@/lib/ga4-dashboard";

// "Website Traffic" dashboard section, rendered from GA4 (OAuth) snapshots. Pure
// presentation — the page passes the aggregated Ga4Dashboard (or the empty state
// when GA4 isn't connected).

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Kpi({ label, value, valueClass, hint }: { label: string; value: string; valueClass?: string; hint?: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass ?? "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-tertiary">{hint}</p>}
    </div>
  );
}

const CHANNELS: { key: keyof Ga4Dashboard["channels"]; label: string; color: string }[] = [
  { key: "organic", label: "Organic Search", color: "bg-success" },
  { key: "paid", label: "Paid Search", color: "bg-orange-500" },
  { key: "social", label: "Social", color: "bg-pink-500" },
  { key: "direct", label: "Direct", color: "bg-ink-tertiary" },
  { key: "referral", label: "Referral", color: "bg-cyan-500" },
];

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-card border border-line">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-tertiary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Ga4WebsiteTraffic({ data, hotelId }: { data: Ga4Dashboard; hotelId: string }) {
  if (!data.connected) {
    return (
      <SectionCard title="Website Traffic" subtitle="Full traffic picture from Google Analytics 4.">
        <div className="p-8 text-center">
          <p className="text-sm text-ink-tertiary">Connect GA4 to see website traffic data.</p>
          <a
            href={`/agency/hotel/${hotelId}/integrations`}
            className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Go to Integrations →
          </a>
        </div>
      </SectionCard>
    );
  }

  if (data.days === 0) {
    return (
      <SectionCard title="Website Traffic" subtitle="From Google Analytics 4.">
        <div className="p-8 text-center text-sm text-ink-tertiary">
          GA4 is connected — run a sync on the Integrations page to pull the last 30 days.
        </div>
      </SectionCard>
    );
  }

  const bounceColor =
    data.bounceRate > 0.6 ? "text-danger" : data.bounceRate >= 0.4 ? "text-warning" : "text-success";
  const channelTotal = CHANNELS.reduce((s, c) => s + data.channels[c.key], 0);
  const deviceTotal = data.device.mobile + data.device.desktop + data.device.tablet;
  const ctr = data.ads && data.ads.impressions > 0 ? data.ads.clicks / data.ads.impressions : null;

  // Cross-validation (snippet vs GA4) — only when the snippet is in use.
  const tracked = data.trackedSessions;
  const variance = tracked != null && data.sessions > 0 ? ((tracked - data.sessions) / data.sessions) * 100 : null;
  const bigGap = variance != null && Math.abs(variance) > 20;

  return (
    <SectionCard
      title="Website Traffic"
      subtitle={`Google Analytics 4 · last ${data.days} day${data.days === 1 ? "" : "s"}${data.propertyName ? ` · ${data.propertyName}` : ""}`}
    >
      {/* 1. Traffic KPIs */}
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        <Kpi label="Total sessions" value={formatNumber(data.sessions)} />
        <Kpi label="Unique visitors" value={formatNumber(data.users)} />
        <Kpi label="Avg session" value={fmtDuration(data.avgSessionDuration)} />
        <Kpi label="Bounce rate" value={formatPercent(data.bounceRate)} valueClass={bounceColor} />
      </div>

      {/* 2. Traffic source breakdown */}
      <div className="border-b border-line p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Traffic sources</p>
        <ul className="space-y-2">
          {CHANNELS.map((c) => {
            const v = data.channels[c.key];
            const pct = channelTotal > 0 ? (v / channelTotal) * 100 : 0;
            return (
              <li key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-ink-secondary">{c.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-strong">
                  <span className={`block h-full rounded-full ${c.color}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-ink-tertiary">
                  {formatNumber(v)} · {pct.toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 3. Google Ads (only when there's spend/clicks) */}
      {data.ads && (
        <div className="border-b border-line p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Google Ads</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Clicks" value={formatNumber(data.ads.clicks)} />
            <Kpi label="Impressions" value={formatNumber(data.ads.impressions)} />
            <Kpi label="CTR" value={ctr == null ? "—" : formatPercent(ctr)} />
            <Kpi label="Cost" value={formatCurrency(data.ads.cost / 100)} />
            <Kpi label="Conversions" value={formatNumber(data.ads.conversions)} />
          </div>
          <p className="mt-2 text-xs text-ink-tertiary">
            Google Ads conversions are Google-reported — compare with HotelTrack&apos;s
            tracked bookings above.
          </p>
        </div>
      )}

      {/* 4. Geographic + 5. Device */}
      <div className="grid gap-px border-b border-line bg-line md:grid-cols-2">
        <div className="bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Top countries</p>
          <GeoTable rows={data.topCountries} />
          {data.topCities.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Top cities</p>
              <GeoTable rows={data.topCities} />
            </>
          )}
        </div>
        <div className="bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Devices</p>
          <ul className="space-y-2 text-sm">
            {([["Mobile", data.device.mobile], ["Desktop", data.device.desktop], ["Tablet", data.device.tablet]] as const).map(
              ([label, v]) => {
                const pct = deviceTotal > 0 ? (v / deviceTotal) * 100 : 0;
                return (
                  <li key={label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-ink-secondary">{label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-strong">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-ink-tertiary">{pct.toFixed(0)}%</span>
                  </li>
                );
              },
            )}
          </ul>
          <p className="mt-3 text-xs text-ink-tertiary">
            Mobile-heavy traffic? Prioritise the mobile booking experience.
          </p>
        </div>
      </div>

      {/* Cross-validation card */}
      {variance != null && (
        <div className="p-4">
          <div className={`rounded-lg border-l-4 p-4 text-sm ${bigGap ? "border-warning bg-warning/10" : "border-info bg-info/10"}`}>
            <p className="font-medium text-ink">Tracking validation</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-ink-secondary">
              <span>HotelTrack tracked: <span className="font-semibold tabular-nums">{formatNumber(tracked!)}</span> sessions</span>
              <span>GA4 reported: <span className="font-semibold tabular-nums">{formatNumber(data.sessions)}</span> sessions</span>
              <span>
                Variance:{" "}
                <span className={`font-semibold tabular-nums ${bigGap ? "text-warning" : "text-success"}`}>
                  {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
                </span>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-ink-tertiary">
              {bigGap
                ? "Large discrepancy detected. The snippet may not be installed on all pages."
                : "Well within the normal range — your tracking covers the site."}
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function GeoTable({ rows }: { rows: { name: string; sessions: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-tertiary">—</p>;
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center justify-between gap-2">
          <span className="truncate text-ink-secondary">{r.name}</span>
          <span className="shrink-0 tabular-nums text-ink-tertiary">
            {formatNumber(r.sessions)}
            {total > 0 && <span className="ml-1 text-ink-disabled">({((r.sessions / total) * 100).toFixed(0)}%)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
