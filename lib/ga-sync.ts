import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/encryption";
import {
  GaAuthError,
  getDailyMetrics,
  getSourceBreakdown,
  type ServiceAccountCredentials,
} from "@/lib/google-analytics";

// Shared GA4 sync engine. Pulls daily metrics + source breakdown for every
// connected hotel and upserts GaSnapshot / GaSourceBreakdown rows. Used by:
//   • the scheduled cron at /api/ga/sync (every 24 hours)
//   • the manual "Sync GA data" button on the hotel setup page
//
// RESILIENCE: a single hotel's failure never aborts the batch. A
// PERMISSION_DENIED (service account un-shared from the property) marks just
// that connection `disconnected` so the UI can prompt a reconnect — the same
// pattern as Meta token expiry and Instagram auth errors.
//
// RATE LIMITS: GA4 Data API allows 1,250 tokens per project per hour; each
// runReport is ~10 tokens. Per hotel we make 2 calls (~20 tokens) every 24h,
// so even at 1,000 hotels we use ~833 tokens per day — well under the cap.

const DAY_MS = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type GaSyncTuning = {
  /** Trailing days of metrics to (re)pull. Default 30. */
  days?: number;
  /** Delay between hotels in ms. Default 500 (GA has plenty of headroom). */
  accountDelayMs?: number;
};

export type GaAccountSyncResult = {
  ok: boolean;
  daysSynced?: number;
  sourcesSynced?: number;
  disconnected?: boolean;
  error?: string;
};

type SyncableConnection = {
  id: string;
  agencyId: string;
  hotelClientId: string;
  propertyId: string;
  encryptedCredentials: string;
};

/**
 * Syncs one connected GA property. Never throws — always returns a result.
 * On credential failure flips status to `disconnected` so the dashboard
 * shows the reconnect prompt.
 */
export async function syncGaConnection(
  conn: SyncableConnection,
  tuning: GaSyncTuning = {},
): Promise<GaAccountSyncResult> {
  const days = tuning.days ?? 30;

  let credentials: ServiceAccountCredentials;
  try {
    const json = decryptToken(conn.encryptedCredentials);
    credentials = JSON.parse(json) as ServiceAccountCredentials;
  } catch {
    return { ok: false, error: "Stored credentials could not be decrypted." };
  }

  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * DAY_MS);
  const range = { since, until };

  try {
    // ── Daily metrics → GaSnapshot ─────────────────────────────────────────
    const daily = await getDailyMetrics(credentials, conn.propertyId, range);
    for (const day of daily) {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const data = {
        totalUsers: Math.round(day.totalUsers),
        newUsers: Math.round(day.newUsers),
        sessions: Math.round(day.sessions),
        bounceRate: day.bounceRate,
        avgSessionDuration: day.avgSessionDuration,
        pageviews: Math.round(day.pageviews),
        conversions: Math.round(day.conversions),
        conversionRate: day.conversionRate,
      };
      await prisma.gaSnapshot.upsert({
        where: { hotelClientId_date: { hotelClientId: conn.hotelClientId, date } },
        create: { agencyId: conn.agencyId, hotelClientId: conn.hotelClientId, date, ...data },
        update: data,
      });
    }

    // ── Source breakdown → GaSourceBreakdown ───────────────────────────────
    const sources = await getSourceBreakdown(credentials, conn.propertyId, range);
    for (const s of sources) {
      const date = new Date(`${s.date}T00:00:00.000Z`);
      const data = {
        agencyId: conn.agencyId,
        medium: s.medium,
        sessions: Math.round(s.sessions),
        conversions: Math.round(s.conversions),
        revenue: s.revenue,
      };
      await prisma.gaSourceBreakdown.upsert({
        where: {
          hotelClientId_date_source: {
            hotelClientId: conn.hotelClientId,
            date,
            source: s.source,
          },
        },
        create: { hotelClientId: conn.hotelClientId, date, source: s.source, ...data },
        update: data,
      });
    }

    await prisma.googleAnalyticsConnection.update({
      where: { id: conn.id },
      data: { lastSyncedAt: new Date(), status: "connected" },
    });

    return { ok: true, daysSynced: daily.length, sourcesSynced: sources.length };
  } catch (err) {
    if (err instanceof GaAuthError) {
      // Service account lost access (un-shared, key revoked, …) — same pattern
      // as Meta token expiry: mark disconnected so the UI shows reconnect.
      await prisma.googleAnalyticsConnection.update({
        where: { id: conn.id },
        data: { status: "disconnected" },
      });
      return { ok: false, disconnected: true, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown GA sync error." };
  }
}

export type GaSyncResult = {
  propertiesProcessed: number;
  propertiesSynced: number;
  daysSynced: number;
  sourcesSynced: number;
  propertiesDisconnected: number;
  errors: { agencyId: string; hotelClientId: string; error: string }[];
};

/**
 * Syncs every CONNECTED GA property (optionally limited to one agency).
 * Never throws.
 */
export async function runGaSync(
  opts: GaSyncTuning & { agencyId?: string; maxProperties?: number } = {},
): Promise<GaSyncResult> {
  const maxProperties = opts.maxProperties ?? 200;
  const accountDelayMs = opts.accountDelayMs ?? 500;

  const connections = await prisma.googleAnalyticsConnection.findMany({
    where: { status: "connected", ...(opts.agencyId ? { agencyId: opts.agencyId } : {}) },
    orderBy: { lastSyncedAt: "asc" }, // stale first; nulls sort first
    take: maxProperties,
    select: {
      id: true,
      agencyId: true,
      hotelClientId: true,
      propertyId: true,
      encryptedCredentials: true,
    },
  });

  const result: GaSyncResult = {
    propertiesProcessed: 0,
    propertiesSynced: 0,
    daysSynced: 0,
    sourcesSynced: 0,
    propertiesDisconnected: 0,
    errors: [],
  };

  for (let i = 0; i < connections.length; i++) {
    if (i > 0 && accountDelayMs > 0) await sleep(accountDelayMs);

    const conn = connections[i];
    result.propertiesProcessed += 1;

    const res = await syncGaConnection(conn, opts);
    if (res.ok) {
      result.propertiesSynced += 1;
      result.daysSynced += res.daysSynced ?? 0;
      result.sourcesSynced += res.sourcesSynced ?? 0;
    } else {
      if (res.disconnected) result.propertiesDisconnected += 1;
      result.errors.push({
        agencyId: conn.agencyId,
        hotelClientId: conn.hotelClientId,
        error: res.error ?? "Unknown error.",
      });
    }
  }

  return result;
}
