import { formatCurrency } from "@/lib/format";

// Budget Status card for the hotel dashboard KPI area. Pure presentation; the
// caller passes a serializable status (or null to hide). Four states with the
// colour + copy from the spec.

type BudgetState = "within" | "warning" | "critical" | "over";

export type BudgetCardStatus = {
  spendPaise: number;
  budgetPaise: number;
  pct: number;
  state: BudgetState;
};

const inr = (paise: number) => formatCurrency(Math.round(paise) / 100);

const BAR: Record<BudgetState, string> = {
  within: "bg-success",
  warning: "bg-warning",
  critical: "bg-orange-500",
  over: "bg-danger",
};
const ACCENT: Record<BudgetState, string> = {
  within: "border-success/40",
  warning: "border-warning/50",
  critical: "border-orange-500/50",
  over: "border-danger/60",
};
const HEADLINE: Record<BudgetState, { text: string; cls: string }> = {
  within: { text: "Within budget", cls: "text-success" },
  warning: { text: "⚠ 80% reached", cls: "text-warning" },
  critical: { text: "⚠⚠ 90% reached", cls: "text-orange-500" },
  over: { text: "🚨 Budget exceeded", cls: "text-danger" },
};

export function BudgetStatusCard({ status }: { status: BudgetCardStatus }) {
  const pct = Math.round(status.pct);
  const head = HEADLINE[status.state];
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${ACCENT[status.state]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          Budget status
        </p>
        <span className="text-[11px] font-semibold tabular-nums text-ink-tertiary">{pct}%</span>
      </div>
      <p className={`mt-2 text-lg font-bold leading-tight ${head.cls}`}>{head.text}</p>
      <p className="mt-1 text-sm tabular-nums text-ink-secondary">
        {inr(status.spendPaise)} of {inr(status.budgetPaise)}
        {status.state === "over" && <span className="text-ink-tertiary"> ({pct}%)</span>}
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line-strong">
        <div
          className={`h-full rounded-full ${BAR[status.state]}`}
          style={{ width: `${Math.min(100, Math.max(2, status.pct))}%` }}
        />
      </div>
    </div>
  );
}
