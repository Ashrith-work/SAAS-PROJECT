"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

// Ad-spend-over-time line chart. Shared by the agency hotel dashboard and the
// public /share view, so it lives in components/ rather than a route folder.

// "2026-05-26" -> "05/26"
function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
}

export function SpendChart({
  data,
}: {
  data: { date: string; spend: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-tertiary">
        No ad spend recorded in this range.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
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
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value) =>
              [formatCurrency(Number(value) || 0), "Spend"] as [string, string]
            }
            labelFormatter={(label) => shortDate(String(label))}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="spend"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
