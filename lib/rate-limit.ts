// Tiny in-memory fixed-window rate limiter. Used by the public tracking
// ingest (`/api/track/event`) to keep one misbehaving site (or scraper) from
// flooding the DB.
//
// **Production note:** on Vercel each serverless instance has its own memory,
// so this limit is enforced per-instance, not globally. For a stricter cap
// across instances, swap the buckets Map for Redis/Upstash via @upstash/ratelimit.
// For typical hotel-site traffic (a few events per visitor) the per-instance
// cap is a reasonable cheap defense.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Lazy cleanup so the Map doesn't grow unbounded. Runs at most once per call,
// only when the bucket count drifts above a threshold.
const MAX_BUCKETS = 10_000;
function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetInMs: number;
};

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, resetInMs: opts.windowMs };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, resetInMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, remaining: opts.limit - existing.count, resetInMs: existing.resetAt - now };
}

// Best-effort client identifier — first hop of x-forwarded-for, falling back
// to "anon" so absent headers don't all coalesce to one bucket.
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") || "anon";
}
