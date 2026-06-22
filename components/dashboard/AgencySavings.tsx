"use client";

import { CHART_TOOLTIP } from "@/lib/chart-theme";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

// Agency-wide OTA savings (Part 6) — KPI card, a Savings-by-Hotel table (each
// hotel at its own rate, click → that hotel's dashboard), and a 12-month trend
// stacked by hotel. Client-fetches /api/agency/savings. Hidden when no hotels.

const RANGES = [{ key: "7", label: "7d" }, { key: "30", label: "30d" }, { key: "90", label: "90d" }];
const HOTEL_COLORS = ["#16a34a", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444", "#6366f1", "#22c55e", "#eab308"];

type HotelBreak = { hotelId: string; hotelName: string; otaRateUsed: number; bookings: number; revenue: number; savings: number };
type Data = {
  totalRevenue: number; totalSavings: number; bookingCount: number; activeHotelsCount: number; totalHotelsCount: number;
  previous: { totalSavings: number };
  hotelBreakdown: HotelBreak[];
  hotels: { id: string; name: string }[];
  monthlyByHotel: { month: string; hotels: Record<string, number> }[];
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function monthLabel(m: string) { return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }); }

export function AgencySavings() {
  const router = useRouter();
  const [rangeKey, setRangeKey] = useState("30");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    return { startDate: isoDay(new Date(end.getTime() - Number(rangeKey) * 86_400_000)), endDate: isoDay(end) };
  }, [rangeKey]);

  useEffect(() => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/agency/savings?startDate=${startDate}&endDate=${endDate}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as Data); })
      .catch(() => {})
      .finally(() => { if (abort.current === ctrl) setLoading(false); });
    return () => ctrl.abort();
  }, [startDate, endDate]);

  const delta = useMemo(() => {
    if (!data || data.previous.totalSavings <= 0) return null;
    return ((data.totalSavings - data.previous.totalSavings) / data.previous.totalSavings) * 100;
  }, [data]);

  // Stack only hotels that have savings in the window, to keep the legend tidy.
  const activeHotels = useMemo(() => {
    if (!data) return [] as { id: string; name: string; color: string }[];
    return data.hotels
      .filter((h) => data.monthlyByHotel.some((m) => (m.hotels[h.id] ?? 0) > 0))
      .map((h, i) => ({ ...h, color: HOTEL_COLORS[i % HOTEL_COLORS.length] }));
  }, [data]);
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.monthlyByHotel.map((m) => {
      const row: Record<string, number | string> = { month: m.month };
      for (const h of data.hotels) row[h.id] = m.hotels[h.id] ?? 0;
      return row;
    });
  }, [data]);

  // PART 8.4 — agency with no hotels: hide the savings section entirely.
  if (data && data.totalHotelsCount === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Commission saved vs OTAs</h2>
          <p className="text-sm text-ink-tertiary">What your direct bookings saved across all hotels, each at its own OTA rate.</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-line-strong">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRangeKey(r.key)}
              className={`px-3 py-1.5 text-sm font-medium ${rangeKey === r.key ? "bg-brand text-white" : "bg-page text-ink-secondary hover:bg-elevated"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="rounded-card border border-line p-4">
        {data == null ? (
          <p className="text-sm text-ink-tertiary">{loading ? "Loading…" : "Could not load savings."}</p>
        ) : data.bookingCount === 0 ? (
          <p className="text-sm text-ink-tertiary">No bookings tracked in this period.</p>
        ) : (
          <>
            <p className="text-3xl font-semibold tabular-nums text-success" title={formatCurrency(data.totalSavings)}>{formatCurrency(data.totalSavings, { compact: true })}</p>
            <p className="mt-1 text-sm text-ink-tertiary">saved across {data.activeHotelsCount} hotel{data.activeHotelsCount === 1 ? "" : "s"} this period</p>
            {delta != null && (
              <p className={`mt-0.5 text-xs ${delta >= 0 ? "text-success" : "text-danger"}`}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs {formatCurrency(data.previous.totalSavings, { compact: true })} last period
              </p>
            )}
          </>
        )}
      </div>

      {data && data.hotelBreakdown.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line">
          <div className="border-b border-line px-4 py-3"><h3 className="font-medium">Savings by hotel</h3></div>
          <div className="overflow-x-auto">
            <table className="ht-table w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2 font-medium">Hotel</th>
                  <th className="px-4 py-2 text-right font-medium">OTA rate</th>
                  <th className="px-4 py-2 text-right font-medium">Bookings</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2 text-right font-medium">Savings</th>
                </tr>
              </thead>
              <tbody>
                {data.hotelBreakdown.map((hRow) => (
                  <tr key={hRow.hotelId} onClick={() => router.push(`/agency/hotel/${hRow.hotelId}`)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-elevated">
                    <td className="px-4 py-2.5 font-medium text-ink">{hRow.hotelName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{hRow.otaRateUsed}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(hRow.bookings)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{formatCurrency(hRow.revenue, { compact: true })}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-success">{formatCurrency(hRow.savings, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && activeHotels.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Monthly savings by hotel (last 12 months)</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={{ stroke: "#1f2937" }} minTickGap={12} />
                <YAxis tickFormatter={(v: number) => formatCurrency(v, { compact: true })} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  labelFormatter={(m) => monthLabel(String(m))}
                  formatter={(value, name) => [formatCurrency(Number(value) || 0), activeHotels.find((h) => h.id === name)?.name ?? String(name)] as [string, string]}
                  contentStyle={CHART_TOOLTIP}
                />
                {activeHotels.map((h) => <Bar key={h.id} dataKey={h.id} stackId="sav" fill={h.color} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
