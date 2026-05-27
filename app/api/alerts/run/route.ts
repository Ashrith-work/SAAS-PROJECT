import { runDailyAlerts, type RunAlertsOptions } from "@/lib/alerts";
import type { AlertType } from "@prisma/client";

// Manual / scheduled trigger for the email alerts engine. Same CRON_SECRET guard
// as the Meta sync. The daily Vercel Cron already runs alerts via /api/meta/sync;
// this endpoint exists so alerts can be triggered on their own — mainly for
// testing a single alert type without waiting for (or rerunning) the full sync.
//
// Query params (all optional):
//   ?type=performance_drop|snippet_error|meta_token_expiry|weekly_summary  (repeatable)
//   ?agencyId=<id>   limit to one agency
//   ?force=1         bypass dedup windows + the weekly Monday gate
//   ?weekly=1        include the weekly summary regardless of weekday

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TYPES: AlertType[] = [
  "performance_drop",
  "snippet_error",
  "meta_token_expiry",
  "weekly_summary",
];

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

  const requested = url.searchParams
    .getAll("type")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v): v is AlertType => (VALID_TYPES as string[]).includes(v));

  const force = url.searchParams.get("force") === "1";
  const opts: RunAlertsOptions = {
    only: requested.length > 0 ? requested : undefined,
    agencyId: url.searchParams.get("agencyId") || undefined,
    force,
    // Forcing implies we want the weekly summary too, unless a narrower type list
    // was given. An explicit ?weekly=1 always includes it.
    includeWeekly:
      url.searchParams.get("weekly") === "1" || (force && requested.length === 0),
  };

  const result = await runDailyAlerts(opts);
  return Response.json({ ok: true, ranAt: new Date().toISOString(), result });
}
