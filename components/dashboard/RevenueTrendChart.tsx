"use client";

import { CHART_TOOLTIP } from "@/lib/chart-theme";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

// Agency-wide daily revenue (area) + bookings (line, secondary axis) for the
// last 30 days. Empty days are zero-filled by the page before this is rendered.
// Data source unchanged — only the presentation (rounded strokes, soft grid,
// value legend) is styled to the reference here.

function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-sm text-ink-tertiary">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
    </span>
  );
}

export function RevenueTrendChart({
  data,
}: {
  data: { date: string; revenue: number; bookings: number }[];
}) {
  if (data.length === 0 || data.every((d) => d.revenue === 0 && d.bookings === 0)) {
    return (
      <p className="py-12 text-center text-sm text-ink-tertiary">
        No tracked activity in this window yet.
      </p>
    );
  }
  // Totals are summed from the SAME data prop — no new data source.
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalBookings = data.reduce((s, d) => s + d.bookings, 0);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <LegendItem
          color="#10b981"
          label="Revenue"
          value={formatCurrency(totalRevenue, { compact: true })}
        />
        <LegendItem color="#3b82f6" label="Bookings" value={formatNumber(totalBookings)} />
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#1f2937"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#1f2937" }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="rev"
              tickFormatter={(v: number) => formatCurrency(v)}
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <YAxis
              yAxisId="bk"
              orientation="right"
              tickFormatter={(v: number) => formatNumber(v)}
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={42}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value) || 0;
                if (name === "Revenue") return [formatCurrency(n), name] as [string, string];
                return [formatNumber(n), name] as [string, string];
              }}
              labelFormatter={(label) => shortDate(String(label))}
              contentStyle={CHART_TOOLTIP}
            />
            <Area
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#10b981"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#revenueFill)"
            />
            <Line
              yAxisId="bk"
              type="monotone"
              dataKey="bookings"
              name="Bookings"
              stroke="#3b82f6"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
