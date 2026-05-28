import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

// Per (siteId + IP) cap. Generous enough that a real user's session — a few
// page views + a conversion — never trips it, but tight enough that a scraper
// or a buggy script can't write millions of rows.
const RATE_LIMIT_PER_MIN = 60;

// Public ingestion endpoint for the tracking snippet. Receives "visit" and
// "conversion" events (sent via navigator.sendBeacon as text/plain, so no CORS
// preflight). Resolves the public siteId to a hotel (and its agencyId) and
// records a TrackingEvent. Stores ONLY UTM + page data — never personal data.
// Designed to be fast and resilient: it validates input and never throws on a
// bad payload.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function reply(status: number, body?: unknown) {
  return body === undefined
    ? new Response(null, { status, headers: CORS })
    : Response.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return reply(204);
}

export async function POST(request: Request) {
  // Resilient parse — never throw on malformed input.
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await request.text());
    if (!parsed || typeof parsed !== "object") return reply(400, { error: "Invalid body" });
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }

  const str = (v: unknown) => (typeof v === "string" && v.length ? v.slice(0, 512) : null);

  const siteId = str(body.siteId);
  const type =
    body.type === "conversion" ? "conversion" : body.type === "visit" ? "visit" : null;
  if (!siteId || !type) return reply(400, { error: "Missing siteId or type" });

  const ip = clientIpFromHeaders(request.headers);
  const rl = checkRateLimit(`evt:${siteId}:${ip}`, {
    limit: RATE_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many events" }), {
      status: 429,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Retry-After": Math.ceil(rl.resetInMs / 1000).toString(),
      },
    });
  }

  let hotel;
  try {
    hotel = await prisma.hotelClient.findUnique({
      where: { siteId },
      select: { id: true, agencyId: true, snippetStatus: true },
    });
  } catch {
    return reply(503, { error: "Temporarily unavailable" });
  }

  // Validate the Hotel Site ID — reject unknown IDs.
  if (!hotel) return reply(403, { error: "Unknown site id" });

  let conversionValue: string | null = null;
  if (type === "conversion" && body.value != null) {
    const n = Number(body.value);
    if (Number.isFinite(n) && n >= 0) conversionValue = n.toFixed(2);
  }

  try {
    await prisma.trackingEvent.create({
      data: {
        agencyId: hotel.agencyId,
        hotelClientId: hotel.id,
        eventType: type,
        utmSource: str(body.utmSource),
        utmMedium: str(body.utmMedium),
        utmCampaign: str(body.utmCampaign),
        utmContent: str(body.utmContent),
        utmTerm: str(body.utmTerm),
        pageUrl: str(body.pageUrl) ?? "",
        conversionValue,
        sessionId: str(body.sessionId) ?? "",
        deviceType: str(body.deviceType) ?? "unknown",
      },
    });

    // Always refresh last activity; flip the snippet to "live" on the first event.
    await prisma.hotelClient.update({
      where: { id: hotel.id },
      data: {
        lastEventAt: new Date(),
        ...(hotel.snippetStatus !== "live" ? { snippetStatus: "live" } : {}),
      },
    });
  } catch {
    return reply(503, { error: "Temporarily unavailable" });
  }

  return reply(204);
}
