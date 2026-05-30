import "server-only";

import { BetaAnalyticsDataClient } from "@google-analytics/data";

// ============================================================================
// Google Analytics 4 — Data API client (per-hotel, per-property)
// ============================================================================
//
// The third data source per hotel (alongside Meta Ads in lib/meta.ts and
// Instagram in lib/instagram.ts). Each connected hotel has:
//   • a GA4 property id (numeric, e.g. "123456789")
//   • a Google Cloud service-account JSON, AES-256-GCM-encrypted at rest in
//     GoogleAnalyticsConnection.encryptedCredentials (see lib/encryption.ts)
//
// The service account must be added as a Viewer on the GA4 property in the
// GA Admin UI; otherwise every call returns PERMISSION_DENIED, which we map
// to GaAuthError so the sync engine can flip the connection to disconnected.
//
// SECURITY (see CLAUDE.md): credentials are a secret. Decrypt only inside
// server-only code, pass directly to BetaAnalyticsDataClient, NEVER log them,
// NEVER serialise them to the frontend.
// ============================================================================

/** Credentials lost access (property un-shared) or the JSON is invalid. */
export class GaAuthError extends Error {
  constructor(
    message = "The Google Analytics credentials are invalid or no longer have " +
      "access to the property. Please reconnect.",
  ) {
    super(message);
    this.name = "GaAuthError";
  }
}

/** Any other GA Data API failure. */
export class GaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GaApiError";
  }
}

/**
 * The fields we accept off a Google Cloud service-account JSON. The full file
 * has more (auth_uri, client_x509_cert_url, …), but only these are required
 * to authenticate the GA Data API client.
 */
export type ServiceAccountCredentials = {
  type: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
};

/**
 * Validates the *shape* of a service-account JSON before we store it. Catches
 * the classic "user pasted their OAuth client JSON" mistake without making a
 * network call. The actual property-access check happens in
 * {@link validateGaConnection}.
 */
export function isServiceAccountJson(parsed: unknown): parsed is ServiceAccountCredentials {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return (
    obj.type === "service_account" &&
    typeof obj.project_id === "string" &&
    typeof obj.private_key === "string" &&
    typeof obj.client_email === "string"
  );
}

/** GA4 property ids are all digits, typically 8-12 chars. */
export function isValidGa4PropertyId(id: string): boolean {
  return /^\d{6,15}$/.test(id.trim());
}

function clientFor(credentials: ServiceAccountCredentials): BetaAnalyticsDataClient {
  return new BetaAnalyticsDataClient({ credentials });
}

function propertyPath(propertyId: string): string {
  return `properties/${propertyId.trim()}`;
}

// Map gRPC error codes the SDK throws into our two error types.
function rethrow(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? (err as { code: unknown }).code
      : undefined;
  // gRPC codes — see https://grpc.github.io/grpc/core/md_doc_statuscodes.html
  // 7 = PERMISSION_DENIED, 16 = UNAUTHENTICATED, 5 = NOT_FOUND (bad property id)
  if (code === 7 || code === 16 || code === 5 || /PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant|NOT_FOUND/i.test(message)) {
    throw new GaAuthError(message);
  }
  throw new GaApiError(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateGaConnection
// ─────────────────────────────────────────────────────────────────────────────

export type GaConnectionTest = {
  propertyId: string;
  /** GA's reported property display name (best-effort; empty string if absent). */
  propertyName: string;
  /** True if the test call returned without error. */
  ok: boolean;
};

/**
 * Tests credentials by running the cheapest possible report (one metric, one
 * day) against the given property. Throws {@link GaAuthError} when the service
 * account doesn't have Viewer on the property; throws {@link GaApiError} for
 * any other failure.
 */
export async function validateGaConnection(
  credentials: ServiceAccountCredentials,
  propertyId: string,
): Promise<GaConnectionTest> {
  if (!isValidGa4PropertyId(propertyId)) {
    throw new GaAuthError(
      "That doesn't look like a GA4 property id. Use the numeric id from " +
        "GA Admin → Property settings (e.g. 123456789).",
    );
  }
  const client = clientFor(credentials);
  try {
    const [res] = await client.runReport({
      property: propertyPath(propertyId),
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: [{ name: "sessions" }],
    });
    return {
      propertyId: propertyId.trim(),
      propertyName: res.propertyQuota ? "" : "",
      ok: true,
    };
  } catch (err) {
    rethrow(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getDailyMetrics
// ─────────────────────────────────────────────────────────────────────────────

export type DateRange = { since: Date; until: Date };

export type GaDailyMetrics = {
  /** "YYYY-MM-DD". */
  date: string;
  totalUsers: number;
  newUsers: number;
  sessions: number;
  /** 0..1 ratio. */
  bounceRate: number;
  /** Seconds. */
  avgSessionDuration: number;
  pageviews: number;
  conversions: number;
  /** Derived = conversions / sessions, 0 when sessions is 0. */
  conversionRate: number;
};

// GA4 returns dates as "YYYYMMDD". Convert to "YYYY-MM-DD" for our DATE column.
function ga4DateToIso(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function toDateString(d: Date): string {
  // GA4 expects YYYY-MM-DD in the property timezone.
  return d.toISOString().slice(0, 10);
}

function numberAt(
  values: Array<{ value?: string | null }> | null | undefined,
  i: number,
): number {
  const raw = values?.[i]?.value;
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Daily rollup over the date range. One row per day with totalUsers, newUsers,
 * sessions, bounceRate, avgSessionDuration, pageviews, conversions, plus the
 * derived conversionRate. Maps to GaSnapshot 1:1.
 *
 * GA4 metric names: `screenPageViews` is the GA4 replacement for the UA-era
 * `pageviews`; `averageSessionDuration` is GA4's name.
 */
export async function getDailyMetrics(
  credentials: ServiceAccountCredentials,
  propertyId: string,
  range: DateRange,
): Promise<GaDailyMetrics[]> {
  const client = clientFor(credentials);
  try {
    const [res] = await client.runReport({
      property: propertyPath(propertyId),
      dateRanges: [{ startDate: toDateString(range.since), endDate: toDateString(range.until) }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "screenPageViews" },
        { name: "conversions" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });

    return (res.rows ?? []).map((row) => {
      const sessions = numberAt(row.metricValues, 2);
      const conversions = numberAt(row.metricValues, 6);
      return {
        date: ga4DateToIso(row.dimensionValues?.[0]?.value ?? ""),
        totalUsers: numberAt(row.metricValues, 0),
        newUsers: numberAt(row.metricValues, 1),
        sessions,
        bounceRate: numberAt(row.metricValues, 3),
        avgSessionDuration: numberAt(row.metricValues, 4),
        pageviews: numberAt(row.metricValues, 5),
        conversions,
        conversionRate: sessions > 0 ? conversions / sessions : 0,
      };
    });
  } catch (err) {
    rethrow(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getSourceBreakdown — sessions + conversions grouped by source/medium
// ─────────────────────────────────────────────────────────────────────────────

export type GaSourceRow = {
  date: string;
  /** Normalised: instagram | facebook | google_organic | google_paid | direct | email | referral | other. */
  source: string;
  /** Raw GA medium (organic, cpc, social, referral, …). */
  medium: string;
  sessions: number;
  conversions: number;
  revenue: number;
};

/**
 * Folds a (raw_source, medium) pair into one of the dashboard buckets so the
 * pie chart stays readable across hotels with wildly different traffic mixes.
 * Unknown combinations fall into "other" rather than spamming the chart.
 */
export function normaliseSource(rawSource: string, medium: string): string {
  const s = rawSource.toLowerCase();
  const m = medium.toLowerCase();
  if (s.includes("instagram") || (s === "ig" && m === "social")) return "instagram";
  if (s.includes("facebook") || s === "fb") return "facebook";
  if (s.includes("google")) return m === "cpc" || m === "paid" ? "google_paid" : "google_organic";
  if (s === "(direct)" || (s === "direct" && (m === "(none)" || m === "none"))) return "direct";
  if (m === "email") return "email";
  if (m === "referral") return "referral";
  return "other";
}

/**
 * Per-day, per-source rows. We aggregate to the normalised source key in
 * code (rather than in GA) so the same bucket logic is applied consistently
 * across hotels.
 */
export async function getSourceBreakdown(
  credentials: ServiceAccountCredentials,
  propertyId: string,
  range: DateRange,
): Promise<GaSourceRow[]> {
  const client = clientFor(credentials);
  try {
    const [res] = await client.runReport({
      property: propertyPath(propertyId),
      dateRanges: [{ startDate: toDateString(range.since), endDate: toDateString(range.until) }],
      dimensions: [
        { name: "date" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "conversions" },
        { name: "totalRevenue" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 100_000,
    });

    // Fold rows with the same normalised source on the same day together.
    type Key = string;
    const agg = new Map<
      Key,
      { date: string; source: string; medium: string; sessions: number; conversions: number; revenue: number }
    >();

    for (const row of res.rows ?? []) {
      const date = ga4DateToIso(row.dimensionValues?.[0]?.value ?? "");
      const rawSource = row.dimensionValues?.[1]?.value ?? "(none)";
      const medium = row.dimensionValues?.[2]?.value ?? "(none)";
      const source = normaliseSource(rawSource, medium);
      const key = `${date}|${source}`;
      let bucket = agg.get(key);
      if (!bucket) {
        bucket = { date, source, medium, sessions: 0, conversions: 0, revenue: 0 };
        agg.set(key, bucket);
      }
      bucket.sessions += numberAt(row.metricValues, 0);
      bucket.conversions += numberAt(row.metricValues, 1);
      bucket.revenue += numberAt(row.metricValues, 2);
    }

    return [...agg.values()];
  } catch (err) {
    rethrow(err);
  }
}
