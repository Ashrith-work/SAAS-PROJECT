"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Filter bar for the journeys page. Each control writes to the URL search params
// (preserving the others) so the server component re-queries — same pattern as
// the dashboard's DateRangeSelector, kept self-contained here.

const RANGES = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
];

const selectCls =
  "rounded-lg border border-line-strong bg-page px-3 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function JourneyFilters({
  rangeKey,
  convertedOnly,
  identifiedOnly,
  utmSource,
  landing,
  utmOptions,
  landingOptions,
}: {
  rangeKey: string;
  convertedOnly: boolean;
  identifiedOnly: boolean;
  utmSource: string | null;
  landing: string | null;
  utmOptions: string[];
  landingOptions: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // Update one or more params, always resetting pagination to page 1.
  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === "") q.delete(k);
        else q.set(k, v);
      }
      q.delete("page");
      router.push(`?${q.toString()}`);
    },
    [router, sp],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
      {/* Date range */}
      <div className="inline-flex overflow-hidden rounded-lg border border-line-strong">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => update({ range: r.key, from: null, to: null })}
            className={`px-3 py-1.5 text-sm font-medium ${
              rangeKey === r.key ? "bg-brand text-white" : "bg-page text-ink-secondary hover:bg-elevated"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Converted only */}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={convertedOnly}
          onChange={(e) => update({ converted: e.target.checked ? "1" : null })}
          className="h-4 w-4 rounded border-line-strong"
        />
        Converted only
      </label>

      {/* Identified visitors only */}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={identifiedOnly}
          onChange={(e) => update({ identified: e.target.checked ? "1" : null })}
          className="h-4 w-4 rounded border-line-strong"
        />
        Identified only
      </label>

      {/* UTM source */}
      <select
        value={utmSource ?? ""}
        onChange={(e) => update({ utmSource: e.target.value || null })}
        className={selectCls}
        aria-label="Filter by UTM source"
      >
        <option value="">All sources</option>
        {utmOptions.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      {/* Landing page */}
      <select
        value={landing ?? ""}
        onChange={(e) => update({ landing: e.target.value || null })}
        className={selectCls}
        aria-label="Filter by landing page"
      >
        <option value="">All landing pages</option>
        {landingOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}
