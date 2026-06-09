"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";

// Daily website-visitors area chart for the public hotel dashboard's Website
// Traffic section. Mirrors the dark-theme styling of components/report charts.

function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
}

export function DailyVisitorsChart({
  data,
}: {
  data: { date: string; visitors: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-tertiary">
        No website traffic in this range yet.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
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
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) =>
              [formatNumber(Number(value) || 0), "Visitors"] as [string, string]
            }
            labelFormatter={(label) => shortDate(String(label))}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #374151",
              backgroundColor: "#1f2937",
              color: "#f9fafb",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="visitors"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#visitorsFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
