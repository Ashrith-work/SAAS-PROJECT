import { runSocialSync } from "@/lib/social-sync";

// Scheduled IG STORIES sync. Runs on Vercel Cron every 2 hours (see vercel.json)
// because Instagram Stories expire 24 hours after posting — any story we don't
// capture before then is gone from the Graph API forever. We persist the
// StorySnapshot row regardless, so historical reports keep working.
//
// This route only refreshes stories (mode=stories): it does NOT re-pull account
// insights or feed-post insights — those are handled by the 6-hour
// /api/social/sync cron. Splitting the workloads keeps total Graph calls per
// hour per token well under Instagram's ~200/hour limit. Same CRON_SECRET guard.

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
    mode: "stories",
    agencyId: url.searchParams.get("agencyId") || undefined,
    maxAccounts: intParam(url, "maxAccounts"),
    // Allow tests to speed up by disabling spacing (?fast=1).
    perRequestDelayMs: url.searchParams.get("fast") === "1" ? 0 : undefined,
    accountDelayMs: url.searchParams.get("fast") === "1" ? 0 : undefined,
  });

  return Response.json({ ok: true, social: result, syncedAt: new Date().toISOString() });
}
