"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatMultiple, formatNumber } from "@/lib/format";

// Sortable campaign↔booking table for the "Campaign performance" dashboard
// section. Pure display: the server page aggregates CampaignPerformance rows
// over the selected range and passes one row per campaign.

export type CampaignRow = {
  campaignKey: string;
  campaignName: string;
  /** True for the "Direct / Unattributed" bucket (pinned last, no variance). */
  unattributed: boolean;
  spend: number;
  realBookings: number;
  realRevenue: number;
  /** realRevenue / spend; null when spend is 0. */
  realRoas: number | null;
  metaConversions: number;
};

type SortKey = "campaignName" | "spend" | "realBookings" | "realRevenue" | "realRoas";

function roasColor(roas: number | null): string {
  if (roas == null) return "text-zinc-400";
  if (roas > 4) return "text-green-600 dark:text-green-400";
  if (roas >= 2) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/** "Meta says" cell: Meta's claim + how far it is from our measured bookings. */
function metaVerdict(row: CampaignRow): {
  text: string;
  badge: "ok" | "warn" | null;
} {
  const meta = row.metaConversions;
  const real = row.realBookings;
  const claim = `"${formatNumber(meta)} booking${meta === 1 ? "" : "s"}"`;

  if (real === 0) {
    if (meta === 0) return { text: claim, badge: "ok" };
    return { text: `${claim} — none tracked on-site`, badge: "warn" };
  }
  const diffPct = ((meta - real) / real) * 100;
  if (Math.abs(meta - real) <= 0.25 * real) {
    return { text: `${claim} (close match)`, badge: "ok" };
  }
  if (diffPct > 50) {
    return { text: `${claim} (${Math.round(diffPct)}% inflated)`, badge: "warn" };
  }
  if (diffPct > 0) return { text: `${claim} (${Math.round(diffPct)}% higher)`, badge: null };
  return { text: `${claim} (${Math.round(-diffPct)}% lower)`, badge: null };
}

export function CampaignPerformanceTable({ rows }: { rows: CampaignRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("realRoas");
  const [dir, setDir] = useState<1 | -1>(-1); // default: highest True ROAS first

  const sorted = useMemo(() => {
    const campaigns = rows.filter((r) => !r.unattributed);
    const rest = rows.filter((r) => r.unattributed); // pinned last, never a campaign
    campaigns.sort((a, b) => {
      if (sortKey === "campaignName") {
        return a.campaignName.localeCompare(b.campaignName) * dir;
      }
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
    return [...campaigns, ...rest];
  }, [rows, sortKey, dir]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDir(key === "campaignName" ? 1 : -1);
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (dir === -1 ? " ↓" : " ↑") : "";

  const TH = ({
    label,
    k,
    right,
  }: {
    label: string;
    k?: SortKey;
    right?: boolean;
  }) => (
    <th
      className={`px-4 py-3 font-medium ${right ? "text-right" : ""} ${k ? "cursor-pointer select-none hover:text-zinc-800 dark:hover:text-zinc-200" : ""}`}
      onClick={k ? () => onSort(k) : undefined}
    >
      {label}
      {k ? arrow(k) : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
          <tr>
            <TH label="Campaign" k="campaignName" />
            <TH label="Spend" k="spend" right />
            <TH label="Bookings (real)" k="realBookings" right />
            <TH label="Revenue (real)" k="realRevenue" right />
            <TH label="True ROAS" k="realRoas" right />
            <TH label="Meta says" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const verdict = r.unattributed ? null : metaVerdict(r);
            return (
              <tr
                key={r.campaignKey}
                className={`border-t border-zinc-100 dark:border-zinc-800 ${r.unattributed ? "bg-zinc-50/60 text-zinc-500 dark:bg-zinc-900/40" : ""}`}
              >
                <td className="px-4 py-3 font-medium">
                  {r.campaignName}
                  {r.unattributed && (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      not blamed on any campaign
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.unattributed ? "—" : formatCurrency(r.spend)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatNumber(r.realBookings)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(r.realRevenue)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold tabular-nums ${r.unattributed ? "" : roasColor(r.realRoas)}`}
                >
                  {r.unattributed ? "—" : formatMultiple(r.realRoas)}
                </td>
                <td className="px-4 py-3">
                  {verdict == null ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {verdict.badge === "ok" && (
                        <span className="text-green-600 dark:text-green-400">✓</span>
                      )}
                      {verdict.badge === "warn" && (
                        <span className="text-amber-600 dark:text-amber-400">⚠</span>
                      )}
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {verdict.text}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
