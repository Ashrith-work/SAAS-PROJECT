import "server-only";

// GA4 via Google OAuth (user consent). Low-level client: build the consent URL,
// exchange/refresh tokens, list properties (Admin API), and run reports (Data
// API). All over plain REST so no extra SDK is needed. Every path logs under a
// [GA4-*] prefix and masks tokens (length + first 4 chars only).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

/** Read-only Analytics scope (all we need; we never edit GA config). */
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Masks a secret-ish string for logs: length + first 4 chars only. */
export function mask(s: string | null | undefined): string {
  if (!s) return "(empty)";
  return `len=${s.length} head=${s.slice(0, 4)}…`;
}

// ── Error taxonomy ───────────────────────────────────────────────────────────
/** OAuth/token endpoint failure (exchange or refresh). */
export class GaOAuthError extends Error {}
/** GA Data/Admin API returned 401/403 — token expired or access revoked. */
export class GaAuthExpiredError extends Error {}
/** Any other GA API failure. */
export class GaApiError extends Error {}

// ── Config ───────────────────────────────────────────────────────────────────
function clientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new GaOAuthError("GOOGLE_OAUTH_CLIENT_ID is not configured.");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new GaOAuthError("GOOGLE_OAUTH_CLIENT_SECRET is not configured.");
  return v;
}
export function ga4RedirectUri(): string {
  return (
    process.env.GA4_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in").replace(/\/+$/, "")}/api/auth/ga4/callback`
  );
}

/** Builds the Google consent URL. `prompt=consent` + `access_type=offline`
 *  guarantees a refresh token on first authorization. */
export function buildGa4AuthUrl(state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", ga4RedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GA4_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export type Ga4Tokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
};

/** Exchanges an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<Ga4Tokens> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: ga4RedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new GaOAuthError(
      `token exchange failed (${res.status}): ${String(json.error ?? "")} ${String(json.error_description ?? "")}`.trim(),
    );
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000),
    scope: String(json.scope ?? GA4_SCOPE),
  };
}

/** Refreshes the access token from a refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date; scope?: string }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new GaOAuthError(
      `token refresh failed (${res.status}): ${String(json.error ?? "")} ${String(json.error_description ?? "")}`.trim(),
    );
  }
  return {
    accessToken: String(json.access_token),
    expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000),
    scope: json.scope ? String(json.scope) : undefined,
  };
}

export type Ga4Property = { propertyId: string; displayName: string; account: string };

/** Lists the GA4 properties the consenting user can access (Admin API). */
export async function listProperties(accessToken: string): Promise<Ga4Property[]> {
  const res = await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{ property?: string; displayName?: string }>;
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GaAuthExpiredError(`accountSummaries unauthorized (${res.status}): ${json.error?.message ?? ""}`);
    }
    throw new GaApiError(`accountSummaries failed (${res.status}): ${json.error?.message ?? ""}`);
  }
  const out: Ga4Property[] = [];
  for (const acc of json.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      // p.property is "properties/123456789"
      const propertyId = String(p.property ?? "").split("/").pop() ?? "";
      if (propertyId) {
        out.push({ propertyId, displayName: p.displayName ?? `Property ${propertyId}`, account: acc.displayName ?? "" });
      }
    }
  }
  return out;
}

// ── Data API runReport ───────────────────────────────────────────────────────
export type ReportRequest = {
  dateRanges: { startDate: string; endDate: string }[];
  metrics: { name: string }[];
  dimensions?: { name: string }[];
  dimensionFilter?: unknown;
  orderBys?: unknown;
  limit?: number;
};
export type ReportRow = { dimensionValues: { value: string }[]; metricValues: { value: string }[] };

/** Runs one GA Data API report. Throws GaAuthExpiredError on 401/403. */
export async function runReport(
  accessToken: string,
  propertyId: string,
  req: ReportRequest,
): Promise<ReportRow[]> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, limit: req.limit ? String(req.limit) : undefined }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: ReportRow[];
    error?: { message?: string; status?: string };
  };
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new GaAuthExpiredError(`runReport unauthorized: ${msg}`);
    throw new GaApiError(`runReport failed (${res.status}): ${msg}`);
  }
  return json.rows ?? [];
}
