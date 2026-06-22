"use client";

import { CHART_TOOLTIP } from "@/lib/chart-theme";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber } from "@/lib/format";

// Donut of visits by traffic source (utm_source). Source labels are already
// mapped to friendly names in the parent page; we only color them here. Existing
// categories (Instagram/Facebook/YouTube/Direct/…) are preserved — visual only.

const COLORS: Record<string, string> = {
  Instagram: "#ec4899",
  Facebook: "#2563eb",
  YouTube: "#ef4444",
  Direct: "#a1a1aa",
};
const FALLBACK = ["#7c3aed", "#10b981", "#3b82f6", "#f59e0b", "#06b6d4", "#84cc16"];
function colorFor(source: string, i: number): string {
  return COLORS[source] ?? FALLBACK[i % FALLBACK.length];
}

export function TrafficSourceChart({
  data,
}: {
  data: { source: string; visits: number }[];
}) {
  const total = data.reduce((s, d) => s + d.visits, 0);
  if (total === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-tertiary">
        No tracked visits in this window yet.
      </p>
    );
  }
  const ranked = [...data].sort((a, b) => b.visits - a.visits);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value) || 0;
                const pct = total > 0 ? ` (${((n / total) * 100).toFixed(1)}%)` : "";
                return [`${formatNumber(n)}${pct}`, String(name)] as [string, string];
              }}
              contentStyle={CHART_TOOLTIP}
            />
            <Pie
              data={ranked}
              dataKey="visits"
              nameKey="source"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              strokeWidth={2}
            >
              {ranked.map((d, i) => (
                <Cell key={d.source} fill={colorFor(d.source, i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center total — derived from the same data */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-ink">
            {formatNumber(total)}
          </span>
          <span className="text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
            Visits
          </span>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-2.5">
        {ranked.map((d, i) => {
          const pct = total > 0 ? (d.visits / total) * 100 : 0;
          return (
            <li
              key={d.source}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorFor(d.source, i) }}
                  aria-hidden
                />
                <span className="truncate text-ink-secondary">{d.source}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="font-semibold text-ink">{formatNumber(d.visits)}</span>
                <span className="w-12 text-right text-ink-tertiary">
                  {pct.toFixed(1)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
