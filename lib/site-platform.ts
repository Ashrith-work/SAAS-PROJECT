// The hotel website's platform. Drives which install guide we show on
// /agency/hotel/[id]/install. Kept as a String column on HotelClient (not an
// enum) so the list can grow without a schema migration — see schema.prisma.

export const SITE_PLATFORMS = ["wordpress", "shopify", "other"] as const;
export type SitePlatform = (typeof SITE_PLATFORMS)[number];

export const SITE_PLATFORM_LABELS: Record<SitePlatform, string> = {
  wordpress: "WordPress",
  shopify: "Shopify",
  other: "Other / custom site",
};

// Coerce any stored/submitted value to a known platform, defaulting to "other".
export function normalizeSitePlatform(value: string | null | undefined): SitePlatform {
  return SITE_PLATFORMS.includes((value ?? "") as SitePlatform)
    ? (value as SitePlatform)
    : "other";
}
