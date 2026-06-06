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

/** "₹1,23,456" — whole rupees, for headline figures. */
export function formatCurrency(value: number): string {
  return INR.format(value);
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
