"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/format";

// Donut chart of visits by traffic source (utm_source). Source labels are
// already mapped to friendly names in the parent page; we only color them here.

const COLORS: Record<string, string> = {
  Instagram: "#ec4899",
  Facebook: "#2563eb",
  YouTube: "#ef4444",
  Direct: "#a1a1aa",
};
const FALLBACK = ["#7c3aed", "#10b981", "#3b82f6", "#f59e0b", "#06b6d4", "#84cc16"];

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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(value, name) => {
              const n = Number(value) || 0;
              const pct = total > 0 ? ` (${((n / total) * 100).toFixed(1)}%)` : "";
              return [`${formatNumber(n)}${pct}`, String(name)] as [string, string];
            }}
            contentStyle={{ borderRadius: 8, border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb", fontSize: 12 }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
          />
          <Pie
            data={ranked}
            dataKey="visits"
            nameKey="source"
            innerRadius={60}
            outerRadius={92}
            paddingAngle={2}
            stroke="#111827"
            strokeWidth={2}
          >
            {ranked.map((d, i) => (
              <Cell key={d.source} fill={COLORS[d.source] ?? FALLBACK[i % FALLBACK.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
