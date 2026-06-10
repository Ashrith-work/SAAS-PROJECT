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

  // Coerce to a bounded, clean string. Defense in depth for spreadsheet-formula
  // / CSV injection (audit H-1): strip ASCII control chars (incl. TAB/CR/LF that
  // can trigger a formula) and cap length. The real fix is export-time
  // neutralization in lib/xlsx.ts — this only trims the attack surface.
  const str = (v: unknown) => {
    if (typeof v !== "string" || !v.length) return null;
    const cleaned = Array.from(v).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("").slice(0, 512);
    return cleaned.length ? cleaned : null;
  };

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

  const visitorId = str(body.visitorId);

  // Multi-touch journey: only on conversion, only a well-formed array. Cap at 20
  // touches, coerce/clip each field, parse the timestamp. Parsed defensively so a
  // malformed journey can never block the conversion write below.
  type TouchRow = {
    position: number;
    timestamp: Date;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    referrer: string | null;
    landingPage: string | null;
  };
  let touches: TouchRow[] = [];
  if (type === "conversion" && Array.isArray(body.journey)) {
    try {
      touches = body.journey.slice(0, 20).map((raw, i): TouchRow => {
        const tp = (raw ?? {}) as Record<string, unknown>;
        const tsNum = Number(tp.ts);
        return {
          position: i + 1,
          timestamp: Number.isFinite(tsNum) ? new Date(tsNum) : new Date(),
          utmSource: str(tp.utm_source),
          utmMedium: str(tp.utm_medium),
          utmCampaign: str(tp.utm_campaign),
          utmContent: str(tp.utm_content),
          referrer: str(tp.referrer),
          landingPage: str(tp.landing_page),
        };
      });
    } catch {
      touches = [];
    }
  }

  try {
    const ev = await prisma.trackingEvent.create({
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
        visitorId,
        deviceType: str(body.deviceType) ?? "unknown",
      },
      select: { id: true },
    });

    // Persist the journey as Touchpoint rows linked to this conversion. Same
    // base client + explicit agencyId as the event above (tenant-safe).
    if (touches.length > 0) {
      await prisma.touchpoint.createMany({
        data: touches.map((t) => ({
          agencyId: hotel.agencyId,
          hotelClientId: hotel.id,
          visitorId: visitorId ?? "",
          conversionId: ev.id,
          position: t.position,
          timestamp: t.timestamp,
          utmSource: t.utmSource,
          utmMedium: t.utmMedium,
          utmCampaign: t.utmCampaign,
          utmContent: t.utmContent,
          referrer: t.referrer,
          landingPage: t.landingPage,
        })),
      });
    }

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
