// Owner-summary templates (Part 3) — 4 patterns × 3 periods + a shared no_data
// template. Pure: no DB. The {placeholder} tokens are filled with formatted
// values; the {ifX: '...'} tokens are kept only when flag X is true (and their
// inner placeholders are then filled too). Honest tone — declines are named, but
// every line ends with what's working or what to do next.

export type Pattern = "strong" | "flat_or_slight_decline" | "significant_decline" | "no_data";
export type Period = "1d" | "7d" | "30d";

export type TemplateContext = {
  values: Record<string, string | number>;
  flags: Record<string, boolean>;
};

/**
 * Render a template: drop/keep {ifX:'…'} blocks by flag X (X is matched
 * case-insensitively on its first letter), then substitute {placeholder} tokens,
 * then tidy whitespace + stray spaces before punctuation.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  const conditional = template.replace(/\{if([A-Za-z]+):\s*'([^']*)'\}/g, (_m, name: string, inner: string) => {
    const key = name.charAt(0).toLowerCase() + name.slice(1);
    return ctx.flags[key] ? inner : "";
  });
  const filled = conditional.replace(/\{(\w+)\}/g, (_m, key: string) =>
    key in ctx.values ? String(ctx.values[key]) : "",
  );
  // Collapse runs of whitespace, drop a stray space before sentence punctuation
  // (but NOT before an em-dash — that keeps its surrounding spaces), and fix the
  // "1 bookings" singular.
  return filled
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\b1 bookings\b/g, "1 booking")
    .trim();
}

export const NO_DATA_TEMPLATE =
  "No tracked bookings in this period yet. Make sure the HotelTrack snippet is installed on your hotel's website and visitors are completing bookings. Once data starts flowing, summaries will appear here automatically.";

// pattern → period → template.
export const TEMPLATES: Record<Exclude<Pattern, "no_data">, Record<Period, string>> = {
  strong: {
    "1d":
      "Yesterday brought {revenue} across {bookings} bookings. {topSource} was the top source.{ifAdSpend: ' ROAS for the day was {roas}.'} A good day to build on.",
    "7d":
      "Last 7 days were strong — {revenue} across {bookings} bookings{ifComparison: ', up {revenueChangePct}% from the week before'}. {topSource} drove your top revenue ({topSourceRevenue} from {topSourceBookings} bookings).{ifInfluencerActive: ' {influencerName} added {influencerRevenue}.'} Keep doing what's working.",
    "30d":
      "Last 30 days hit {revenue} across {bookings} bookings{ifComparison: ', up {revenueChangePct}% from the previous month'}. {topSource} led at {topSourceRevenue}.{ifSavings: ' Your direct bookings saved approximately {savings} in OTA commissions.'} Solid month.",
  },
  flat_or_slight_decline: {
    "1d":
      "Yesterday brought {revenue} across {bookings} bookings, a quieter day. {topSource} still contributed. Tomorrow's a fresh start.",
    "7d":
      "Last 7 days brought {revenue} across {bookings} bookings, slightly below the previous week's {previousRevenue}.{ifAvgValueShown: ' The good news: average booking value is {avgValueChangeDirection} {avgValueChangePctAbs}% — guests are spending {moreOrLess} per stay.'} Focus on driving traffic volume next week.",
    "30d":
      "Last 30 days totaled {revenue} across {bookings} bookings, slightly below the previous month. Average booking value held steady at {avgBookingValue}. Consider testing new ad creatives or influencer partnerships for next month.",
  },
  significant_decline: {
    "1d":
      "Yesterday was slow — {bookings} bookings.{ifZero: ' No bookings tracked.'} Single-day variation is normal — the 7-day view shows the bigger picture.",
    "7d":
      "Last 7 days were quiet — {bookings} bookings worth {revenue}, well below the recent average.{ifTrafficSteady: ' Direct traffic was steady, suggesting demand exists but conversions slipped.'}{ifInfluencerActive: ' Your influencer partnerships still drove {influencerRevenue}.'} Worth reviewing the booking flow.",
    "30d":
      "Last 30 days totaled {revenue} across {bookings} bookings, well below the prior month.{ifTopSourceStillStrong: ' {topSource} continued to perform with {topSourceRevenue}.'} Time to review what changed — ad performance, seasonality, or website conversions.",
  },
};

export function templateFor(pattern: Pattern, period: Period): string {
  if (pattern === "no_data") return NO_DATA_TEMPLATE;
  return TEMPLATES[pattern][period];
}
