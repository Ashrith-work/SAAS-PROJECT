// Shared Recharts styling — the single source of truth for chart chrome so every
// chart stays visually consistent and in sync with the design tokens in
// globals.css. Recharts needs literal color strings in JS props (it can't read
// Tailwind utilities / CSS vars), so these mirror the @theme --color-* values:
//
//   axisTick  #9ca3af  → --color-ink-tertiary
//   grid/axis #1f2937  → --color-line
//   tooltip border #374151 → --color-line-strong
//   tooltip bg #1f2937 → --color-elevated
//   tooltip text #f9fafb → --color-ink
//   pie stroke #111827 → --color-card
//
// If a token value changes in globals.css, update the matching value here too.

export const CHART_AXIS_TICK = "#9ca3af"; // ink-tertiary
export const CHART_GRID = "#1f2937"; // line
export const CHART_AXIS_LINE = "#1f2937"; // line
export const CHART_LABEL = "#d1d5db"; // ink-secondary
export const CHART_PIE_STROKE = "#111827"; // card (segment separators)
export const CHART_CURSOR = "rgba(255,255,255,0.06)"; // hover band

// Refined floating tooltip — rounded to the input/button radius (10px) with a
// soft elevation shadow, matching --shadow-float. Sits on the elevated surface
// with a line-strong border and primary ink text. Uses CSS-var references
// (resolved at runtime via inline style) so the tooltip follows light/dark.
export const CHART_TOOLTIP = {
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  backgroundColor: "var(--elevated)",
  color: "var(--ink)",
  fontSize: 12,
  boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
} as const;

// Brand & semantic series colors (mirror the --color-* accent tokens). Recharts
// needs one literal per series (it can't read the per-theme CSS vars), so these
// use values that stay legible on both the light and dark card surfaces.
export const SERIES = {
  brand: "#4d8df0", // --brand (dark value: reads on white and on navy cards)
  accent: "#c8a230", // --accent (gold — the single accent)
  success: "#1e8e5a", // --success (positive / up)
  warning: "#f59e0b",
  danger: "#c0392b", // --danger (negative / down)
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
  cyan: "#06b6d4",
  lime: "#84cc16",
  green: "#22c55e",
} as const;

// Categorical palette for multi-series charts (hotels, sources) — leads with the
// brand/accent/semantic colors before cycling through the extended hues.
export const CHART_PALETTE = [
  SERIES.accent,
  SERIES.success,
  SERIES.brand,
  SERIES.warning,
  SERIES.pink,
  SERIES.cyan,
  SERIES.lime,
  SERIES.indigo,
];
