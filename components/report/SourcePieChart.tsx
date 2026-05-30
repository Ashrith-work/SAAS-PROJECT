"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber } from "@/lib/format";

// Traffic-source pie chart for the GA4 "Total Website Performance" section
// on the hotel dashboard. Uses the same source-bucket vocabulary as
// lib/google-analytics.ts → normaliseSource(): instagram, facebook,
// google_organic, google_paid, direct, email, referral, other.

export type SourceSlice = { source: string; sessions: number };

const LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google_organic: "Google · organic",
  google_paid: "Google · paid",
  direct: "Direct",
  email: "Email",
  referral: "Referral",
  other: "Other",
};

// Pinned per-source colours so the same bucket gets the same colour across
// hotels — no surprise palette shifts when traffic mix changes.
const COLORS: Record<string, string> = {
  instagram: "#ec4899",
  facebook: "#3b82f6",
  google_organic: "#22c55e",
  google_paid: "#f59e0b",
  direct: "#71717a",
  email: "#8b5cf6",
  referral: "#06b6d4",
  other: "#a3a3a3",
};

export function SourcePieChart({ data }: { data: SourceSlice[] }) {
  const rows = data
    .filter((d) => d.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const total = rows.reduce((s, r) => s + r.sessions, 0);

  if (rows.length === 0 || total === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No GA source data in this range yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[260px_1fr] sm:items-center">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="sessions"
              nameKey="source"
              innerRadius={50}
              outerRadius={88}
              paddingAngle={1}
            >
              {rows.map((row) => (
                <Cell key={row.source} fill={COLORS[row.source] ?? COLORS.other} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const slice = item?.payload as SourceSlice | undefined;
                const sessions = Number(value) || 0;
                const label = slice ? LABELS[slice.source] ?? slice.source : "";
                return [
                  `${formatNumber(sessions)} sessions (${((sessions / total) * 100).toFixed(1)}%)`,
                  label,
                ] as [string, string];
              }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((row) => {
          const pct = (row.sessions / total) * 100;
          return (
            <li key={row.source} className="flex items-center gap-2 tabular-nums">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: COLORS[row.source] ?? COLORS.other }}
              />
              <span className="flex-1">{LABELS[row.source] ?? row.source}</span>
              <span className="text-zinc-500">{formatNumber(row.sessions)}</span>
              <span className="w-12 text-right text-xs text-zinc-500">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
