"use client";

import { useMemo, useState } from "react";
import type { ContentPerf } from "@/lib/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_ad: "Paid ad",
  influencer: "Influencer",
  story: "Story",
};
const TYPE_CLS: Record<string, string> = {
  organic: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  paid_ad: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  influencer: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  story: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_CLS[type] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
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
      <p className="px-4 py-8 text-center text-sm text-zinc-500">
        No content pieces for this hotel yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${c.numeric ? "text-right" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className={`inline-flex items-center gap-1 hover:text-black dark:hover:text-white ${
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
            <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
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
