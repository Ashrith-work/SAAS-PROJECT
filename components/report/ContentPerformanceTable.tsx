"use client";

import { useMemo, useState } from "react";
import type { ContentPerf } from "@/lib/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

// Sortable content-performance table. Shared by the agency hotel dashboard and
// the public /share view, so it lives in components/ rather than a route folder.

const TYPE_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_ad: "Paid ad",
  influencer: "Influencer",
  story: "Story",
};
const TYPE_CLS: Record<string, string> = {
  organic: "bg-info/15 text-info",
  paid_ad: "bg-[rgb(168_85_247_/0.15)] text-[#c084fc]",
  influencer: "bg-[rgb(236_72_153_/0.15)] text-[#f472b6]",
  story: "bg-warning/15 text-warning",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_CLS[type] ?? "bg-elevated text-ink-tertiary"
      }`}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

type SortKey =
  | "title"
  | "contentType"
  | "clicks"
  | "sessions"
  | "bookings"
  | "revenue"
  | "conversionRate";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "title", label: "Content", numeric: false },
  { key: "contentType", label: "Type", numeric: false },
  { key: "clicks", label: "Clicks", numeric: true },
  { key: "sessions", label: "Sessions", numeric: true },
  { key: "bookings", label: "Bookings", numeric: true },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "conversionRate", label: "Conv. rate", numeric: true },
];

export function ContentPerformanceTable({ rows }: { rows: ContentPerf[] }) {
  // Default: by revenue, highest first.
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) - (bv as number);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text defaults to A→Z; numbers default to high→low.
      setDir(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
        No content pieces for this hotel yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="ht-table w-full text-left text-sm">
        <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-tertiary">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${c.numeric ? "text-right" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className={`inline-flex items-center gap-1 hover:text-ink ${
                    c.numeric ? "flex-row-reverse" : ""
                  }`}
                >
                  {c.label}
                  <span className="text-[10px]">
                    {sortKey === c.key ? (dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="px-4 py-3 font-medium">{r.title}</td>
              <td className="px-4 py-3">
                <TypeBadge type={r.contentType} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatNumber(r.clicks)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatNumber(r.sessions)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatNumber(r.bookings)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCurrency(r.revenue)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatPercent(r.conversionRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
