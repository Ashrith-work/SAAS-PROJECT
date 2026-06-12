import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

// Public ingestion endpoint for the tracking snippet. Handles four event types:
//
//   visit       — legacy v1 snippet page visit → one TrackingEvent (back-compat).
//   pageview    — v2 page load → a TrackingEvent visit (so existing dashboards
//                 keep working) PLUS Session/PageView journey rows.
//   page_exit   — v2 page leave → closes the open PageView with time-on-page.
//   conversion  — booking → TrackingEvent conversion + multi-touch Touchpoints.
//
// Events arrive via navigator.sendBeacon as text/plain (no CORS preflight). We
// resolve the public siteId to a hotel (+ agencyId) and store ONLY UTM + page
// data — never personal data. Fast + resilient: validates input, never throws.

// Per-(siteId + IP) cap for visit/conversion. Generous for a real user, tight
// enough to stop a flood.
const RATE_LIMIT_PER_MIN = 60;
// Journey events (pageview/page_exit) fire on every page, so they get a higher,
// per-visitor cap (Part 2: 200/min per visitorId).
const JOURNEY_RATE_LIMIT_PER_MIN = 200;

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

// ── Validation helpers ───────────────────────────────────────────────────────

// Coerce to a bounded, clean string. Defense in depth for spreadsheet-formula /
// CSV injection (audit H-1): strip ASCII control chars and cap length.
function str(v: unknown): string | null {
  if (typeof v !== "string" || !v.length) return null;
  const cleaned = Array.from(v)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join("")
    .slice(0, 512);
  return cleaned.length ? cleaned : null;
}

// 'sess_' + uuid (36 chars incl hyphens).
const isSessionId = (v: unknown): v is string =>
  typeof v === "string" && /^sess_[0-9a-fA-F-]{36}$/.test(v);
// 'vis_' + uuid OR a legacy id seeded from _ht_vid — lenient charset.
const isVisitorId = (v: unknown): v is string =>
  typeof v === "string" && /^vis_[\w-]{6,64}$/.test(v);

// A page path: non-empty, starts with '/', <= 500 chars, control chars stripped.
function pagePathOf(v: unknown): string | null {
  const s = str(v);
  if (!s || s[0] !== "/" || s.length > 500) return null;
  return s;
}

// A non-negative int within a sane bound (viewport dims), else null.
function intOf(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 100_000 ? n : null;
}

// Event timestamp must be recent — within the last 5 minutes (replay guard) and
// not meaningfully in the future. Returns the Date, or null when out of window.
function recentTs(v: unknown): Date | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const now = Date.now();
  if (n > now + 60_000) return null; // > 1 min ahead
  if (n < now - 5 * 60_000) return null; // > 5 min stale
  return new Date(n);
}

type Hotel = { id: string; agencyId: string; snippetStatus: string; deletedAt: Date | null };

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

  const siteId = str(body.siteId);
  const rawType = body.type;
  const type =
    rawType === "conversion"
      ? "conversion"
      : rawType === "pageview"
        ? "pageview"
        : rawType === "page_exit"
          ? "page_exit"
          : rawType === "visit"
            ? "visit"
            : null;
  if (!siteId || !type) return reply(400, { error: "Missing siteId or type" });

  const ip = clientIpFromHeaders(request.headers);
  const visitorId = str(body.visitorId);
  const isJourney = type === "pageview" || type === "page_exit";

  // Rate limit — per-visitor for journey events, per-(site+IP) for the rest.
  const rl = isJourney
    ? checkRateLimit(`pv:${visitorId ?? ip}`, { limit: JOURNEY_RATE_LIMIT_PER_MIN, windowMs: 60_000 })
    : checkRateLimit(`evt:${siteId}:${ip}`, { limit: RATE_LIMIT_PER_MIN, windowMs: 60_000 });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many events" }), {
      status: 429,
      headers: { ...CORS, "Content-Type": "application/json", "Retry-After": Math.ceil(rl.resetInMs / 1000).toString() },
    });
  }

  let hotel: Hotel | null;
  try {
    hotel = await prisma.hotelClient.findUnique({
      where: { siteId },
      select: { id: true, agencyId: true, snippetStatus: true, deletedAt: true },
    });
  } catch {
    return reply(503, { error: "Temporarily unavailable" });
  }
  if (!hotel) return reply(403, { error: "Unknown site id" });

  // Soft-deleted hotels do NOT accept new journey events (Part 7) — drop silently.
  // Legacy visit/conversion are still accepted (so a reactivation loses nothing).
  if (hotel.deletedAt && isJourney) return reply(204);

  try {
    if (type === "page_exit") {
      await handlePageExit(hotel, body);
      return reply(204);
    }
    await handleVisitLike(hotel, type, body, visitorId);
  } catch {
    return reply(503, { error: "Temporarily unavailable" });
  }

  return reply(204);
}

// ── page_exit: close the open PageView for this session + hotel ───────────────
async function handlePageExit(hotel: Hotel, body: Record<string, unknown>) {
  const sessionId = body.sessionId;
  if (!isSessionId(sessionId)) return; // malformed — ignore
  const ts = recentTs(body.timestamp);
  if (!ts) return; // out-of-window — ignore (replay guard)
  const exitReason = str(body.exitReason);
  const reason =
    exitReason === "navigation" || exitReason === "unload" || exitReason === "inactivity_timeout"
      ? exitReason
      : null;

  await prisma.$transaction(async (tx) => {
    // hotelClientId-scoped so a guessed sessionId can't close another site's page.
    const open = await tx.pageView.findFirst({
      where: { sessionId, hotelClientId: hotel.id, exitedAt: null },
      orderBy: { enteredAt: "desc" },
      select: { id: true, enteredAt: true },
    });
    if (!open) return;

    const timeOnPageMs = Math.max(0, ts.getTime() - open.enteredAt.getTime());
    await tx.pageView.update({
      where: { id: open.id },
      data: { exitedAt: ts, timeOnPageMs, exitReason: reason },
    });
    await tx.session.update({
      where: { id: sessionId },
      data: {
        totalTimeMs: { increment: timeOnPageMs },
        // unload / inactivity end the session; navigation keeps it open.
        ...(reason === "unload" || reason === "inactivity_timeout" ? { endedAt: ts } : {}),
      },
    });
  });
}

// ── visit / pageview / conversion: always write a TrackingEvent; pageview also
//    writes Session + PageView journey rows ─────────────────────────────────
async function handleVisitLike(
  hotel: Hotel,
  type: "visit" | "pageview" | "conversion",
  body: Record<string, unknown>,
  visitorId: string | null,
) {
  if (hotel.deletedAt) {
    console.log("[TRACK] hotel_deleted", JSON.stringify({ hotelClientId: hotel.id, type }));
  }

  // TrackingEvent: pageview is recorded as a "visit" (preserves every existing
  // visit-based dashboard/metric). Only "conversion" is its own event type.
  const eventType = type === "conversion" ? "conversion" : "visit";

  let conversionValue: string | null = null;
  if (type === "conversion" && body.value != null) {
    const n = Number(body.value);
    if (Number.isFinite(n) && n >= 0) conversionValue = n.toFixed(2);
  }

  const teData = {
    agencyId: hotel.agencyId,
    hotelClientId: hotel.id,
    eventType,
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
  } as const;

  // Multi-touch journey (conversion only) — same parsing as before.
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

  // For pageview, decide whether the journey rows can be written: well-formed ids
  // + path + fresh timestamp. If not, we still write the TrackingEvent (data is
  // never lost) but skip the Session/PageView rows.
  const sessionId = body.sessionId;
  const pagePath = pagePathOf(body.pagePath);
  const ts = recentTs(body.timestamp);
  const canJourney =
    type === "pageview" &&
    isSessionId(sessionId) &&
    isVisitorId(visitorId) &&
    !!pagePath &&
    !!ts;

  await prisma.$transaction(async (tx) => {
    if (canJourney) {
      // Guard against a sessionId minted on another hotel's site (cross-tenant):
      // if the session already exists under a DIFFERENT hotel, skip journey rows.
      const existing = await tx.session.findUnique({
        where: { id: sessionId as string },
        select: { hotelClientId: true },
      });
      const foreign = existing && existing.hotelClientId !== hotel.id;

      if (!foreign) {
        await tx.session.upsert({
          where: { id: sessionId as string },
          create: {
            id: sessionId as string,
            visitorId: visitorId as string,
            hotelClientId: hotel.id,
            agencyId: hotel.agencyId,
            startedAt: ts as Date,
            landingPath: pagePath as string,
            exitPath: pagePath as string,
            pageViewCount: 1,
            utmSource: str(body.utmSource),
            utmMedium: str(body.utmMedium),
            utmCampaign: str(body.utmCampaign),
            utmContent: str(body.utmContent),
            utmTerm: str(body.utmTerm),
            referrer: str(body.referrer),
            userAgent: str(body.userAgent),
          },
          update: { pageViewCount: { increment: 1 }, exitPath: pagePath as string },
        });
        await tx.pageView.create({
          data: {
            sessionId: sessionId as string,
            visitorId: visitorId as string,
            hotelClientId: hotel.id,
            agencyId: hotel.agencyId,
            pagePath: pagePath as string,
            pageTitle: str(body.pageTitle),
            referrer: str(body.referrer),
            enteredAt: ts as Date,
            viewportWidth: intOf(body.viewportWidth),
            viewportHeight: intOf(body.viewportHeight),
          },
        });
      }
    }

    const ev = await tx.trackingEvent.create({ data: teData, select: { id: true } });

    if (touches.length > 0) {
      await tx.touchpoint.createMany({
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
    await tx.hotelClient.update({
      where: { id: hotel.id },
      data: {
        lastEventAt: new Date(),
        ...(hotel.snippetStatus !== "live" ? { snippetStatus: "live" } : {}),
      },
    });
  });
}
