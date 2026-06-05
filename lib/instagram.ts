import "server-only";

// Instagram client for the "Instagram API with Instagram Login" (IGAA) flow.
//
// This is the ONLY way HotelTrack connects Instagram. The hotel logs in with
// its own Instagram Business/Creator account via OAuth — no Facebook Page, no
// EAA token, completely separate from the Meta *Ads* integration (lib/meta.ts).
//
//   • OAuth:    api.instagram.com/oauth/*          (code → short-lived token)
//   • Data:     graph.instagram.com/v21.0/*        (IGAA… tokens)
//   • Refresh:  graph.instagram.com/refresh_access_token (rolling 60-day)
//
// SECURITY (see CLAUDE.md): tokens are secrets. Data calls send the token in
// the `Authorization: Bearer` header (never the query string) so it can't land
// in request logs. The OAuth/refresh endpoints REQUIRE query/body credentials
// per Meta's spec — those are server-to-server calls whose URLs are never
// logged. This module is `server-only` and must never reach client code.

const IG_GRAPH = "https://graph.instagram.com";
const IG_OAUTH = "https://api.instagram.com";
const IG_API_VERSION = process.env.INSTAGRAM_API_VERSION ?? "v21.0";

/**
 * The token is invalid, expired, or revoked — the hotel must reconnect via
 * "Log in with Instagram". Callers catch this to set the connection status and
 * surface a reconnect message.
 */
export class InstagramAuthError extends Error {
  constructor(message = "The Instagram connection is invalid or has expired. Please reconnect.") {
    super(message);
    this.name = "InstagramAuthError";
  }
}

/** Any other Instagram API failure (bad request, rate limit, outage, …). */
export class InstagramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type GraphError = { error?: { message?: string; type?: string; code?: number } };

function classify(status: number, err: GraphError["error"]): Error {
  // Only 190 (invalid/expired token) and 102 (session expired) mean the token
  // is dead — permission errors also arrive as OAuthException but must not
  // mark the connection expired (same rule as lib/meta.ts).
  if (err?.code === 190 || err?.code === 102) {
    return new InstagramAuthError(err.message || undefined);
  }
  return new InstagramApiError(err?.message || `Instagram API request failed (HTTP ${status}).`);
}

/** GET on graph.instagram.com with the token in the Authorization header. */
async function igGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${IG_GRAPH}/${IG_API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store", // per-token, per-hotel calls — never cache
  });
  const json = (await res.json().catch(() => ({}))) as GraphError & T;
  if (!res.ok || json?.error) throw classify(res.status, json?.error);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth — code exchange, long-lived exchange, refresh
// ─────────────────────────────────────────────────────────────────────────────

function oauthEnv() {
  const clientId = process.env.INSTAGRAM_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new InstagramApiError(
      "Instagram Login is not configured — set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** The authorize URL the browser is redirected to from /api/auth/instagram/start. */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = oauthEnv();
  const url = new URL(`${IG_OAUTH}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_insights");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchanges the OAuth ?code for a short-lived IGAA token (+ ig user id). */
export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; igUserId: string }> {
  const { clientId, clientSecret, redirectUri } = oauthEnv();
  const res = await fetch(`${IG_OAUTH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: number | string;
    error_message?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new InstagramApiError(
      json.error_message || json.error?.message || `Instagram code exchange failed (HTTP ${res.status}).`,
    );
  }
  return { accessToken: json.access_token, igUserId: String(json.user_id ?? "") };
}

/** Exchanges a short-lived token for a long-lived (~60-day) one. */
export async function exchangeLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { clientSecret } = oauthEnv();
  const url = new URL(`${IG_GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as GraphError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) throw classify(res.status, json?.error);
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 60 * 86_400;
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/**
 * Rolls a long-lived token forward (IGAA's superpower: a token older than 24h
 * and not yet expired can be refreshed for another ~60 days, indefinitely).
 */
export async function refreshLongLivedToken(
  currentToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const url = new URL(`${IG_GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as GraphError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) throw classify(res.status, json?.error);
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 60 * 86_400;
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

export type IgProfile = {
  igUserId: string;
  username: string;
  /** "BUSINESS" | "CREATOR" | "PERSONAL" (PERSONAL is rejected at connect). */
  accountType: string;
  profilePictureUrl: string | null;
  followersCount: number;
};

/** Fetches the logged-in account's profile. Used at connect + test-connection. */
export async function getProfile(accessToken: string): Promise<IgProfile> {
  const me = await igGet<{
    user_id?: number | string;
    id?: string;
    username?: string;
    account_type?: string;
    profile_picture_url?: string;
    followers_count?: number;
  }>("me", accessToken, {
    fields: "user_id,username,account_type,profile_picture_url,followers_count",
  });
  return {
    igUserId: String(me.user_id ?? me.id ?? ""),
    username: me.username ?? "(unknown)",
    accountType: (me.account_type ?? "UNKNOWN").toUpperCase(),
    profilePictureUrl: me.profile_picture_url ?? null,
    followersCount: me.followers_count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Account insights (daily)
// ─────────────────────────────────────────────────────────────────────────────

export type DailyAccountInsight = {
  /** "YYYY-MM-DD" */
  date: string;
  reach: number;
  impressions: number;
  profileViews: number;
  /** Daily follower_count metric when Meta returns it (new follows that day). */
  followerCount: number;
};

type InsightRow = {
  name?: string;
  period?: string;
  values?: { value?: number; end_time?: string }[];
};

// Newer Graph versions retire individual metrics (impressions is deprecated on
// v22+). Rather than failing the whole sync, retry without the metric Meta
// rejected so the remaining ones still land.
async function insightsWithFallback(
  accessToken: string,
  igUserId: string,
  metrics: string[],
  params: Record<string, string>,
): Promise<InsightRow[]> {
  let current = [...metrics];
  for (let attempt = 0; attempt < metrics.length; attempt++) {
    try {
      const res = await igGet<{ data?: InsightRow[] }>(`${igUserId}/insights`, accessToken, {
        ...params,
        metric: current.join(","),
      });
      return res.data ?? [];
    } catch (err) {
      if (err instanceof InstagramAuthError) throw err;
      const message = err instanceof Error ? err.message : "";
      // "(#100) metric[N] must be one of the following values: …" — drop the
      // metric Meta named (or the first one) and retry with the rest.
      const rejected = current.find((m) => message.includes(m));
      if (current.length <= 1 || !message.includes("metric")) throw err;
      current = current.filter((m) => m !== (rejected ?? current[0]));
    }
  }
  return [];
}

/**
 * Daily account metrics for a date window via
 * `{igUserId}/insights?period=day&since&until` on graph.instagram.com.
 */
export async function getDailyAccountInsights(
  accessToken: string,
  igUserId: string,
  range: { since: Date; until: Date },
): Promise<DailyAccountInsight[]> {
  const rows = await insightsWithFallback(
    accessToken,
    igUserId,
    ["reach", "impressions", "profile_views", "follower_count"],
    {
      period: "day",
      since: String(Math.floor(range.since.getTime() / 1000)),
      until: String(Math.floor(range.until.getTime() / 1000)),
    },
  );

  // Pivot metric-major rows into one record per day.
  const byDate = new Map<string, DailyAccountInsight>();
  const ensure = (date: string): DailyAccountInsight => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, reach: 0, impressions: 0, profileViews: 0, followerCount: 0 };
      byDate.set(date, d);
    }
    return d;
  };

  for (const row of rows) {
    for (const v of row.values ?? []) {
      if (!v.end_time) continue;
      const date = v.end_time.slice(0, 10);
      const value = typeof v.value === "number" ? v.value : 0;
      switch (row.name) {
        case "reach":
          ensure(date).reach = value;
          break;
        case "impressions":
          ensure(date).impressions = value;
          break;
        case "profile_views":
          ensure(date).profileViews = value;
          break;
        case "follower_count":
          ensure(date).followerCount = value;
          break;
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────────────────────────────────────
// Media + per-post insights
// ─────────────────────────────────────────────────────────────────────────────

export type IgMedia = {
  mediaId: string;
  caption: string | null;
  /** Normalised: "image" | "video" | "carousel" | "reels". */
  mediaType: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number;
  comments: number;
};

function normaliseMediaType(raw?: string): string | null {
  switch ((raw ?? "").toUpperCase()) {
    case "IMAGE":
      return "image";
    case "VIDEO":
      return "video";
    case "CAROUSEL_ALBUM":
      return "carousel";
    case "REELS":
      return "reels";
    default:
      return raw ? raw.toLowerCase() : null;
  }
}

/** The account's recent media (no insights — those are fetched per media id). */
export async function getRecentMedia(
  accessToken: string,
  igUserId: string,
  limit = 25,
): Promise<IgMedia[]> {
  const res = await igGet<{
    data?: {
      id: string;
      caption?: string;
      media_type?: string;
      media_url?: string;
      permalink?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(`${igUserId}/media`, accessToken, {
    fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });

  return (res.data ?? []).map((m) => ({
    mediaId: m.id,
    caption: m.caption ?? null,
    mediaType: normaliseMediaType(m.media_type),
    mediaUrl: m.media_url ?? null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
  }));
}

export type MediaInsights = {
  reach: number;
  impressions: number;
  saved: number;
  engagement: number;
};

/**
 * Per-post insights. Tolerant of per-version metric churn: falls back through
 * `engagement` → `total_interactions` and drops `impressions` when rejected. A
 * metric quirk on one post must never kill the sync, so unknown-metric
 * failures resolve to zeros (auth errors still propagate).
 */
export async function getMediaInsights(
  accessToken: string,
  mediaId: string,
): Promise<MediaInsights> {
  const out: MediaInsights = { reach: 0, impressions: 0, saved: 0, engagement: 0 };
  const metricSets = [
    ["reach", "impressions", "saved", "engagement"],
    ["reach", "impressions", "saved", "total_interactions"],
    ["reach", "saved", "total_interactions"],
    ["reach", "saved"],
  ];

  for (const metrics of metricSets) {
    try {
      const res = await igGet<{ data?: InsightRow[] }>(`${mediaId}/insights`, accessToken, {
        metric: metrics.join(","),
      });
      for (const row of res.data ?? []) {
        const value = row.values?.[0]?.value ?? 0;
        switch (row.name) {
          case "reach":
            out.reach = value;
            break;
          case "impressions":
            out.impressions = value;
            break;
          case "saved":
            out.saved = value;
            break;
          case "engagement":
          case "total_interactions":
            out.engagement = value;
            break;
        }
      }
      return out;
    } catch (err) {
      if (err instanceof InstagramAuthError) throw err;
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("metric")) return out; // per-post quirk — keep zeros
    }
  }
  return out;
}
