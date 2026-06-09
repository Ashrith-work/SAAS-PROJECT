import "server-only";

import { prisma } from "@/lib/prisma";

// Monthly ad-budget tracking. Budgets and spend are handled in PAISE (integer)
// so the maths never drifts; AdSnapshot.spend is stored in rupees (Decimal), so
// calculateMonthlyAdSpend converts ×100 on the way out.

export const BUDGET_THRESHOLDS = [80, 90, 100] as const;
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number];

/** Clamp a reset day into the safe 1–28 range (every month has those days). */
export function clampResetDay(day: number): number {
  return Math.min(28, Math.max(1, Math.trunc(day) || 1));
}

/** Rupees for a paise amount (for formatCurrency, which expects rupees). */
export const rupeesFromPaise = (paise: number): number => Math.round(paise) / 100;
/** Paise for a whole-rupee amount entered in the UI. */
export const paiseFromRupees = (rupees: number): number => Math.round(rupees * 100);

/**
 * The current budget-month window for a reset day. With resetDay=1 it's the
 * calendar month; with resetDay=5 and today June 15 it's June 5 → July 4. The
 * monthKey is the YYYY-MM of the window's START.
 */
export function budgetMonthBounds(
  resetDay: number,
  now: Date = new Date(),
): { start: Date; end: Date; monthKey: string } {
  const d = clampResetDay(resetDay);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // The window starts on the most recent reset day on/before today.
  let startY = y;
  let startM = m;
  if (now.getUTCDate() < d) {
    startM = m - 1;
    if (startM < 0) {
      startM = 11;
      startY = y - 1;
    }
  }
  const start = new Date(Date.UTC(startY, startM, d, 0, 0, 0, 0));
  const nextStart = new Date(Date.UTC(startY, startM + 1, d, 0, 0, 0, 0));
  const end = new Date(nextStart.getTime() - 1); // 23:59:59.999 the day before the next reset
  const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, monthKey };
}

/**
 * Total ad spend for a hotel's CURRENT budget month, in paise. Sums AdSnapshot
 * spend from the window start up to today (never future dates), excluding
 * archived rows (old ad-account data). Scoped by agencyId (multi-tenancy).
 */
export async function calculateMonthlyAdSpend(args: {
  agencyId: string;
  hotelClientId: string;
  resetDay: number;
  now?: Date;
}): Promise<number> {
  const now = args.now ?? new Date();
  const { start } = budgetMonthBounds(args.resetDay, now);
  const agg = await prisma.adSnapshot.aggregate({
    where: {
      agencyId: args.agencyId,
      hotelClientId: args.hotelClientId,
      archived: false,
      date: { gte: start, lte: now },
    },
    _sum: { spend: true },
  });
  return paiseFromRupees(Number(agg._sum.spend ?? 0));
}

export type BudgetState = "within" | "warning" | "critical" | "over";

export type BudgetStatus = {
  budgetPaise: number;
  spendPaise: number;
  /** Spend as a percentage of budget (can exceed 100). */
  pct: number;
  state: BudgetState;
  monthKey: string;
  periodStart: Date;
  periodEnd: Date;
  /** Next threshold not yet crossed (80/90/100), or null once at/over 100%. */
  nextThreshold: BudgetThreshold | null;
  /** Paise of additional spend needed to reach nextThreshold (null at ≥100%). */
  remainingToNextPaise: number | null;
};

export function stateForPct(pct: number): BudgetState {
  if (pct >= 100) return "over";
  if (pct >= 90) return "critical";
  if (pct >= 80) return "warning";
  return "within";
}

/**
 * Full budget status for one hotel (spend, %, state, next threshold). Returns
 * null when tracking is off or no budget is set — callers hide the UI then.
 */
export async function getBudgetStatus(
  hotel: {
    id: string;
    agencyId: string;
    budgetTrackingEnabled: boolean;
    monthlyAdBudget: number | null;
    budgetResetDay: number;
  },
  now: Date = new Date(),
): Promise<BudgetStatus | null> {
  if (!hotel.budgetTrackingEnabled || hotel.monthlyAdBudget == null || hotel.monthlyAdBudget <= 0) {
    return null;
  }
  const { start, end, monthKey } = budgetMonthBounds(hotel.budgetResetDay, now);
  const spendPaise = await calculateMonthlyAdSpend({
    agencyId: hotel.agencyId,
    hotelClientId: hotel.id,
    resetDay: hotel.budgetResetDay,
    now,
  });
  const budgetPaise = hotel.monthlyAdBudget;
  const pct = budgetPaise > 0 ? (spendPaise / budgetPaise) * 100 : 0;
  const nextThreshold = BUDGET_THRESHOLDS.find((t) => pct < t) ?? null;
  const remainingToNextPaise =
    nextThreshold != null
      ? Math.max(0, Math.ceil((nextThreshold / 100) * budgetPaise) - spendPaise)
      : null;
  return {
    budgetPaise,
    spendPaise,
    pct,
    state: stateForPct(pct),
    monthKey,
    periodStart: start,
    periodEnd: end,
    nextThreshold,
    remainingToNextPaise,
  };
}
