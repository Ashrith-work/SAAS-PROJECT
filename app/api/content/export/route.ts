import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";
import { getCurrentMember } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { utmContentFor } from "@/lib/utm";
import { csvResponse, slugForFile, toCsv } from "@/lib/csv";
import { sanitizeRows } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirrors /agency/content — same filter semantics (hotel / type / platform /
// from / to) and same computed metrics (clicks / visits / bookings). Filters
// are read from the same query params the page uses, so a user can hit Export
// after narrowing the filters and the file reflects exactly what's on screen.

const CONTENT_TYPES = ["organic", "paid_ad", "influencer", "story"] as const;
const PLATFORMS = ["instagram", "facebook", "youtube"] as const;
type ContentTypeValue = (typeof CONTENT_TYPES)[number];
type PlatformValue = (typeof PLATFORMS)[number];
const isContentType = (v: string): v is ContentTypeValue =>
  (CONTENT_TYPES as readonly string[]).includes(v);
const isPlatform = (v: string): v is PlatformValue =>
  (PLATFORMS as readonly string[]).includes(v);

function parseDay(s: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Throttle expensive report generation per signed-in member. Fails OPEN so a
  // store outage never blocks a paying user's export.
  const rl = await rateLimit("export", member.id);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
  const fHotel = url.searchParams.get("hotel") ?? "";
  const fType = url.searchParams.get("type") ?? "";
  const fPlatform = url.searchParams.get("platform") ?? "";
  const fFrom = url.searchParams.get("from") ?? "";
  const fTo = url.searchParams.get("to") ?? "";

  // agencyScoped injects { agencyId }; these are the extra UI filters.
  const where: Prisma.ContentPieceWhereInput = {};
  if (fHotel) where.hotelClientId = fHotel;
  if (isContentType(fType)) where.contentType = fType;
  if (isPlatform(fPlatform)) where.platform = fPlatform;
  const fromDate = parseDay(fFrom, false);
  const toDate = parseDay(fTo, true);
  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const pieces = await agencyScoped(prisma.contentPiece).findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      contentType: true,
      platform: true,
      couponCode: true,
      influencerName: true,
      status: true,
      createdAt: true,
      utmLink: true,
      hotelClient: { select: { name: true } },
    },
  });

  const keys = pieces.map((p) => utmContentFor(p.id));
  const metrics = new Map<string, { clicks: number; visits: number; bookings: number }>();
  const blank = () => ({ clicks: 0, visits: 0, bookings: 0 });

  if (keys.length > 0) {
    const [grouped, distinctVisits] = await Promise.all([
      agencyScoped(prisma.trackingEvent).groupBy({
        by: ["utmContent", "eventType"],
        where: { utmContent: { in: keys } },
        _count: { _all: true },
      }),
      agencyScoped(prisma.trackingEvent).findMany({
        where: { utmContent: { in: keys }, eventType: "visit" },
        select: { utmContent: true, sessionId: true },
        distinct: ["utmContent", "sessionId"],
      }),
    ]);
    for (const g of grouped) {
      if (!g.utmContent) continue;
      const m = metrics.get(g.utmContent) ?? blank();
      if (g.eventType === "visit") m.clicks = g._count._all;
      else if (g.eventType === "conversion") m.bookings = g._count._all;
      metrics.set(g.utmContent, m);
    }
    for (const row of distinctVisits) {
      if (!row.utmContent) continue;
      const m = metrics.get(row.utmContent) ?? blank();
      m.visits += 1;
      metrics.set(row.utmContent, m);
    }
  }

  const rows = pieces.map((p) => {
    const m = metrics.get(utmContentFor(p.id)) ?? blank();
    return {
      Content: p.title,
      Hotel: p.hotelClient.name,
      Type: p.contentType,
      Platform: p.platform,
      Influencer: p.influencerName ?? "",
      Coupon: p.couponCode ?? "",
      Status: p.status,
      Created: p.createdAt.toISOString().slice(0, 10),
      Clicks: m.clicks,
      Visits: m.visits,
      Bookings: m.bookings,
      Link: p.utmLink,
    };
  });

  const baseName = `content-library-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    return csvResponse(toCsv(rows), `${slugForFile(baseName)}.csv`);
  }

  const ws = XLSX.utils.json_to_sheet(
    sanitizeRows(
      rows.length
        ? rows
        : [
            {
              Content: "",
              Hotel: "",
              Type: "",
              Platform: "",
              Influencer: "",
              Coupon: "",
              Status: "",
              Created: "",
              Clicks: 0,
              Visits: 0,
              Bookings: 0,
              Link: "",
            },
          ],
    ),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Content Library");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slugForFile(baseName)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
