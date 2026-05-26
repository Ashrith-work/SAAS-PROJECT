import { prisma } from "@/lib/prisma";

// Public ingestion endpoint for the tracking snippet. Receives "visit" and
// "conversion" events (sent via navigator.sendBeacon as text/plain, so no CORS
// preflight). Resolves the public siteId to a hotel (and its agencyId) and
// records a TrackingEvent. Stores ONLY UTM + page data — never personal data.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Beacons are fire-and-forget; always answer 204 so a bad payload never throws
// a visible error on the hotel's site.
const ok = () => new Response(null, { status: 204, headers: CORS });

export async function OPTIONS() {
  return ok();
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await request.text());
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return ok();
  }

  const str = (v: unknown) =>
    typeof v === "string" && v.length ? v.slice(0, 512) : null;

  const siteId = str(body.siteId);
  const type =
    body.type === "conversion" ? "conversion" : body.type === "visit" ? "visit" : null;
  if (!siteId || !type) return ok();

  const hotel = await prisma.hotelClient.findUnique({
    where: { siteId },
    select: { id: true, agencyId: true },
  });
  if (!hotel) return ok();

  let conversionValue: string | null = null;
  if (type === "conversion" && body.value != null) {
    const n = Number(body.value);
    if (Number.isFinite(n) && n >= 0) conversionValue = n.toFixed(2);
  }

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

  // Best-effort: flag the snippet as live and record last activity.
  await prisma.hotelClient.update({
    where: { id: hotel.id },
    data: { lastEventAt: new Date(), snippetStatus: "active" },
  });

  return ok();
}
