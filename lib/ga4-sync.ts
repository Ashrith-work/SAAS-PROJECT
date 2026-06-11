import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import { encryptWithAudit } from "@/lib/token-audit";
import {
  runReport,
  refreshAccessToken,
  GaAuthExpiredError,
  GaOAuthError,
  mask,
} from "@/lib/ga4";

// GA4 daily sync (OAuth). For each ACTIVE connection: refresh the access token if
// it's near expiry, pull the trailing 30 days across a handful of date-bucketed
// reports, and upsert one Ga4Snapshot per day. Resilient: one hotel's failure
// (or an expired token) never aborts the batch.
//
// Logs under [GA4-SYNC] / [GA4-TOKEN]; tokens are never logged in full.

const LOG = "[GA4-SYNC]";
const TLOG = "[GA4-TOKEN]";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pulls Google's machine error code (invalid_grant, invalid_client, …) out of a
// GaOAuthError message for structured logging + the reconnect banner. Falls back
// to a trimmed message when no known code is present.
function googleErrorCode(message: string): string {
  const m = message.match(
    /\b(invalid_grant|invalid_client|invalid_request|unauthorized_client|invalid_scope|access_denied)\b/,
  );
  return m ? m[1] : message.slice(0, 200);
}

// "20260608" → Date(UTC midnight). GA's `date` dimension is YYYYMMDD.
function gaDateToUtc(yyyymmdd: string): Date {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d));
}

type Conn = {
  id: string;
  agencyId: string;
  hotelClientId: string;
  propertyId: string;
  tokenExpiresAt: Date;
};

/**
 * Returns a usable access token, refreshing (and re-storing, encrypted) when the
 * current one is within 5 minutes of expiry. On refresh failure marks the
 * connection TOKEN_EXPIRED and rethrows.
 */
async function getValidAccessToken(conn: Conn): Promise<string> {
  if (conn.tokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    const tok = await getTokenForApiCall("ga4_access", conn.id, {
      agencyId: conn.agencyId,
      hotelClientId: conn.hotelClientId,
      source: "sync:ga4",
    });
    return tok.reveal();
  }

  console.log(`${TLOG} access token near/at expiry for conn ${conn.id} → refreshing`);
  const rt = await getTokenForApiCall("ga4_refresh", conn.id, {
    agencyId: conn.agencyId,
    hotelClientId: conn.hotelClientId,
    source: "refresh:ga4",
  });
  let refreshed: { accessToken: string; expiresAt: Date };
  try {
    refreshed = await refreshAccessToken(rt.reveal());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    const code = googleErrorCode(msg);
    // Refresh tokens are bound to the OAuth client that minted them; the usual
    // cause here is a GOOGLE_OAUTH_CLIENT_ID/SECRET change orphaning this token
    // (invalid_grant / invalid_client). Flag it for a one-click reconnect.
    console.error(
      "[GA4-OAUTH-FAILURE]",
      JSON.stringify({ hotelClientId: conn.hotelClientId, connId: conn.id, googleError: code, message: msg }),
    );
    await prisma.ga4Connection.update({
      where: { id: conn.id },
      data: {
        status: "TOKEN_EXPIRED",
        lastSyncError: `Token refresh failed: ${msg}`,
        requiresReconnect: true,
        lastErrorReason: code,
      },
    });
    throw err instanceof GaOAuthError ? err : new GaOAuthError(msg);
  }
  const enc = await encryptWithAudit(refreshed.accessToken, {
    agencyId: conn.agencyId,
    hotelClientId: conn.hotelClientId,
    tokenType: "ga4",
    source: "refresh:ga4",
  });
  await prisma.ga4Connection.update({
    where: { id: conn.id },
    data: {
      accessToken: enc,
      tokenExpiresAt: refreshed.expiresAt,
      status: "ACTIVE",
      requiresReconnect: false,
      lastErrorReason: null,
    },
  });
  console.log(`${TLOG} refreshed OK conn ${conn.id} (new token ${mask(refreshed.accessToken)}, exp ${refreshed.expiresAt.toISOString()})`);
  return refreshed.accessToken;
}

// Aggregation buckets, one per calendar day.
type DayBucket = {
  sessions: number; users: number; newUsers: number; pageViews: number;
  bounceRate: number; avgSessionDuration: number;
  organic: number; paid: number; social: number; direct: number; referral: number;
  adsClicks: number; adsImpressions: number; adsCost: number; adsConversions: number; hasAds: boolean;
  mobile: number; desktop: number; tablet: number;
  countries: Map<string, number>; cities: Map<string, number>; landing: Map<string, number>;
};

function emptyBucket(): DayBucket {
  return {
    sessions: 0, users: 0, newUsers: 0, pageViews: 0, bounceRate: 0, avgSessionDuration: 0,
    organic: 0, paid: 0, social: 0, direct: 0, referral: 0,
    adsClicks: 0, adsImpressions: 0, adsCost: 0, adsConversions: 0, hasAds: false,
    mobile: 0, desktop: 0, tablet: 0,
    countries: new Map(), cities: new Map(), landing: new Map(),
  };
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;
const topN = (m: Map<string, number>, n: number, key: "name" | "path") =>
  [...m.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, s]) => ({ [key]: k, sessions: s }));

function bucketOf(map: Map<string, DayBucket>, dateKey: string): DayBucket {
  let b = map.get(dateKey);
  if (!b) { b = emptyBucket(); map.set(dateKey, b); }
  return b;
}

// Map GA's sessionDefaultChannelGroup into the 5 dashboard buckets.
function addChannel(b: DayBucket, channel: string, sessions: number) {
  const c = channel.toLowerCase();
  if (c === "organic search") b.organic += sessions;
  else if (c === "paid search") b.paid += sessions;
  else if (c.includes("social")) b.social += sessions;
  else if (c === "direct") b.direct += sessions;
  else if (c === "referral") b.referral += sessions;
}

export type Ga4AccountSyncResult = {
  ok: boolean;
  daysSynced?: number;
  tokenExpired?: boolean;
  error?: string;
};

/** Syncs the trailing `days` (default 30) for one connection. Never throws. */
export async function syncGa4Connection(conn: Conn, days = 30): Promise<Ga4AccountSyncResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(conn);
  } catch (err) {
    return { ok: false, tokenExpired: true, error: err instanceof Error ? err.message : "token error" };
  }

  const startDate = `${days}daysAgo`;
  const endDate = "yesterday";
  const dateRanges = [{ startDate, endDate }];
  const run = (req: Parameters<typeof runReport>[2]) => runReport(accessToken, conn.propertyId, req);

  try {
    // Q1 traffic (per day), Q2 channels, Q4a country, Q4b device, Q4c city, Q5 landing.
    const [traffic, channels, countries, devices, cities, landing] = await Promise.all([
      run({ dateRanges, dimensions: [{ name: "date" }], metrics: [
        { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" },
        { name: "screenPageViews" }, { name: "bounceRate" }, { name: "averageSessionDuration" },
      ] }),
      run({ dateRanges, dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }] }),
      run({ dateRanges, dimensions: [{ name: "date" }, { name: "country" }], metrics: [{ name: "sessions" }] }),
      run({ dateRanges, dimensions: [{ name: "date" }, { name: "deviceCategory" }], metrics: [{ name: "sessions" }] }),
      run({ dateRanges, dimensions: [{ name: "date" }, { name: "city" }], metrics: [{ name: "sessions" }] }),
      run({ dateRanges, dimensions: [{ name: "date" }, { name: "landingPagePlusQueryString" }], metrics: [{ name: "sessions" }] }),
    ]);

    const byDate = new Map<string, DayBucket>();
    for (const r of traffic) {
      const b = bucketOf(byDate, r.dimensionValues[0].value);
      b.sessions = num(r.metricValues[0]?.value);
      b.users = num(r.metricValues[1]?.value);
      b.newUsers = num(r.metricValues[2]?.value);
      b.pageViews = num(r.metricValues[3]?.value);
      b.bounceRate = num(r.metricValues[4]?.value);
      b.avgSessionDuration = Math.round(num(r.metricValues[5]?.value));
    }
    for (const r of channels) addChannel(bucketOf(byDate, r.dimensionValues[0].value), r.dimensionValues[1]?.value ?? "", num(r.metricValues[0]?.value));
    for (const r of countries) {
      const b = bucketOf(byDate, r.dimensionValues[0].value);
      const c = r.dimensionValues[1]?.value || "(unknown)";
      b.countries.set(c, (b.countries.get(c) ?? 0) + num(r.metricValues[0]?.value));
    }
    for (const r of cities) {
      const b = bucketOf(byDate, r.dimensionValues[0].value);
      const c = r.dimensionValues[1]?.value || "(unknown)";
      b.cities.set(c, (b.cities.get(c) ?? 0) + num(r.metricValues[0]?.value));
    }
    for (const r of devices) {
      const b = bucketOf(byDate, r.dimensionValues[0].value);
      const d = (r.dimensionValues[1]?.value ?? "").toLowerCase();
      const s = num(r.metricValues[0]?.value);
      if (d === "mobile") b.mobile += s;
      else if (d === "desktop") b.desktop += s;
      else if (d === "tablet") b.tablet += s;
    }
    for (const r of landing) {
      const b = bucketOf(byDate, r.dimensionValues[0].value);
      const p = r.dimensionValues[1]?.value || "/";
      b.landing.set(p, (b.landing.get(p) ?? 0) + num(r.metricValues[0]?.value));
    }

    // Q3 Google Ads (best-effort: needs a Google Ads ↔ GA4 link; on error skip).
    try {
      const ads = await run({
        dateRanges, dimensions: [{ name: "date" }],
        metrics: [{ name: "advertiserAdClicks" }, { name: "advertiserAdImpressions" }, { name: "advertiserAdCost" }, { name: "conversions" }],
        dimensionFilter: { andGroup: { expressions: [
          { filter: { fieldName: "sessionSource", stringFilter: { value: "google" } } },
          { filter: { fieldName: "sessionMedium", stringFilter: { value: "cpc" } } },
        ] } },
      });
      for (const r of ads) {
        const b = bucketOf(byDate, r.dimensionValues[0].value);
        b.adsClicks = num(r.metricValues[0]?.value);
        b.adsImpressions = num(r.metricValues[1]?.value);
        b.adsCost = Math.round(num(r.metricValues[2]?.value) * 100); // currency → paise
        b.adsConversions = Math.round(num(r.metricValues[3]?.value));
        b.hasAds = b.adsClicks > 0 || b.adsImpressions > 0 || b.adsCost > 0;
      }
    } catch (err) {
      console.warn(`${LOG} Google Ads query skipped for ${conn.hotelClientId}: ${err instanceof Error ? err.message : err}`);
    }

    // Upsert one Ga4Snapshot per day.
    let daysSynced = 0;
    for (const [dateKey, b] of byDate) {
      const date = gaDateToUtc(dateKey);
      const data = {
        sessions: b.sessions, users: b.users, newUsers: b.newUsers, pageViews: b.pageViews,
        bounceRate: b.bounceRate, avgSessionDuration: b.avgSessionDuration,
        organicSessions: b.organic, paidSessions: b.paid, socialSessions: b.social,
        directSessions: b.direct, referralSessions: b.referral,
        googleAdsClicks: b.hasAds ? b.adsClicks : null,
        googleAdsImpressions: b.hasAds ? b.adsImpressions : null,
        googleAdsCost: b.hasAds ? b.adsCost : null,
        googleAdsConversions: b.hasAds ? b.adsConversions : null,
        mobileSessions: b.mobile, desktopSessions: b.desktop, tabletSessions: b.tablet,
        topCountries: topN(b.countries, 5, "name"),
        topCities: topN(b.cities, 5, "name"),
        topLandingPages: topN(b.landing, 10, "path"),
      };
      await prisma.ga4Snapshot.upsert({
        where: { hotelClientId_date: { hotelClientId: conn.hotelClientId, date } },
        create: { agencyId: conn.agencyId, hotelClientId: conn.hotelClientId, date, ...data },
        update: data,
      });
      daysSynced += 1;
    }

    await prisma.ga4Connection.update({
      where: { id: conn.id },
      data: {
        lastSyncedAt: new Date(),
        status: "ACTIVE",
        lastSyncError: null,
        requiresReconnect: false,
        lastErrorReason: null,
      },
    });
    console.log(`${LOG} ${conn.hotelClientId}: ${daysSynced} days upserted`);
    return { ok: true, daysSynced };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown GA4 sync error.";
    const tokenExpired = err instanceof GaAuthExpiredError;
    console.error(`${LOG} ${conn.hotelClientId} FAILED: ${msg}`);
    if (tokenExpired) {
      console.error(
        "[GA4-OAUTH-FAILURE]",
        JSON.stringify({ hotelClientId: conn.hotelClientId, connId: conn.id, googleError: "auth_expired", message: msg }),
      );
    }
    await prisma.ga4Connection.update({
      where: { id: conn.id },
      data: {
        status: tokenExpired ? "TOKEN_EXPIRED" : "ERROR",
        lastSyncError: msg,
        // Only an auth failure means the user must reconnect; a transient data
        // error keeps the connection usable, so don't flag it.
        ...(tokenExpired ? { requiresReconnect: true, lastErrorReason: googleErrorCode(msg) } : {}),
      },
    });
    return { ok: false, tokenExpired, error: msg };
  }
}

export type Ga4SyncResult = {
  processed: number;
  synced: number;
  daysSynced: number;
  tokenExpired: number;
  errors: { hotelClientId: string; error: string }[];
};

/** Syncs every ACTIVE GA4 connection (optionally one agency / one hotel). Never throws. */
export async function runGa4Sync(
  opts: { agencyId?: string; hotelClientId?: string; days?: number; accountDelayMs?: number } = {},
): Promise<Ga4SyncResult> {
  const delay = opts.accountDelayMs ?? 500;
  const conns = await prisma.ga4Connection.findMany({
    where: {
      status: "ACTIVE",
      propertyId: { not: "" }, // skip connections still awaiting property selection
      ...(opts.agencyId ? { agencyId: opts.agencyId } : {}),
      ...(opts.hotelClientId ? { hotelClientId: opts.hotelClientId } : {}),
    },
    orderBy: { lastSyncedAt: "asc" },
    select: { id: true, agencyId: true, hotelClientId: true, propertyId: true, tokenExpiresAt: true },
  });

  const result: Ga4SyncResult = { processed: 0, synced: 0, daysSynced: 0, tokenExpired: 0, errors: [] };
  for (let i = 0; i < conns.length; i++) {
    if (i > 0 && delay > 0) await sleep(delay);
    result.processed += 1;
    const res = await syncGa4Connection(conns[i], opts.days ?? 30);
    if (res.ok) {
      result.synced += 1;
      result.daysSynced += res.daysSynced ?? 0;
    } else {
      if (res.tokenExpired) result.tokenExpired += 1;
      result.errors.push({ hotelClientId: conns[i].hotelClientId, error: res.error ?? "unknown" });
    }
  }
  return result;
}
