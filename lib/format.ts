// Shared display formatters for the dashboard (used by both the server page and
// the client table/chart, so they live in a plain module).

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-US");

/** "$1,234" — whole dollars, for headline figures. */
export function formatCurrency(value: number): string {
  return USD.format(value);
}

/** "$1,234.56" — cents precision, for per-unit figures like cost/booking. */
export function formatCurrencyCents(value: number): string {
  return USD_CENTS.format(value);
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
