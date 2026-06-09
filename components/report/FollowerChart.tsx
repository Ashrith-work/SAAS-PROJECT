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

// Follower-count-over-time chart for the dashboard's Social Media Performance
// section. Shares the components/report home with SpendChart.

// "2026-05-26" -> "05/26"
function shortDate(d: string): string {
  return d.slice(5).replace("-", "/");
}

export function FollowerChart({
  data,
}: {
  data: { date: string; followers: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-tertiary">
        No follower history in this range yet.
      </p>
    );
  }

  // Pad the domain a little so a slowly-growing line isn't a flat edge-to-edge bar.
  const values = data.map((d) => d.followers);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(Math.round((max - min) * 0.1), 1);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="followerFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#db2777" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#db2777" stopOpacity={0} />
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
            domain={[Math.max(min - pad, 0), max + pad]}
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={56}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) =>
              [formatNumber(Number(value) || 0), "Followers"] as [string, string]
            }
            labelFormatter={(label) => shortDate(String(label))}
            contentStyle={{ borderRadius: 8, border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb", fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="followers"
            stroke="#db2777"
            strokeWidth={2}
            fill="url(#followerFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
