// UTM link generation for content pieces.
//
// One source of truth shared by the write side (the create action stamps these
// params onto the link) and the read side (the Content Library matches
// TrackingEvents on `utm_content`). Keeping `utmContentFor` here means the key
// written into a link can never drift from the key used to count its events.

/**
 * Normalises a user-entered destination URL. Adds an `https://` scheme when one
 * is missing and rejects anything that isn't a valid http(s) URL. Returns the
 * canonical URL string, or `null` when the input can't be used.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Turns a content title into a URL-safe campaign slug:
 * "Summer Sale — 20% Off!" -> "summer-sale-20-off".
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accent/diacritic marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens (incl. any left by slice)
  return slug || "untitled";
}

/** Prefix that marks a `utm_content` value as one of our content pieces. */
export const UTM_CONTENT_PREFIX = "ht-";

/** The `utm_content` value for a content piece: `ht-<contentPieceId>`. */
export function utmContentFor(contentPieceId: string): string {
  return `${UTM_CONTENT_PREFIX}${contentPieceId}`;
}

/**
 * Builds the UTM-tagged link for a content piece.
 *
 *   utm_source   = platform        (e.g. instagram)
 *   utm_medium   = contentType     (e.g. paid_ad)
 *   utm_campaign = slug of title
 *   utm_content  = ht-<contentPieceId>
 *   utm_term     = agencyId
 *
 * `destinationUrl` must already be normalised (see {@link normalizeUrl}); any
 * existing query string or hash on it is preserved.
 */
export function buildUtmLink(opts: {
  destinationUrl: string;
  source: string; // platform
  medium: string; // contentType
  title: string;
  contentPieceId: string;
  agencyId: string;
}): string {
  const url = new URL(opts.destinationUrl);
  url.searchParams.set("utm_source", opts.source);
  url.searchParams.set("utm_medium", opts.medium);
  url.searchParams.set("utm_campaign", slugify(opts.title));
  url.searchParams.set("utm_content", utmContentFor(opts.contentPieceId));
  url.searchParams.set("utm_term", opts.agencyId);
  return url.toString();
}
