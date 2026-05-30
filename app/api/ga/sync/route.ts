import { runGaSync } from "@/lib/ga-sync";

// Scheduled GA4 sync. Runs once per day via Vercel Cron (see vercel.json) —
// GA4 data settles slowly so daily is plenty. CRON_SECRET-guarded the same
// way as the Meta and Instagram crons.
//
// For every CONNECTED GoogleAnalyticsConnection it pulls daily metrics +
// the source breakdown and upserts GaSnapshot / GaSourceBreakdown rows.
// One property failing (or losing access) never aborts the batch.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  const result = await runGaSync({
    agencyId: url.searchParams.get("agencyId") || undefined,
    maxProperties: intParam(url, "maxProperties"),
    days: intParam(url, "days"),
    accountDelayMs: url.searchParams.get("fast") === "1" ? 0 : undefined,
  });

  return Response.json({ ok: true, ga: result, syncedAt: new Date().toISOString() });
}
