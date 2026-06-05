import { runInstagramSync } from "@/lib/instagram-sync";

// Scheduled Instagram (IGAA) sync. Runs daily at 6am UTC via Vercel Cron and
// can be triggered manually for testing. Guarded by CRON_SECRET — Vercel Cron
// sends `Authorization: Bearer <CRON_SECRET>` automatically.
//
// For every InstagramConnection with status="active", pulls daily account
// insights (SocialSnapshot) + recent media (PostSnapshot). Idempotent upserts;
// one connection's failure never aborts the run (it's marked status="error",
// a SyncFailure is recorded, and the agency is emailed). NEVER logs tokens.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Many connections with spaced per-media calls can take a while.
export const maxDuration = 300;

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

  // Optional ?days=N (1–90) for manual re-pulls; the daily run uses 2.
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const daysRaw = daysParam == null ? NaN : Number(daysParam);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 90) : 2;

  const result = await runInstagramSync({ days });
  return Response.json({ ok: true, days, ...result, syncedAt: new Date().toISOString() });
}
