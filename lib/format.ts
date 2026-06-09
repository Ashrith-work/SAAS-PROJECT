// Shared display formatters for the dashboard (used by both the server page and
// the client table/chart, so they live in a plain module).

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-IN");

/**
 * "₹1,23,456" — whole rupees, for headline figures. Pass `{ compact: true }`
 * for the lakhs/crores short form ("₹7.6L") in space-constrained spots.
 */
export function formatCurrency(
  value: number,
  options?: { compact?: boolean },
): string {
  return options?.compact ? compactINR(value) : INR.format(value);
}

/** "₹1,234.56" — paise precision, for per-unit figures like cost/booking. */
export function formatCurrencyCents(value: number): string {
  return INR_PAISE.format(value);
}

/** "1,234" — grouped integer. */
export function formatNumber(value: number): string {
  return NUM.format(Math.round(value));
}

/** A ratio (1.0 = 100%) as a percent string, e.g. 0.042 -> "4.2%". */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** A ROAS multiple, e.g. 3.2 -> "3.2×". Pass null for "—". */
export function formatMultiple(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}×`;
}

// ── Compact Indian currency ──────────────────────────────────────────────────
// Lakhs/crores short form for tight UI (KPI cards, cramped column grids) where
// the full grouped value (₹7,63,744) would overflow. Always show the full value
// in a title/tooltip alongside — see formatCurrency.
function compactINR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const v = Math.abs(amount);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5)}L`;
  if (v >= 1e3) return `${sign}₹${trim(v / 1e3)}K`;
  return `${sign}₹${NUM.format(Math.round(v))}`;
}

/**
 * Canonical Indian-rupee formatter. Default is the full grouped form
 * ("₹7,63,744"); `{ compact: true }` gives the lakhs/crores short form
 * ("₹7.6L", "₹1.2Cr") for space-constrained spots.
 */
export function formatINR(amount: number, options?: { compact?: boolean }): string {
  return options?.compact ? compactINR(amount) : INR.format(amount);
}

/** Shorthand for formatINR(value, { compact: true }) — "₹7.6L", "₹1.2Cr". */
export function formatCurrencyCompact(value: number): string {
  return compactINR(value);
}

/** Compact Indian count (no ₹) for tight columns — "4,521", "12.3L", "1.2Cr". */
export function formatNumberCompact(value: number): string {
  const v = Math.round(value);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (v >= 1e7) return `${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${trim(v / 1e5)}L`;
  return NUM.format(v);
}

/**
 * Tailwind font-size class for a big KPI/metric number, scaled down as the
 * string gets longer so long values never truncate or overflow their card.
 * Caps at 32px per the dashboard type scale.
 */
export function kpiValueSizeClass(text: string): string {
  const n = text.length;
  if (n <= 6) return "text-[32px]";
  if (n <= 9) return "text-[26px]";
  return "text-[22px]";
}
