import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant-scope";

// Aggregates a hotel's Ga4Snapshot rows (last 30 days) into the shape the
// dashboard's "Website Traffic" section renders. Always scoped by agencyId +
// hotelClientId. `trackedSessions` (HotelTrack snippet sessions, or null in
// pixel mode) is passed in by the page for the cross-validation card.

type NamedSessions = { name: string; sessions: number };
type PathSessions = { path: string; sessions: number };

export type Ga4Dashboard = {
  connected: boolean;
  propertyName: string | null;
  lastSyncedAt: string | null;
  days: number; // snapshot days available
  sessions: number;
  users: number;
  pageViews: number;
  avgSessionDuration: number; // seconds (weighted)
  bounceRate: number; // 0..1 (weighted)
  channels: { organic: number; paid: number; social: number; direct: number; referral: number };
  ads: { clicks: number; impressions: number; cost: number; conversions: number } | null;
  topCountries: NamedSessions[];
  topCities: NamedSessions[];
  topLandingPages: PathSessions[];
  device: { mobile: number; desktop: number; tablet: number };
  /** HotelTrack snippet sessions over the same window; null in pixel mode. */
  trackedSessions: number | null;
};

function mergeTop<T extends Record<string, unknown>>(
  lists: T[][],
  key: keyof T,
  limit: number,
): T[] {
  const acc = new Map<string, number>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const k = String(item[key] ?? "");
      const s = Number((item as Record<string, unknown>).sessions ?? 0) || 0;
      if (k) acc.set(k, (acc.get(k) ?? 0) + s);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, s]) => ({ [key]: k, sessions: s }) as unknown as T);
}

export async function loadGa4Dashboard(args: {
  agencyId: string;
  hotelId: string;
  since: Date;
  until: Date;
  trackedSessions: number | null;
}): Promise<Ga4Dashboard> {
  const { agencyId, hotelId, since, until, trackedSessions } = args;
  const scoped = <D>(m: D) => agencyScopedFor(agencyId, m);

  const conn = await scoped(prisma.ga4Connection).findFirst({
    where: { hotelClientId: hotelId },
    select: { status: true, propertyName: true, propertyId: true, lastSyncedAt: true },
  });
  const connected = !!conn && conn.propertyId !== "" && conn.status !== "REVOKED";

  const base: Ga4Dashboard = {
    connected,
    propertyName: conn?.propertyName ?? null,
    lastSyncedAt: conn?.lastSyncedAt?.toISOString() ?? null,
    days: 0,
    sessions: 0, users: 0, pageViews: 0, avgSessionDuration: 0, bounceRate: 0,
    channels: { organic: 0, paid: 0, social: 0, direct: 0, referral: 0 },
    ads: null,
    topCountries: [], topCities: [], topLandingPages: [],
    device: { mobile: 0, desktop: 0, tablet: 0 },
    trackedSessions,
  };
  if (!connected) return base;

  const snaps = await scoped(prisma.ga4Snapshot).findMany({
    where: { hotelClientId: hotelId, date: { gte: since, lte: until } },
    orderBy: { date: "asc" },
  });
  if (snaps.length === 0) return base;

  let durWeighted = 0;
  let bounceWeighted = 0;
  let adsClicks = 0, adsImpr = 0, adsCost = 0, adsConv = 0, hasAds = false;
  const countryLists: NamedSessions[][] = [];
  const cityLists: NamedSessions[][] = [];
  const landingLists: PathSessions[][] = [];

  for (const s of snaps) {
    base.sessions += s.sessions;
    base.users += s.users;
    base.pageViews += s.pageViews;
    durWeighted += s.avgSessionDuration * s.sessions;
    bounceWeighted += s.bounceRate * s.sessions;
    base.channels.organic += s.organicSessions;
    base.channels.paid += s.paidSessions;
    base.channels.social += s.socialSessions;
    base.channels.direct += s.directSessions;
    base.channels.referral += s.referralSessions;
    base.device.mobile += s.mobileSessions;
    base.device.desktop += s.desktopSessions;
    base.device.tablet += s.tabletSessions;
    if (s.googleAdsClicks != null || s.googleAdsImpressions != null || s.googleAdsCost != null) {
      hasAds = true;
      adsClicks += s.googleAdsClicks ?? 0;
      adsImpr += s.googleAdsImpressions ?? 0;
      adsCost += s.googleAdsCost ?? 0;
      adsConv += s.googleAdsConversions ?? 0;
    }
    countryLists.push((s.topCountries as NamedSessions[]) ?? []);
    cityLists.push((s.topCities as NamedSessions[]) ?? []);
    landingLists.push((s.topLandingPages as PathSessions[]) ?? []);
  }

  base.days = snaps.length;
  base.avgSessionDuration = base.sessions > 0 ? Math.round(durWeighted / base.sessions) : 0;
  base.bounceRate = base.sessions > 0 ? bounceWeighted / base.sessions : 0;
  base.ads = hasAds ? { clicks: adsClicks, impressions: adsImpr, cost: adsCost, conversions: adsConv } : null;
  base.topCountries = mergeTop(countryLists, "name", 5);
  base.topCities = mergeTop(cityLists, "name", 5);
  base.topLandingPages = mergeTop(landingLists, "path", 5);
  return base;
}
