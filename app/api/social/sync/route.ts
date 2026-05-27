import { runSocialSync } from "@/lib/social-sync";

// Scheduled ORGANIC social sync. Runs on Vercel Cron every 6 hours (see
// vercel.json) — separate from the 24-hour ads sync — because follower/engagement
// KPIs benefit from more frequent refreshes. Also invoked manually for testing.
// Guarded by CRON_SECRET (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
//
// For every CONNECTED SocialAccount it pulls Instagram account + post insights
// and upserts SocialSnapshot / PostSnapshot rows. Rate-limit aware and resilient:
// one account failing (or a dead token) never aborts the batch. NEVER logs tokens.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // capped to the plan's max; partial work persists

function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await runSocialSync({
    agencyId: url.searchParams.get("agencyId") || undefined,
    maxAccounts: intParam(url, "maxAccounts"),
    days: intParam(url, "days"),
    postsPerAccount: intParam(url, "posts"),
    // Allow tests to speed up by disabling spacing (?fast=1).
    perRequestDelayMs: url.searchParams.get("fast") === "1" ? 0 : undefined,
    accountDelayMs: url.searchParams.get("fast") === "1" ? 0 : undefined,
  });

  return Response.json({ ok: true, social: result, syncedAt: new Date().toISOString() });
}
