"use client";

import { useMemo, useState } from "react";
import {
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";

// "Meta Campaign Breakdown" — raw per-campaign numbers straight from Meta's
// API (AdCampaignSnapshot), with NO matching to HotelTrack snippet bookings.
// The sibling "Campaign performance" section does the verified UTM attribution.
// Pure display: the server aggregates the rows over the selected range.

export type MetaCampaignRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** clicks / impressions */
  ctr: number;
  /** Meta-reported pixel purchases. */
  metaBookings: number;
  /** purchaseValue / spend; null when spend is 0. */
  metaRoas: number | null;
};

type SortKey = "campaignName" | "spend" | "impressions" | "clicks" | "ctr" | "metaBookings" | "metaRoas";

export function MetaCampaignBreakdownTable({ rows }: { rows: MetaCampaignRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [dir, setDir] = useState<1 | -1>(-1); // default: highest spend first

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (sortKey === "campaignName") {
        return a.campaignName.localeCompare(b.campaignName) * dir;
      }
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
    return out;
  }, [rows, sortKey, dir]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDir(key === "campaignName" ? 1 : -1);
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (dir === -1 ? " ↓" : " ↑") : "");

  const TH = ({ label, k, right }: { label: string; k: SortKey; right?: boolean }) => (
    <th
      className={`cursor-pointer select-none px-4 py-3 font-medium hover:text-ink ${right ? "text-right" : ""}`}
      onClick={() => onSort(k)}
    >
      {label}
      {arrow(k)}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="ht-table w-full text-left text-sm">
        <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-tertiary">
          <tr>
            <TH label="Campaign name" k="campaignName" />
            <TH label="Spend" k="spend" right />
            <TH label="Impressions" k="impressions" right />
            <TH label="Clicks" k="clicks" right />
            <TH label="CTR" k="ctr" right />
            <TH label="Meta bookings" k="metaBookings" right />
            <TH label="Meta ROAS" k="metaRoas" right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.campaignId} className="border-t border-line">
              <td className="px-4 py-3 font-medium">{r.campaignName}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.spend)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.impressions)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.clicks)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatPercent(r.ctr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.metaBookings)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatMultiple(r.metaRoas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
