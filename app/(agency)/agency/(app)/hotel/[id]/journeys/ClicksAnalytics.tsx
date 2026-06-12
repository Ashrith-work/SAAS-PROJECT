import { formatNumber, formatPercent } from "@/lib/format";
import type { ClickRow } from "@/lib/interaction-analytics";

// Clicks Analytics (Part 4) — per-`data-ht-click` target totals + the share of
// clicking sessions that converted. Presentational only; all aggregation is done
// server-side (agency-scoped) in the page. Sorted by total clicks desc.

// Color the conversion rate so a high-traffic / low-converting CTA stands out.
function rateTone(rate: number | null): string {
  if (rate == null) return "text-ink-tertiary";
  if (rate >= 0.15) return "text-success";
  if (rate >= 0.05) return "text-warning";
  return "text-danger";
}

export function ClicksAnalytics({ rows }: { rows: ClickRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-ink-tertiary">
        No tagged clicks in this range yet. Add <code className="text-ink-secondary">data-ht-click=&quot;…&quot;</code>{" "}
        to a button or link (e.g. your Book Now / Check Availability CTAs) to start
        measuring which clicks lead to bookings.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-tertiary">
            <th className="px-4 py-2 font-medium">Target</th>
            <th className="px-4 py-2 text-right font-medium">Total clicks</th>
            <th className="px-4 py-2 text-right font-medium">Unique sessions</th>
            <th className="px-4 py-2 text-right font-medium">Converted</th>
            <th className="px-4 py-2 text-right font-medium">Conversion rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.target} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2.5">
                <code className="rounded bg-card px-1.5 py-0.5 text-xs text-ink-secondary ring-1 ring-line">
                  {r.target}
                </code>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                {formatNumber(r.totalClicks)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                {formatNumber(r.uniqueSessions)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                {formatNumber(r.convertedSessions)}
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${rateTone(r.conversionRate)}`}>
                {r.conversionRate == null ? "—" : formatPercent(r.conversionRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
