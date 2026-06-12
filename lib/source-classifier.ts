import { normalizeSource, normalizeMedium, DIRECT_SOURCE } from "./utm-normalize";

// Source-type classification — folds a conversion's UTM data into one coarse
// marketing category, used for the dashboard's quick-filter chips ("Meta Ads",
// "Influencer", …). The raw + normalized UTM is still preserved for the granular
// table; this is purely the bucket the chips filter on. Pure + deterministic.
//
// To add a new source type: add it to SOURCE_TYPES + SOURCE_TYPE_LABEL, then add
// a branch to classifySourceType BEFORE the `other` fallback. To recognise more
// influencer links, extend INFLUENCER_CONTENT_PATTERNS.

export const SOURCE_TYPES = [
  "meta_ads",
  "google_ads",
  "instagram_organic",
  "facebook_organic",
  "influencer",
  "email",
  "whatsapp",
  "direct",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  instagram_organic: "Instagram Organic",
  facebook_organic: "Facebook Organic",
  influencer: "Influencer",
  email: "Email",
  whatsapp: "WhatsApp",
  direct: "Direct",
  other: "Other",
};

export function isSourceType(v: unknown): v is SourceType {
  return typeof v === "string" && (SOURCE_TYPES as readonly string[]).includes(v);
}

// A medium is "paid" if it looks like an ad medium (cpc / paid / ads / ppc).
const PAID_MEDIUM = /(cpc|paid|ppc|ads?)/;
function isPaidMedium(medium: string): boolean {
  return PAID_MEDIUM.test(medium);
}

// utm_content values that indicate an influencer collaboration. Extend as needed
// (e.g. add /^@/ if you tag influencer handles, or specific creator slugs).
const INFLUENCER_CONTENT_PATTERNS: RegExp[] = [/^inf[_-]/, /influencer/];
function contentLooksInfluencer(content: string | null | undefined): boolean {
  const v = (content ?? "").trim().toLowerCase();
  if (!v) return false;
  return INFLUENCER_CONTENT_PATTERNS.some((re) => re.test(v));
}

export type ClassifiableUtm = {
  utmSource: string | null | undefined;
  utmMedium: string | null | undefined;
  utmContent?: string | null | undefined;
};

/**
 * Classify a conversion's UTM into a SourceType. Deterministic; branches are
 * ordered most-specific first so the result is stable.
 */
export function classifySourceType(utm: ClassifiableUtm): SourceType {
  const source = normalizeSource(utm.utmSource);
  const medium = normalizeMedium(utm.utmMedium);

  // No source at all → direct (checked first; nothing else can apply).
  if (source === DIRECT_SOURCE) return "direct";

  const paid = isPaidMedium(medium);

  // Paid social / search.
  if ((source === "facebook" || source === "instagram") && paid) return "meta_ads";
  if (source === "google" && paid) return "google_ads";

  // Influencer (an explicit influencer medium, or an influencer-tagged content).
  if (medium === "influencer" || contentLooksInfluencer(utm.utmContent)) return "influencer";

  // Organic social (non-paid).
  if (source === "instagram") return "instagram_organic";
  if (source === "facebook") return "facebook_organic";

  // Owned channels.
  if (source === "email" || source === "newsletter") return "email";
  if (source === "whatsapp") return "whatsapp";

  return "other";
}
