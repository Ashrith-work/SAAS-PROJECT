"use client";

import { useActionState, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { saveBudgetSettings, type BudgetSettingsState } from "./budget-actions";

type BudgetState = "within" | "warning" | "critical" | "over";

export type BudgetStatusView = {
  spendPaise: number;
  budgetPaise: number;
  pct: number;
  state: BudgetState;
  nextThreshold: number | null;
  remainingToNextPaise: number | null;
};

const initial: BudgetSettingsState = { error: null, ok: false };

// Progress-bar fill colour by budget state.
export const BAR_COLOR: Record<BudgetState, string> = {
  within: "bg-success",
  warning: "bg-warning",
  critical: "bg-orange-500",
  over: "bg-danger",
};

const inr = (paise: number) => formatCurrency(Math.round(paise) / 100);

export function BudgetProgressBar({ pct, state }: { pct: number; state: BudgetState }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line-strong">
      <div
        className={`h-full rounded-full transition-all ${BAR_COLOR[state]}`}
        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
      />
    </div>
  );
}

export function BudgetTracking({
  hotelId,
  enabled,
  budgetRupees,
  resetDay,
  status,
}: {
  hotelId: string;
  enabled: boolean;
  budgetRupees: number | null;
  resetDay: number;
  status: BudgetStatusView | null;
}) {
  const [state, action, pending] = useActionState(saveBudgetSettings, initial);
  const [on, setOn] = useState(enabled);
  const [budget, setBudget] = useState(budgetRupees != null ? String(budgetRupees) : "");
  const [day, setDay] = useState(String(resetDay));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="hotelId" value={hotelId} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Enable budget tracking</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">
            Track this hotel&apos;s monthly ad spend against a budget and alert at
            80%, 90%, and 100%.
          </p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            name="budgetTrackingEnabled"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-brand" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
        </label>
      </div>

      {on && (
        <div className="space-y-4 rounded-lg border border-line bg-page p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="monthlyAdBudgetRupees" className="block text-sm font-medium text-ink-secondary">
                Monthly ad budget (₹)
              </label>
              <input
                id="monthlyAdBudgetRupees"
                name="monthlyAdBudgetRupees"
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="200000"
                className="mt-1 w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="budgetResetDay" className="block text-sm font-medium text-ink-secondary">
                Budget resets on day
              </label>
              <select
                id="budgetResetDay"
                name="budgetResetDay"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Day {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {status && (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2 text-sm">
                <span className="text-ink-secondary">
                  Current month spend:{" "}
                  <span className="font-medium text-ink">{inr(status.spendPaise)}</span> of{" "}
                  <span className="font-medium text-ink">{inr(status.budgetPaise)}</span>
                </span>
                <span className="tabular-nums font-semibold text-ink">{Math.round(status.pct)}%</span>
              </div>
              <BudgetProgressBar pct={status.pct} state={status.state} />
              <p className="text-xs text-ink-tertiary">
                {status.nextThreshold != null
                  ? `Next alert at: ${status.nextThreshold}% (${inr(status.remainingToNextPaise ?? 0)} more spend)`
                  : "All thresholds (80/90/100%) reached this month."}
              </p>
            </div>
          )}
        </div>
      )}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save budget settings"}
        </button>
        {state.ok && <span className="text-xs text-success">Saved ✓</span>}
      </div>
    </form>
  );
}
