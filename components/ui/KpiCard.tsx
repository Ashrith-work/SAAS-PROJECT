import type { ReactNode } from "react";

// Dashboard metric card — big number + label + optional delta badge.
// Dark theme. Shared shape so every KPI across the app reads the same.

export type KpiSpec = {
  label: string;
  /** Preformatted value (₹ / number / "3.2×" / "12%"). */
  value: ReactNode;
  /** Fractional change vs previous period (0.12 = +12%). null hides the badge. */
  delta?: number | null;
  /** Up is good (revenue, bookings). false for cost metrics where down is good. */
  goodWhenUp?: boolean;
  /** Override the big-number color (e.g. ROAS green/amber/red). */
  valueClassName?: string;
  hint?: string;
};

export function DeltaBadge({
  delta,
  goodWhenUp = true,
}: {
  delta: number;
  goodWhenUp?: boolean;
}) {
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.0005;
  const good = flat ? null : up === goodWhenUp;
  const cls = flat
    ? "bg-elevated text-ink-tertiary"
    : good
      ? "bg-success/15 text-success"
      : "bg-danger/15 text-danger";
  const arrow = flat ? "→" : up ? "↑" : "↓";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {arrow} {Math.abs(delta * 100).toFixed(1)}%
    </span>
  );
}

export function KpiCard({ spec }: { spec: KpiSpec }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {spec.label}
        </p>
        {spec.delta != null && (
          <DeltaBadge delta={spec.delta} goodWhenUp={spec.goodWhenUp} />
        )}
      </div>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl ${
          spec.valueClassName ?? "text-ink"
        }`}
      >
        {spec.value}
      </p>
      {spec.hint && <p className="mt-1 text-xs text-ink-disabled">{spec.hint}</p>}
    </div>
  );
}
