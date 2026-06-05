import { prisma } from "@/lib/prisma";
import { getTokenForApiCall } from "@/lib/token-access";
import { encryptWithAudit } from "@/lib/token-audit";
import { refreshLongLivedToken, InstagramAuthError } from "@/lib/instagram";

// IGAA token auto-refresh — the reason Instagram tokens never expire here.
// A long-lived IGAA token (60 days) older than 24h can be exchanged for a
// fresh 60-day one indefinitely. This cron runs weekly (Mondays 3am UTC) and
// rolls forward every active connection expiring within the next 14 days, so
// as long as the cron keeps running, hotels never have to reconnect.
//
// Guarded by CRON_SECRET. Tokens are decrypted in memory only, re-encrypted
// immediately, and NEVER logged.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DAY_MS = 86_400_000;
const REFRESH_WINDOW_DAYS = 14;

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

  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * DAY_MS);
  const connections = await prisma.instagramConnection.findMany({
    where: {
      status: "active",
      tokenType: "igaa_direct",
      tokenExpiresAt: { lte: cutoff },
    },
    select: { id: true, agencyId: true, hotelClientId: true },
  });

  let refreshed = 0;
  let failed = 0;
  const errors: { hotelClientId: string; error: string }[] = [];

  for (const conn of connections) {
    try {
      const current = await getTokenForApiCall("instagram", conn.id, {
        agencyId: conn.agencyId,
        hotelClientId: conn.hotelClientId,
        source: "cron:instagram-refresh",
      });

      const next = await refreshLongLivedToken(current.reveal());

      const encryptedToken = await encryptWithAudit(next.accessToken, {
        agencyId: conn.agencyId,
        hotelClientId: conn.hotelClientId,
        tokenType: "instagram",
        source: "cron:instagram-refresh",
      });

      await prisma.instagramConnection.update({
        where: { id: conn.id },
        data: {
          encryptedToken,
          tokenExpiresAt: next.expiresAt,
          lastRefreshedAt: new Date(),
        },
      });
      refreshed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Unknown refresh error.";
      // A dead token can't be refreshed — flag the connection so the UI prompts
      // a reconnect; other errors leave it active for the next weekly attempt.
      if (err instanceof InstagramAuthError) {
        await prisma.instagramConnection.update({
          where: { id: conn.id },
          data: { status: "error", errorMessage: message },
        });
      }
      errors.push({ hotelClientId: conn.hotelClientId, error: message });
    }
  }

  return Response.json({
    ok: true,
    candidates: connections.length,
    refreshed,
    failed,
    errors,
    ranAt: new Date().toISOString(),
  });
}
