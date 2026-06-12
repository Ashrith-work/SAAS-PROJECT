// UTM normalization — the single source of truth so every revenue/attribution
// query groups the same raw UTM values into the same buckets. Pure, no DB, no
// "server-only", so the API route, the aggregation, and the tests all share it.
//
// Rules (Revenue by Source, Part 2):
//   • lower-case + trim every value
//   • empty / null SOURCE  → "direct"
//   • empty / null MEDIUM or CAMPAIGN → "none"  (so "direct/none" reads cleanly)
//   • collapse common source spellings via SOURCE_ALIASES below
//
// To add a new alias, add a lower-cased entry to SOURCE_ALIASES (left = raw value
// as it appears in a UTM, right = the canonical source it should fold into).

/** Source assigned to a conversion with no utm_source (a direct visit). */
export const DIRECT_SOURCE = "direct";
/** Placeholder for an empty medium/campaign so grouped keys stay readable. */
export const NONE = "none";

// Raw source value (already lower-cased + trimmed) → canonical source.
export const SOURCE_ALIASES: Record<string, string> = {
  ig: "instagram",
  insta: "instagram",
  "instagram.com": "instagram",
  fb: "facebook",
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  gads: "google",
  googleads: "google",
  "google ads": "google",
  adwords: "google",
  "google.com": "google",
  yt: "youtube",
  wa: "whatsapp",
};

function clean(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Canonical source: lower/trim, empty → "direct", then fold known aliases. */
export function normalizeSource(raw: string | null | undefined): string {
  const v = clean(raw);
  if (!v) return DIRECT_SOURCE;
  return SOURCE_ALIASES[v] ?? v;
}

/** Canonical medium: lower/trim, empty → "none". */
export function normalizeMedium(raw: string | null | undefined): string {
  return clean(raw) || NONE;
}

/** Canonical campaign: lower/trim, empty → "none". */
export function normalizeCampaign(raw: string | null | undefined): string {
  return clean(raw) || NONE;
}
