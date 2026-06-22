"use client";

import { formatCurrency, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import type { FunnelStage } from "@/lib/funnel";

// Funnel Analysis — a proportional funnel visual + per-stage stats + the top
// drop-off pages per stage. All data is computed server-side (agency-scoped) and
// passed serialized; this component only renders.
//
// The funnel is drawn with plain CSS bars (width ∝ visitors, centered so it reads
// as a narrowing funnel) rather than Recharts' FunnelChart, which renders blank
// inside a ResponsiveContainer in this stack.

export type FunnelStageView = {
  stage: FunnelStage;
  label: string;
  visitors: number;
  conversionFromPrev: number | null;
  dropOff: number;
  dropOffPct: number | null;
  avgTimeToNextMs: number | null;
};

export type FunnelView = {
  stages: FunnelStageView[];
  conversions: number;
  revenue: number;
  overallConversion: number | null;
  /** Top exit pages for sessions that dropped at each stage, keyed by stage. */
  dropOffPages: Record<string, { path: string; count: number }[]>;
};

// Stage colours (awareness → booking).
const STAGE_FILL: Record<FunnelStage, string> = {
  awareness: "#3b82f6",
  consideration: "#8b5cf6",
  intent: "#f59e0b",
  booking: "#22c55e",
};

export function FunnelAnalysis({ funnel }: { funnel: FunnelView }) {
  const awareness = funnel.stages[0]?.visitors ?? 0;

  if (awareness === 0) {
    return (
      <div className="rounded-xl border border-line bg-card px-4 py-10 text-center text-sm text-ink-tertiary">
        No funnel data in this range yet. Tag pages with{" "}
        <code className="text-xs">data-ht-stage</code> or add URL rules on the hotel&apos;s
        Integrations page, then visitors&apos; journeys will populate the funnel.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-6">
          <Metric label="Conversions" value={formatNumber(funnel.conversions)} />
          <Metric
            label="Overall conversion"
            value={funnel.overallConversion == null ? "—" : formatPercent(funnel.overallConversion)}
          />
          <Metric label="Revenue" value={formatCurrency(funnel.revenue, { compact: true })} title={formatCurrency(funnel.revenue)} />
        </div>
      </div>

      {/* Funnel visual — centered bars, width ∝ visitors (narrowing = funnel). */}
      <div className="space-y-2 py-1">
        {funnel.stages.map((s) => {
          // Min 6% so a small-but-nonzero stage still shows a visible sliver.
          const pct = awareness > 0 ? Math.max(6, (s.visitors / awareness) * 100) : 0;
          return (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-ink-tertiary">{s.label}</span>
              <div className="flex-1">
                <div
                  className="mx-auto flex h-9 min-w-[2.5rem] items-center justify-center rounded-md px-2 text-xs font-semibold text-white"
                  style={{ width: `${pct}%`, backgroundColor: STAGE_FILL[s.stage] }}
                  title={`${s.label}: ${formatNumber(s.visitors)} visitors`}
                >
                  {formatNumber(s.visitors)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-stage stats */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="ht-table w-full text-left text-sm">
          <thead className="bg-card text-xs uppercase tracking-wide text-ink-tertiary">
            <tr>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 text-right font-medium">Visitors</th>
              <th className="px-4 py-2 text-right font-medium">From previous</th>
              <th className="px-4 py-2 text-right font-medium">Drop-off</th>
              <th className="px-4 py-2 text-right font-medium">Avg time to next</th>
            </tr>
          </thead>
          <tbody>
            {funnel.stages.map((s) => (
              <tr key={s.stage} className="border-t border-line">
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_FILL[s.stage] }} />
                    {s.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatNumber(s.visitors)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {s.conversionFromPrev == null ? "—" : formatPercent(s.conversionFromPrev)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {s.dropOffPct == null ? (
                    "—"
                  ) : (
                    <span className={s.dropOffPct > 0.5 ? "text-danger" : "text-ink-secondary"}>
                      {formatNumber(s.dropOff)} ({formatPercent(s.dropOffPct)})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-tertiary">
                  {s.avgTimeToNextMs == null ? "—" : formatDuration(s.avgTimeToNextMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top drop-off pages */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          Top drop-off pages
        </p>
        <p className="mb-3 text-xs text-ink-tertiary">
          The pages visitors were on when they left, grouped by the stage they got stuck at —
          your bottlenecks.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {funnel.stages
            .filter((s) => (funnel.dropOffPages[s.stage]?.length ?? 0) > 0)
            .map((s) => (
              <div key={s.stage} className="rounded-xl border border-line bg-card p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_FILL[s.stage] }} />
                  Left at {s.label}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {funnel.dropOffPages[s.stage]!.map((p) => (
                    <li key={p.path} className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink-secondary" title={p.path}>{p.path}</span>
                      <span className="shrink-0 tabular-nums text-ink-tertiary">{formatNumber(p.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {funnel.stages.every((s) => (funnel.dropOffPages[s.stage]?.length ?? 0) === 0) && (
            <p className="text-sm text-ink-tertiary">No drop-off pages recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums" title={title}>{value}</p>
    </div>
  );
}
