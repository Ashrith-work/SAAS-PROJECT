"use client";

import { CHART_TOOLTIP } from "@/lib/chart-theme";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

// Agency-wide daily revenue (area) + bookings (line, secondary axis) for the
// last 30 days. Empty days are zero-filled by the page before this is rendered.

function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
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
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
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
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Area
            yAxisId="rev"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
          <Line
            yAxisId="bk"
            type="monotone"
            dataKey="bookings"
            name="Bookings"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
