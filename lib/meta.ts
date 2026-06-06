import "server-only";

// Meta (Facebook) Graph API client for the Ads ROI integration.
//
// SECURITY (see CLAUDE.md): the decrypted access token is a secret. It is passed
// in the `Authorization: Bearer` header (never the query string) so it can't end
// up in request logs, and this module is `server-only` so it can never be
// bundled into client code. Callers must NEVER log the token or pass it to the
// frontend.

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * The token is invalid, expired, or revoked — the agency must reconnect by
 * pasting a fresh token. Callers catch this to set the connection
 * `disconnected` and surface a reconnect message.
 */
export class MetaAuthError extends Error {
  constructor(message = "Your Meta access token is invalid or has expired. Please reconnect.") {
    super(message);
    this.name = "MetaAuthError";
  }
}

/** Any other Graph API failure (bad request, rate limit, Meta outage, …). */
export class MetaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaApiError";
  }
}

type GraphParams = Record<string, string>;

/**
 * GET against the Graph API with the token in the Authorization header. Throws
 * {@link MetaAuthError} for OAuth/expiry failures (Graph error code 190 or
 * type `OAuthException`) and {@link MetaApiError} for everything else.
 */
async function graphGet<T>(
  path: string,
  accessToken: string,
  params: GraphParams = {},
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // These are per-token, per-agency calls — never serve them from Next's cache.
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; type?: string; code?: number };
  } & T;

  if (!res.ok || json?.error) {
    const err = json?.error ?? {};
    // Only treat the token itself as dead for code 190 (invalid/expired token)
    // or 102 (session expired). Meta also reports PERMISSION errors (e.g. #200
    // "ad account owner has not granted ads_read") with type "OAuthException" —
    // those mean "no access to this asset", not "token expired", and must NOT
    // flip the agency's valid token to expired.
    if (err.code === 190 || err.code === 102) {
      throw new MetaAuthError(err.message || undefined);
    }
    throw new MetaApiError(
      err.message || `Meta API request failed (HTTP ${res.status}).`,
    );
  }

  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateToken
// ─────────────────────────────────────────────────────────────────────────────

export type TokenValidation = {
  valid: boolean;
  /** When the token expires, or null if it never expires / expiry is unknown. */
  expiresAt: Date | null;
  scopes?: string[];
  userId?: string;
  userName?: string;
  /** Set when valid is false — a human-readable reason. */
  error?: string;
};

/**
 * Confirms a token works by calling `/me`, then reads its real expiry from
 * `/debug_token` (a token can inspect itself). If `/me` succeeds the token is
 * valid even when debug_token is unavailable — expiry just stays null.
 */
export async function validateToken(accessToken: string): Promise<TokenValidation> {
  try {
    const me = await graphGet<{ id: string; name?: string }>("me", accessToken, {
      fields: "id,name",
    });

    let expiresAt: Date | null = null;
    let scopes: string[] | undefined;
    try {
      const debug = await graphGet<{
        data?: { expires_at?: number; is_valid?: boolean; scopes?: string[] };
      }>("debug_token", accessToken, { input_token: accessToken });

      const expiresUnix = debug.data?.expires_at;
      // expires_at === 0 means a non-expiring token (e.g. a system-user token).
      if (typeof expiresUnix === "number" && expiresUnix > 0) {
        expiresAt = new Date(expiresUnix * 1000);
      }
      scopes = debug.data?.scopes;
    } catch {
      // Best-effort: /me already proved validity; leave expiry unknown.
    }

    return { valid: true, expiresAt, scopes, userId: me.id, userName: me.name };
  } catch (err) {
    if (err instanceof MetaAuthError) {
      return { valid: false, expiresAt: null, error: err.message };
    }
    return {
      valid: false,
      expiresAt: null,
      error:
        err instanceof Error
          ? err.message
          : "Could not reach Meta to validate the token.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getAdAccounts
// ─────────────────────────────────────────────────────────────────────────────

export type AdAccount = {
  /** Graph object id, e.g. "act_1234567890". Use this when calling insights. */
  id: string;
  /** Numeric id without the act_ prefix, e.g. "1234567890". */
  accountId: string;
  name: string;
  /** Meta account_status: 1 = active, 2 = disabled, 3 = unsettled, … */
  accountStatus: number;
  currency?: string;
  timezone?: string;
};

type RawAdAccount = {
  id: string;
  account_id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
};

/** Lists every ad account the token can access, following pagination. */
export async function getAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const accounts: AdAccount[] = [];
  let params: GraphParams = {
    fields: "id,account_id,name,account_status,currency,timezone_name",
    limit: "100",
  };

  // Cap the page walk so a misbehaving cursor can never loop forever.
  for (let page = 0; page < 20; page++) {
    const res = await graphGet<{
      data?: RawAdAccount[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("me/adaccounts", accessToken, params);

    for (const a of res.data ?? []) {
      accounts.push({
        id: a.id,
        accountId: a.account_id,
        name: a.name ?? a.id,
        accountStatus: a.account_status ?? 0,
        currency: a.currency,
        timezone: a.timezone_name,
      });
    }

    const after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;
    params = { ...params, after };
  }

  return accounts;
}

// ─────────────────────────────────────────────────────────────────────────────
// getInsights
// ─────────────────────────────────────────────────────────────────────────────

export type DateRange = {
  /** Inclusive start, "YYYY-MM-DD". */
  since: string;
  /** Inclusive end, "YYYY-MM-DD". */
  until: string;
};

export type ActionStat = { actionType: string; value: number };

export type AdInsights = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  /** Conversion counts by action_type (e.g. purchases, leads, page views). */
  actions: ActionStat[];
  /** Monetary value per action_type (e.g. purchase revenue). */
  actionValues: ActionStat[];
};

type RawAction = { action_type: string; value: string };
type RawInsights = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
};

/**
 * Account-level insights for a date range: spend, impressions, reach, clicks,
 * ctr, cpc, cpm, plus actions/action_values. Returns one row (account level).
 */
export async function getInsights(
  accessToken: string,
  adAccountId: string,
  range: DateRange,
): Promise<AdInsights[]> {
  const act = normalizeAccountId(adAccountId);
  const res = await graphGet<{ data?: RawInsights[] }>(`${act}/insights`, accessToken, {
    fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    level: "account",
  });

  return (res.data ?? []).map((row) => ({
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.clicks),
    ctr: toNumber(row.ctr),
    cpc: toNumber(row.cpc),
    cpm: toNumber(row.cpm),
    actions: mapActions(row.actions),
    actionValues: mapActions(row.action_values),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// getDailyInsights — one row per day, shaped for an AdSnapshot
// ─────────────────────────────────────────────────────────────────────────────

/** A single day's metrics for an ad account, mapped to AdSnapshot columns. */
export type DailyAdRow = {
  /** "YYYY-MM-DD" (Meta's date_start for the day). */
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  /** Booking conversions = pixel purchases. */
  conversions: number;
  /** Purchase value / spend for the day. */
  roas: number;
  pixelPurchases: number;
  pixelLeads: number;
  pixelPageViews: number;
};

type RawDailyInsights = RawInsights & {
  date_start?: string;
  date_stop?: string;
};

/**
 * Daily account insights (`time_increment=1`) over a date range — one row per
 * day with the fields an AdSnapshot needs. Used by the scheduled sync to write
 * idempotent per-day rows. Pixel conversions are derived from `actions` the
 * same way {@link getPixelEvents} does.
 */
export async function getDailyInsights(
  accessToken: string,
  adAccountId: string,
  range: DateRange,
): Promise<DailyAdRow[]> {
  const act = normalizeAccountId(adAccountId);
  const raw: RawDailyInsights[] = [];
  let params: GraphParams = {
    fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    time_increment: "1",
    level: "account",
    // One row per day. Without an explicit limit Meta pages insights at ~25
    // rows, which silently truncated ranges longer than ~a month before
    // pagination was added here.
    limit: "500",
  };

  // Follow pagination like getAdAccounts does, with the same runaway-cursor cap.
  // 20 pages × 500 rows is far beyond any range the app requests.
  for (let page = 0; page < 20; page++) {
    const res = await graphGet<{
      data?: RawDailyInsights[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${act}/insights`, accessToken, params);

    raw.push(...(res.data ?? []));

    const after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;
    params = { ...params, after };
  }

  return raw.map((row) => {
    const actions = mapActions(row.actions);
    const values = mapActions(row.action_values);
    const spend = toNumber(row.spend);
    const purchases = Math.round(pickFirst(actions, PIXEL_MATCHERS.purchase));
    const purchaseValue = pickFirst(values, PIXEL_MATCHERS.purchase);
    return {
      date: row.date_start ?? "",
      spend,
      impressions: Math.round(toNumber(row.impressions)),
      reach: Math.round(toNumber(row.reach)),
      clicks: Math.round(toNumber(row.clicks)),
      ctr: toNumber(row.ctr),
      cpc: toNumber(row.cpc),
      cpm: toNumber(row.cpm),
      conversions: purchases,
      roas: spend > 0 ? purchaseValue / spend : 0,
      pixelPurchases: purchases,
      pixelLeads: Math.round(pickFirst(actions, PIXEL_MATCHERS.lead)),
      pixelPageViews: Math.round(pickFirst(actions, PIXEL_MATCHERS.pageView)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getDailyCampaignInsights — one row per CAMPAIGN per day
// ─────────────────────────────────────────────────────────────────────────────

/** A single campaign-day's metrics, mapped to AdCampaignSnapshot columns. */
export type DailyCampaignRow = {
  /** "YYYY-MM-DD" (Meta's date_start for the day). */
  date: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** Meta-reported pixel purchases (same matcher set as getDailyInsights). */
  conversions: number;
  /** Meta-reported purchase value. */
  purchaseValue: number;
};

type RawCampaignInsights = RawDailyInsights & {
  campaign_id?: string;
  campaign_name?: string;
};

/**
 * Daily insights at `level=campaign` — the campaign_name dimension is what
 * utm_campaign↔booking attribution joins on (lib/campaign-attribution.ts).
 * Same pagination + pixel-action mapping as {@link getDailyInsights}.
 */
export async function getDailyCampaignInsights(
  accessToken: string,
  adAccountId: string,
  range: DateRange,
): Promise<DailyCampaignRow[]> {
  const act = normalizeAccountId(adAccountId);
  const raw: RawCampaignInsights[] = [];
  let params: GraphParams = {
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    time_increment: "1",
    level: "campaign",
    limit: "500",
  };

  // campaigns × days can exceed one page fast — follow pagination with the
  // same runaway-cursor cap as getDailyInsights.
  for (let page = 0; page < 20; page++) {
    const res = await graphGet<{
      data?: RawCampaignInsights[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${act}/insights`, accessToken, params);

    raw.push(...(res.data ?? []));

    const after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;
    params = { ...params, after };
  }

  return raw
    .filter((row) => row.campaign_id && row.date_start)
    .map((row) => {
      const actions = mapActions(row.actions);
      const values = mapActions(row.action_values);
      return {
        date: row.date_start!,
        campaignId: row.campaign_id!,
        campaignName: row.campaign_name ?? row.campaign_id!,
        spend: toNumber(row.spend),
        impressions: Math.round(toNumber(row.impressions)),
        clicks: Math.round(toNumber(row.clicks)),
        conversions: Math.round(pickFirst(actions, PIXEL_MATCHERS.purchase)),
        purchaseValue: pickFirst(values, PIXEL_MATCHERS.purchase),
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// getPixelEvents
// ─────────────────────────────────────────────────────────────────────────────

export type PixelEventStat = { count: number; value: number };
export type PixelEvents = {
  purchase: PixelEventStat;
  lead: PixelEventStat;
  pageView: PixelEventStat;
};

// Meta reports the same conversion under several action_type aliases. We take
// the FIRST match in priority order (pixel-specific first) to avoid double
// counting the generic + offsite variants of one event.
const PIXEL_MATCHERS: Record<keyof PixelEvents, string[]> = {
  purchase: ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"],
  lead: ["offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped"],
  pageView: [
    "offsite_conversion.fb_pixel_view_content",
    "view_content",
    "landing_page_view",
    "page_view",
  ],
};

/** Pixel conversion counts + values for purchase, lead, and page_view events. */
export async function getPixelEvents(
  accessToken: string,
  adAccountId: string,
  range: DateRange,
): Promise<PixelEvents> {
  const rows = await getInsights(accessToken, adAccountId, range);

  const totals: PixelEvents = {
    purchase: { count: 0, value: 0 },
    lead: { count: 0, value: 0 },
    pageView: { count: 0, value: 0 },
  };

  for (const row of rows) {
    for (const key of Object.keys(PIXEL_MATCHERS) as (keyof PixelEvents)[]) {
      const matchers = PIXEL_MATCHERS[key];
      totals[key].count += pickFirst(row.actions, matchers);
      totals[key].value += pickFirst(row.actionValues, matchers);
    }
  }

  return totals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

function toNumber(value: string | number | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

function mapActions(actions?: RawAction[]): ActionStat[] {
  return (actions ?? []).map((a) => ({
    actionType: a.action_type,
    value: toNumber(a.value),
  }));
}

/** Value of the first action whose type appears in `matchers`, else 0. */
function pickFirst(actions: ActionStat[], matchers: string[]): number {
  for (const matcher of matchers) {
    const hit = actions.find((a) => a.actionType === matcher);
    if (hit) return hit.value;
  }
  return 0;
}
