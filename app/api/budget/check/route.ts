import { runBudgetAlerts } from "@/lib/budget-alerts";

// Daily budget-threshold alert cron. Scheduled at 3am UTC (after the 2am Meta
// sync) via vercel.json. Same CRON_SECRET bearer guard as the other crons. Can
// be hit manually for testing.
//
// Query params (optional):
//   ?agencyId=<id>   limit to one agency
//   ?force=1         re-fire even if a BudgetAlert already exists (testing)

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const agencyId = url.searchParams.get("agencyId") ?? undefined;
  const force = url.searchParams.get("force") === "1";

  const result = await runBudgetAlerts({ agencyId, force });
  return Response.json({ ok: true, ...result });
}
