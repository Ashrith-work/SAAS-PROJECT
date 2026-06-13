"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCurrency, formatCurrencyCents, formatNumber, formatMultiple } from "@/lib/format";
import type {
  ChannelView as ChannelViewData, PaidChannelView, InstagramChannelView,
  FacebookChannelView, InfluencerChannelView, DirectChannelView, OtherChannelView,
  ChannelKey,
} from "@/lib/channel-view-types";
import { ChannelSelector, CHANNEL_META } from "./ChannelSelector";

// Channel-specific dashboard view. Mounted by the hotel dashboard when
// ?channel=<x> is set (x !== "all"). Client-fetches the channel-view endpoint
// for the page's date range and renders KPIs + a trend chart + tables, with
// graceful empty states. The selector stays visible so the user can switch.

const RANGE_PRESETS = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
] as const;

export function ChannelView({
  hotelId, channel, from, to, currentRange,
}: {
  hotelId: string;
  channel: Exclude<ChannelKey, "all">;
  from: string;
  to: string;
  currentRange: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ChannelViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    fetch(`/api/agency/hotels/${hotelId}/channel-view?channel=${channel}&startDate=${from}&endDate=${to}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (abort.current === ctrl) setData(d as ChannelViewData); })
      .catch((e) => { if ((e as Error).name !== "AbortError" && abort.current === ctrl) setError(true); })
      .finally(() => { if (abort.current === ctrl) setLoading(false); });
    return () => ctrl.abort();
  }, [hotelId, channel, from, to]);

  const meta = CHANNEL_META[channel];

  function rangeHref(key: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    params.delete("from");
    params.delete("to");
    return `${pathname}?${params.toString()}`;
  }
  const allChannelsHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("channel");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <span aria-hidden>{meta.icon}</span>
            {meta.label} Performance
          </h1>
          <div className="flex items-center gap-2">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => router.push(rangeHref(p.key))}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentRange === p.key ? "border-brand bg-brand text-white" : "border-line-strong text-ink-secondary hover:bg-elevated"
                }`}
              >
                {p.label}
              </button>
            ))}
            <Link
              href={allChannelsHref}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-elevated"
            >
              View All Channels
            </Link>
          </div>
        </div>
        <ChannelSelector current={channel} />
      </div>

      {loading && !data ? (
        <ChannelSkeleton />
      ) : error || !data ? (
        <Panel><p className="py-8 text-center text-sm text-ink-tertiary">Couldn&apos;t load {meta.label} data right now.</p></Panel>
      ) : (
        <Body data={data} hotelId={hotelId} />
      )}

      <div className="pt-1">
        <Link href={allChannelsHref} className="text-sm font-medium text-brand hover:underline">
          ← View All Channels
        </Link>
      </div>
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card">
      {title && <div className="border-b border-line px-4 py-3"><h3 className="text-sm font-medium text-ink">{title}</h3></div>}
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-tertiary">{sub}</p>}
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Panel>
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-tertiary">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </Panel>
  );
}

type Series = { key: string; label: string; color: string; axis?: "left" | "right"; currency?: boolean };

function TrendChart({ data, series }: { data: Array<Record<string, number | string>>; series: Series[] }) {
  const hasRight = series.some((s) => s.axis === "right");
  return (
    <div className="p-4">
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: hasRight ? 8 : 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={{ stroke: "#1f2937" }}
              tickFormatter={(d: string) => (typeof d === "string" ? d.slice(5) : d)} minTickGap={24} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={44} />
            {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={44} />}
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb", fontSize: 12 }}
              formatter={(value, name) => {
                const s = series.find((x) => x.label === name);
                return [s?.currency ? formatCurrency(Number(value) || 0) : formatNumber(Number(value) || 0), name] as [string, string];
              }}
            />
            {series.map((s) => (
              <Line key={s.key} yAxisId={s.axis ?? "left"} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-secondary">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-tertiary">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${i === 0 ? "" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = "px-4 py-2.5 text-right tabular-nums text-ink-secondary";
const tdName = "max-w-[16rem] truncate px-4 py-2.5 font-medium text-ink";

// ── Per-channel bodies ───────────────────────────────────────────────────────

function Body({ data, hotelId }: { data: ChannelViewData; hotelId: string }) {
  switch (data.channelType) {
    case "paid_ads": return <PaidBody data={data} hotelId={hotelId} />;
    case "organic_social":
      return data.channelName === "Instagram Organic"
        ? <InstagramBody data={data as InstagramChannelView} />
        : <FacebookBody data={data as FacebookChannelView} />;
    case "influencer": return <InfluencerBody data={data} />;
    case "direct": return <DirectBody data={data} />;
    case "other": return <OtherBody data={data} />;
  }
}

function PaidBody({ data, hotelId }: { data: PaidChannelView; hotelId: string }) {
  if (!data.hasData || !data.kpis) {
    if (data.channelName === "Google Ads") {
      return <EmptyState title="Google Ads not connected — coming soon"
        body="Google Ads isn't integrated yet. Once it's available you'll see spend, clicks, CPC, and ROAS here alongside Meta." />;
    }
    return <EmptyState title="Meta Ads not connected"
      body="Connect this hotel's Meta (Facebook) Ads account to see spend, CPC, CPM, CTR, ROAS, and top campaigns here."
      action={<Link href={`/agency/hotel/${hotelId}/integrations`} className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">Connect Meta Ads</Link>} />;
  }
  const k = data.kpis;
  const accounts = data.accounts ?? [];
  const archived = data.archivedAccountIds ?? [];
  return (
    <div className="space-y-4">
      <StatGrid>
        {/* Spend in Indian-compact form; per-unit money (CPC/CPM/cost-per-X) in
            full ₹0.00 precision so small values aren't rounded to ₹0. CTR/CPC/CPM
            are recomputed from totals server-side (never averaged across rows). */}
        <Stat label="Total spend" value={formatCurrency(k.totalSpend, { compact: true })} sub={accounts.length > 1 ? `${accounts.length} accounts` : undefined} />
        <Stat label="Revenue" value={formatCurrency(k.revenue, { compact: true })} sub={`${formatNumber(k.bookings)} tracked bookings`} />
        <Stat label="ROAS" value={formatMultiple(k.roas)} sub="Revenue ÷ spend" />
        <Stat label="Conversions" value={formatNumber(k.conversions)} sub="Meta-reported" />
        <Stat label="Cost / conversion" value={k.costPerConversion == null ? "—" : formatCurrencyCents(k.costPerConversion)} />
        <Stat label="Impressions" value={formatNumber(k.impressions)} />
        <Stat label="Reach" value={formatNumber(k.reach)} sub={`${k.frequency.toFixed(1)}× frequency`} />
        <Stat label="Clicks" value={formatNumber(k.linkClicks)} />
        <Stat label="CTR" value={`${k.ctr.toFixed(2)}%`} sub="Clicks ÷ impressions" />
        <Stat label="CPC" value={formatCurrencyCents(k.cpc)} sub="Spend ÷ clicks" />
        <Stat label="CPM" value={formatCurrencyCents(k.cpm)} sub="Per 1,000 impressions" />
      </StatGrid>

      {(accounts.length > 1 || archived.length > 0) && (
        <Panel title="By ad account">
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.accountId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate font-medium text-ink" title={a.accountId}>{a.accountId}</span>
                <span className="tabular-nums text-ink-secondary">
                  {formatCurrency(a.spend, { compact: true })} · {formatNumber(a.impressions)} impr · {formatNumber(a.clicks)} clicks
                </span>
              </li>
            ))}
            {archived.map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate text-ink-tertiary" title={id}>{id}</span>
                <span className="text-ink-tertiary">archived · not included</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Spend vs revenue">
        <TrendChart data={data.trend ?? []} series={[
          { key: "spend", label: "Spend", color: "#3b82f6", axis: "left", currency: true },
          { key: "revenue", label: "Revenue", color: "#22c55e", axis: "right", currency: true },
        ]} />
      </Panel>

      <Panel title="Top campaigns">
        {(data.topCampaigns ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">No campaign data in this period.</p>
        ) : (
          <Table head={["Campaign", "Spend", "Revenue", "Bookings", "ROAS", "CTR"]}>
            {data.topCampaigns!.map((c) => (
              <tr key={c.campaignName} className="border-t border-line">
                <td className={tdName} title={c.campaignName}>{c.campaignName}</td>
                <td className={td}>{formatCurrency(c.spend, { compact: true })}</td>
                <td className={td}>{formatCurrency(c.revenue, { compact: true })}</td>
                <td className={td}>{formatNumber(c.bookings)}</td>
                <td className={td}>{formatMultiple(c.roas)}</td>
                <td className={td}>{c.ctr.toFixed(2)}%</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {/* Creative-level data isn't synced, so the Top Creatives table is skipped. */}
    </div>
  );
}

function InstagramBody({ data }: { data: InstagramChannelView }) {
  if (!data.hasData) {
    return <EmptyState title="No Instagram organic data this period"
      body="Connect this hotel's Instagram account (Integrations) and we'll sync reach, engagement, profile visits, and website clicks here." />;
  }
  const k = data.kpis;
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Profile visits" value={formatNumber(k.profileVisits)} />
        <Stat label="Post reach" value={formatNumber(k.postReach)} sub={`${formatNumber(k.postImpressions)} impressions`} />
        <Stat label="Engagement rate" value={`${k.engagementRate.toFixed(1)}%`} sub="Interactions ÷ reach" />
        <Stat label="Website clicks" value={formatNumber(k.websiteClicks)} />
        <Stat label="Sessions from IG" value={formatNumber(k.sessionsFromInstagram)} />
        <Stat label="Bookings" value={formatNumber(k.bookings)} />
        <Stat label="Revenue" value={formatCurrency(k.revenue, { compact: true })} />
        <Stat label="Saves" value={formatNumber(k.saves)} sub={`${formatNumber(k.likes)} likes · ${formatNumber(k.comments)} comments`} />
      </StatGrid>

      <Panel title="Sessions & bookings from Instagram">
        <TrendChart data={data.trend} series={[
          { key: "sessions", label: "Sessions", color: "#ec4899", axis: "left" },
          { key: "bookings", label: "Bookings", color: "#22c55e", axis: "left" },
        ]} />
      </Panel>

      {data.topPosts && data.topPosts.length > 0 && (
        <Panel title="Top posts">
          <Table head={["Post", "Reach", "Saves", "Bookings"]}>
            {data.topPosts.map((p) => (
              <tr key={p.postId} className="border-t border-line">
                <td className={tdName} title={p.caption}>{p.caption || "(no caption)"}</td>
                <td className={td}>{formatNumber(p.reach)}</td>
                <td className={td}>{formatNumber(p.saves)}</td>
                <td className={td}>{p.bookings == null ? "—" : formatNumber(p.bookings)}</td>
              </tr>
            ))}
          </Table>
          <p className="px-4 py-2 text-xs text-ink-tertiary">Per-post booking attribution isn&apos;t available yet, so bookings show &ldquo;—&rdquo;.</p>
        </Panel>
      )}
    </div>
  );
}

function FacebookBody({ data }: { data: FacebookChannelView }) {
  const k = data.kpis;
  if (!data.hasData) {
    return <EmptyState title="No Facebook organic data this period"
      body="We don't sync Facebook Page metrics yet. Sessions and bookings attributed to Facebook organic (via UTM tags) will appear here once they're tracked." />;
  }
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Sessions from FB" value={formatNumber(k.sessionsFromFacebook)} />
        <Stat label="Bookings" value={formatNumber(k.bookings)} />
        <Stat label="Revenue" value={formatCurrency(k.revenue, { compact: true })} />
        <Stat label="Page reach" value={k.postReach > 0 ? formatNumber(k.postReach) : "—"} sub="Not synced yet" />
      </StatGrid>
      <Panel title="Sessions & bookings from Facebook">
        <TrendChart data={data.trend} series={[
          { key: "sessions", label: "Sessions", color: "#6366f1", axis: "left" },
          { key: "bookings", label: "Bookings", color: "#22c55e", axis: "left" },
        ]} />
      </Panel>
    </div>
  );
}

function InfluencerBody({ data }: { data: InfluencerChannelView }) {
  if (!data.hasData) {
    return <EmptyState title="No influencer activity yet"
      body="Create your first influencer and coupon code to start tracking redemptions and revenue."
      action={<Link href="/agency/influencers" className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">Go to Influencers</Link>} />;
  }
  const k = data.kpis;
  const b = data.redemptionSourceBreakdown;
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Active influencers" value={formatNumber(k.activeInfluencers)} />
        <Stat label="Active coupon codes" value={formatNumber(k.activeCouponCodes)} />
        <Stat label="Redemptions" value={formatNumber(k.totalRedemptions)} sub={`${formatNumber(b.snippetAuto)} auto · ${formatNumber(b.manualEntry)} manual`} />
        <Stat label="Revenue" value={formatCurrency(k.totalRevenue, { compact: true })} sub={`${formatCurrency(k.averageRevenuePerInfluencer, { compact: true })} avg / influencer`} />
      </StatGrid>
      <Panel title="Redemptions & revenue">
        <TrendChart data={data.trend} series={[
          { key: "redemptions", label: "Redemptions", color: "#f59e0b", axis: "left" },
          { key: "revenue", label: "Revenue", color: "#22c55e", axis: "right", currency: true },
        ]} />
      </Panel>
      <Panel title="Top influencers">
        {data.topInfluencers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">No redemptions in this period.</p>
        ) : (
          <Table head={["Influencer", "Codes", "Redemptions", "Revenue", "Avg booking"]}>
            {data.topInfluencers.map((i) => (
              <tr key={`${i.influencerName}-${i.instagramHandle}`} className="border-t border-line">
                <td className={tdName}>
                  {i.influencerName}
                  {i.instagramHandle && <span className="ml-1 text-xs text-ink-tertiary">@{i.instagramHandle}</span>}
                </td>
                <td className={td}>{formatNumber(i.activeCodesCount)}</td>
                <td className={td}>{formatNumber(i.redemptionsCount)}</td>
                <td className={td}>{formatCurrency(i.revenue, { compact: true })}</td>
                <td className={td}>{formatCurrency(i.avgBookingValue, { compact: true })}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function DirectBody({ data }: { data: DirectChannelView }) {
  const k = data.kpis;
  if (!data.hasData) {
    return <EmptyState title="No direct traffic this period"
      body="Direct visits (no marketing source) and their bookings will appear here once the tracking snippet records sessions." />;
  }
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Sessions" value={formatNumber(k.sessions)} />
        <Stat label="Bookings" value={formatNumber(k.bookings)} />
        <Stat label="Revenue" value={formatCurrency(k.revenue, { compact: true })} />
        <Stat label="Conversion rate" value={k.conversionRate == null ? "—" : `${k.conversionRate.toFixed(1)}%`} sub={`${formatCurrency(k.avgBookingValue, { compact: true })} avg booking`} />
      </StatGrid>
      <Panel title="Direct sessions, bookings & revenue">
        <TrendChart data={data.trend} series={[
          { key: "sessions", label: "Sessions", color: "#9ca3af", axis: "left" },
          { key: "bookings", label: "Bookings", color: "#22c55e", axis: "left" },
          { key: "revenue", label: "Revenue", color: "#3b82f6", axis: "right", currency: true },
        ]} />
      </Panel>
      <Panel title="Top landing pages">
        {data.topLandingPages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">No landing-page data in this period.</p>
        ) : (
          <Table head={["Page", "Sessions", "Bookings"]}>
            {data.topLandingPages.map((p) => (
              <tr key={p.pagePath} className="border-t border-line">
                <td className={tdName} title={p.pagePath}>{p.pagePath}</td>
                <td className={td}>{formatNumber(p.sessions)}</td>
                <td className={td}>{formatNumber(p.bookings)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function OtherBody({ data }: { data: OtherChannelView }) {
  const k = data.kpis;
  if (!data.hasData) {
    return <EmptyState title="No other-channel traffic this period"
      body="Visits whose UTM source doesn't match a known channel will be grouped here so you can investigate and tag them correctly." />;
  }
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Sessions" value={formatNumber(k.sessions)} />
        <Stat label="Bookings" value={formatNumber(k.bookings)} />
        <Stat label="Revenue" value={formatCurrency(k.revenue, { compact: true })} />
      </StatGrid>
      <Panel title="Sessions, bookings & revenue">
        <TrendChart data={data.trend} series={[
          { key: "sessions", label: "Sessions", color: "#8b5cf6", axis: "left" },
          { key: "bookings", label: "Bookings", color: "#22c55e", axis: "left" },
          { key: "revenue", label: "Revenue", color: "#3b82f6", axis: "right", currency: true },
        ]} />
      </Panel>
      <Panel title="Unknown sources">
        <Table head={["Source", "Medium", "Sessions", "Bookings", "Revenue"]}>
          {data.unknownSources.map((s) => (
            <tr key={`${s.utmSource}-${s.utmMedium}`} className="border-t border-line">
              <td className={tdName}>{s.utmSource}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{s.utmMedium}</td>
              <td className={td}>{formatNumber(s.sessions)}</td>
              <td className={td}>{formatNumber(s.bookings)}</td>
              <td className={td}>{formatCurrency(s.revenue, { compact: true })}</td>
            </tr>
          ))}
        </Table>
        <p className="px-4 py-2 text-xs text-ink-tertiary">Tag these links with recognised UTM sources/mediums to move them into the right channel.</p>
      </Panel>
    </div>
  );
}

function ChannelSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-line bg-card" />
      <div className="h-48 animate-pulse rounded-xl border border-line bg-card" />
    </div>
  );
}
