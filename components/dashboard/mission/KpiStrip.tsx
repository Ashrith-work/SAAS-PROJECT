// Mission-control KPI strip — auto-fitting cards, big number + small label +
// % change vs the previous period. Dark theme, pure presentation. The big
// number auto-scales by length and the card grid grows to fit, so long
// Indian-formatted values (₹7,63,744) never truncate or overlap.

import { kpiValueSizeClass } from "@/lib/format";

export type KpiCardSpec = {
  label: string;
  /** Preformatted value (₹ / number / "3.2×" / "12%"). The number is the hero. */
  value: string;
  /** Full/exact value shown on hover when `value` is a compact form (₹7.6L). */
  title?: string;
  /** Fractional change vs previous period (0.12 = +12%). null hides the badge. */
  delta: number | null;
  /** Up is good (revenue, bookings). false for cost metrics where down is good. */
  goodWhenUp?: boolean;
  /** Override the big-number color (e.g. ROAS green/amber/red). */
  valueClassName?: string;
  hint?: string;
};

function DeltaBadge({ delta, goodWhenUp = true }: { delta: number; goodWhenUp?: boolean }) {
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
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {arrow} {Math.abs(delta * 100).toFixed(1)}%
    </span>
  );
}

function KpiCard({ spec }: { spec: KpiCardSpec }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          {spec.label}
        </p>
        {spec.delta != null && <DeltaBadge delta={spec.delta} goodWhenUp={spec.goodWhenUp} />}
      </div>
      <p
        title={spec.title ?? spec.value}
        className={`mt-2 font-bold leading-[1.1] tracking-tight tabular-nums break-words ${kpiValueSizeClass(
          spec.value,
        )} ${spec.valueClassName ?? "text-ink"}`}
      >
        {spec.value}
      </p>
      {spec.hint && <p className="mt-1 text-[11px] text-ink-disabled">{spec.hint}</p>}
    </div>
  );
}

export function KpiStrip({ cards }: { cards: KpiCardSpec[] }) {
  // auto-fit: each card is ≥180px and grows to fill the row, wrapping to a new
  // line rather than squeezing/truncating when there isn't room for all six.
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      {cards.map((c) => (
        <KpiCard key={c.label} spec={c} />
      ))}
    </div>
  );
}
