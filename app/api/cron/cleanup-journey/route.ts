import { prisma } from "@/lib/prisma";

// 90-day retention for visitor-journey data. Runs daily (see vercel.json) and is
// guarded by CRON_SECRET like the other crons. PageViews are deleted first; then
// any Session older than the cutoff (deleting a Session cascades to any remaining
// PageViews, so no orphans survive). Idempotent — safe to run repeatedly.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);

  // Delete old PageViews first (by their own entry time), then old Sessions.
  const pv = await prisma.pageView.deleteMany({ where: { enteredAt: { lt: cutoff } } });
  const ses = await prisma.session.deleteMany({ where: { startedAt: { lt: cutoff } } });

  const result = {
    ok: true,
    cutoff: cutoff.toISOString(),
    pageViewsDeleted: pv.count,
    sessionsDeleted: ses.count,
  };
  console.log("[CLEANUP-JOURNEY]", JSON.stringify(result));
  return Response.json(result);
}
