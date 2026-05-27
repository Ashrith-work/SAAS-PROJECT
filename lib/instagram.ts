import "server-only";

// Instagram/Facebook ORGANIC social client (Graph API v21+). This is deliberately
// separate from lib/meta.ts, which covers paid *Ads* insights. Here we resolve a
// hotel's Instagram Business account from a Facebook Page the token manages, then
// read account- and post-level organic insights.
//
// SECURITY (see CLAUDE.md): the decrypted token is a secret. It's sent in the
// `Authorization: Bearer` header (never the query string) so it can't land in
// request logs, and this module is `server-only`. Callers must NEVER log the
// token or pass it to the frontend.

const GRAPH_API_VERSION = process.env.IG_GRAPH_API_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Token is invalid, expired, or revoked — the agency must paste a fresh one. */
export class InstagramAuthError extends Error {
  constructor(message = "Your Instagram access token is invalid or has expired. Please reconnect.") {
    super(message);
    this.name = "InstagramAuthError";
  }
}

/**
 * The connected account can't be used for organic insights — almost always
 * because it's a personal Instagram account, or a Business/Creator account that
 * isn't linked to a Facebook Page the token manages. The message tells the agency
 * exactly how to fix it.
 */
export class InstagramSetupError extends Error {
  constructor(
    message = "No Instagram Business or Creator account is linked to a Facebook Page on this login. " +
      "To connect: (1) convert the hotel's Instagram to a Business or Creator account " +
      "(Instagram app → Settings → Account type and tools), (2) link it to a Facebook Page you manage, " +
      "then generate the token again with that Page selected.",
  ) {
    super(message);
    this.name = "InstagramSetupError";
  }
}

/** Any other Graph API failure (bad request, rate limit, Meta outage, …). */
export class InstagramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type GraphParams = Record<string, string>;

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
    cache: "no-store", // per-token, per-hotel calls — never cache
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; type?: string; code?: number };
  } & T;

  if (!res.ok || json?.error) {
    const err = json?.error ?? {};
    if (err.code === 190 || err.type === "OAuthException") {
      throw new InstagramAuthError(err.message || undefined);
    }
    throw new InstagramApiError(
      err.message || `Instagram API request failed (HTTP ${res.status}).`,
    );
  }

  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// connectInstagramAccount — resolve the IG Business account(s) from FB Pages
// ─────────────────────────────────────────────────────────────────────────────

export type IgAccount = {
  /** The Facebook Page this IG account is linked to. */
  pageId: string;
  pageName: string;
  /** Instagram Business account id — pass this to the insights calls. */
  igUserId: string;
  username: string;
  followersCount: number;
};

type RawPage = {
  id: string;
  name?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    followers_count?: number;
  };
};

/**
 * Lists the Instagram Business/Creator accounts reachable from the Facebook Pages
 * this token manages (`/me/accounts` → each Page's `instagram_business_account`).
 *
 * Throws {@link InstagramSetupError} when the login manages no Page with a linked
 * IG Business account (personal account, or unlinked) so the UI can explain the
 * fix, and {@link InstagramAuthError} when the token itself is bad.
 */
export async function connectInstagramAccount(accessToken: string): Promise<IgAccount[]> {
  const res = await graphGet<{ data?: RawPage[] }>("me/accounts", accessToken, {
    fields: "name,instagram_business_account{id,username,followers_count}",
    limit: "100",
  });

  const accounts: IgAccount[] = [];
  for (const page of res.data ?? []) {
    const ig = page.instagram_business_account;
    if (!ig?.id) continue;
    accounts.push({
      pageId: page.id,
      pageName: page.name ?? page.id,
      igUserId: ig.id,
      username: ig.username ?? "(unknown)",
      followersCount: ig.followers_count ?? 0,
    });
  }

  if (accounts.length === 0) throw new InstagramSetupError();
  return accounts;
}

// ─────────────────────────────────────────────────────────────────────────────
// getTokenExpiry — best-effort expiry via /debug_token
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the token's own expiry (null = unknown / non-expiring). Never throws. */
export async function getTokenExpiry(accessToken: string): Promise<Date | null> {
  try {
    const debug = await graphGet<{ data?: { expires_at?: number } }>(
      "debug_token",
      accessToken,
      { input_token: accessToken },
    );
    const unix = debug.data?.expires_at;
    // expires_at === 0 means a non-expiring token (e.g. a system-user token).
    return typeof unix === "number" && unix > 0 ? new Date(unix * 1000) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getAccountInsights — /{ig-user-id}/insights over a date range
// ─────────────────────────────────────────────────────────────────────────────

export type DateRange = { since: Date; until: Date };

export type AccountInsightsDay = {
  date: string; // YYYY-MM-DD
  reach: number;
  impressions: number;
  profileViews: number;
  followers: number;
};

export type AccountInsights = {
  /** Σ reach over the range. */
  reach: number;
  /** Σ impressions over the range. */
  impressions: number;
  /** Σ profile views over the range. */
  profileViews: number;
  /** Latest follower_count in the range (followers is a point-in-time metric). */
  followers: number;
  daily: AccountInsightsDay[];
};

type RawInsightValue = { value?: number; end_time?: string };
type RawInsightMetric = { name?: string; values?: RawInsightValue[] };

const ymd = (iso: string) => iso.slice(0, 10);
const unix = (d: Date) => Math.floor(d.getTime() / 1000).toString();

/**
 * Account-level organic insights: reach, impressions, profile_views, and
 * follower_count, by day across the range. Returns per-day rows plus range
 * totals (followers = the latest value, since it's a stock not a flow).
 */
export async function getAccountInsights(
  accessToken: string,
  igUserId: string,
  range: DateRange,
): Promise<AccountInsights> {
  const res = await graphGet<{ data?: RawInsightMetric[] }>(
    `${igUserId}/insights`,
    accessToken,
    {
      metric: "reach,impressions,profile_views,follower_count",
      period: "day",
      since: unix(range.since),
      until: unix(range.until),
    },
  );

  // Merge the parallel metric series into one row per day, keyed by end_time.
  const byDay = new Map<string, AccountInsightsDay>();
  const ensure = (date: string) => {
    let row = byDay.get(date);
    if (!row) {
      row = { date, reach: 0, impressions: 0, profileViews: 0, followers: 0 };
      byDay.set(date, row);
    }
    return row;
  };

  // Numeric fields only (excludes `date`), so the keyed write below type-checks.
  type NumericField = "reach" | "impressions" | "profileViews" | "followers";
  const field: Record<string, NumericField> = {
    reach: "reach",
    impressions: "impressions",
    profile_views: "profileViews",
    follower_count: "followers",
  };

  for (const metric of res.data ?? []) {
    const key = metric.name ? field[metric.name] : undefined;
    if (!key) continue;
    for (const v of metric.values ?? []) {
      if (!v.end_time) continue;
      ensure(ymd(v.end_time))[key] = v.value ?? 0;
    }
  }

  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    reach: daily.reduce((s, d) => s + d.reach, 0),
    impressions: daily.reduce((s, d) => s + d.impressions, 0),
    profileViews: daily.reduce((s, d) => s + d.profileViews, 0),
    followers: daily.length ? daily[daily.length - 1].followers : 0,
    daily,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getMediaInsights — recent posts + their per-post insights
// ─────────────────────────────────────────────────────────────────────────────

export type PostInsight = {
  mediaId: string;
  caption: string | null;
  mediaType: string | null;
  permalink: string | null;
  /** ISO timestamp the post was published. */
  timestamp: string | null;
  impressions: number;
  reach: number;
  engagement: number;
  saves: number;
  shares: number;
  videoViews: number;
};

type RawMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
};

/** Metrics valid for a given media type. video_views only applies to video. */
function metricsFor(mediaType: string | undefined): string[] {
  const base = ["reach", "impressions", "saved", "shares", "engagement"];
  if (mediaType === "VIDEO") return [...base, "video_views"];
  return base;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The most recent posts for an IG account, each with its organic insights
 * (impressions, reach, engagement, saves, shares, video_views). Resilient: one
 * post whose insights fail (e.g. a metric unsupported for its type) is returned
 * with zeroed metrics rather than failing the whole batch.
 *
 * `delayMs` spaces out the per-post insight calls to respect Instagram's rate
 * limit (~200 requests/hour) — pass a small value from a scheduled batch sync.
 */
export async function getMediaInsights(
  accessToken: string,
  igUserId: string,
  limit = 12,
  delayMs = 0,
): Promise<PostInsight[]> {
  const media = await graphGet<{ data?: RawMedia[] }>(`${igUserId}/media`, accessToken, {
    fields: "id,caption,media_type,permalink,timestamp",
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });

  const posts: PostInsight[] = [];
  let first = true;
  for (const m of media.data ?? []) {
    if (!first && delayMs > 0) await sleep(delayMs);
    first = false;
    const post: PostInsight = {
      mediaId: m.id,
      caption: m.caption ?? null,
      mediaType: m.media_type ?? null,
      permalink: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
      impressions: 0,
      reach: 0,
      engagement: 0,
      saves: 0,
      shares: 0,
      videoViews: 0,
    };

    try {
      const ins = await graphGet<{ data?: RawInsightMetric[] }>(
        `${m.id}/insights`,
        accessToken,
        { metric: metricsFor(m.media_type).join(",") },
      );
      for (const metric of ins.data ?? []) {
        const value = metric.values?.[0]?.value ?? 0;
        switch (metric.name) {
          case "impressions":
            post.impressions = value;
            break;
          case "reach":
            post.reach = value;
            break;
          case "engagement":
            post.engagement = value;
            break;
          case "saved":
            post.saves = value;
            break;
          case "shares":
            post.shares = value;
            break;
          case "video_views":
            post.videoViews = value;
            break;
        }
      }
    } catch (err) {
      // A dead token must still surface; a per-post metric quirk must not.
      if (err instanceof InstagramAuthError) throw err;
    }

    posts.push(post);
  }

  return posts;
}
