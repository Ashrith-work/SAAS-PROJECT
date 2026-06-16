import { runTagDetection } from "@/lib/instagram-detect";

// GET /api/instagram/detect-tags — daily cron (PART 8). Reads each hotel's
// `/{ig-user-id}/tags` edge, attributes tagged posts to known influencers
// (InfluencerInstagramPost) or parks them as UnattributedMention. Authorized by
// the shared CRON_SECRET bearer, exactly like /api/instagram/sync.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTagDetection();
  return Response.json({ ok: true, ...result, syncedAt: new Date().toISOString() });
}
