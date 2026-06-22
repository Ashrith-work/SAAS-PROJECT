"use client";

import { CHART_TOOLTIP } from "@/lib/chart-theme";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

// Horizontal bar chart ranking hotels by attributed revenue. Colors cycle
// across a small palette so multi-hotel agencies aren't a wall of one color.

const PALETTE = ["#7c3aed", "#10b981", "#3b82f6", "#f59e0b", "#db2777", "#06b6d4", "#84cc16"];

export function RevenueByHotelChart({
  data,
}: {
  data: { hotel: string; revenue: number }[];
}) {
  if (data.length === 0 || data.every((d) => d.revenue === 0)) {
    return (
      <p className="py-12 text-center text-sm text-ink-tertiary">
        No hotel revenue in this window yet.
      </p>
    );
  }
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const height = Math.max(220, sorted.length * 42);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 8, right: 56, bottom: 0, left: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={{ stroke: "#1f2937" }}
          />
          <YAxis
            type="category"
            dataKey="hotel"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.06)" }}
            formatter={(value) =>
              [formatCurrency(Number(value) || 0), "Revenue"] as [string, string]
            }
            contentStyle={CHART_TOOLTIP}
          />
          <Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={22}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <LabelList
              dataKey="revenue"
              position="right"
              formatter={(value: unknown) => formatCurrency(Number(value) || 0)}
              style={{ fontSize: 11, fill: "#d1d5db" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
