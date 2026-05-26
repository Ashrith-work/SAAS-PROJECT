import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { utmContentFor } from "@/lib/utm";
import { CopyButton } from "@/components/ui/CopyButton";
import { ContentFilters } from "./ContentFilters";

const CONTENT_TYPES = ["organic", "paid_ad", "influencer", "story"] as const;
type ContentTypeValue = (typeof CONTENT_TYPES)[number];
const PLATFORMS = ["instagram", "facebook", "youtube"] as const;
type PlatformValue = (typeof PLATFORMS)[number];

const TYPE_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_ad: "Paid ad",
  influencer: "Influencer",
  story: "Story",
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};
const STATUS_CLS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const isContentType = (v: string): v is ContentTypeValue =>
  (CONTENT_TYPES as readonly string[]).includes(v);
const isPlatform = (v: string): v is PlatformValue =>
  (PLATFORMS as readonly string[]).includes(v);

// "YYYY-MM-DD" -> Date at the start (or end) of that UTC day, or null.
function parseDay(s: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
  const fHotel = one(sp.hotel);
  const fType = one(sp.type);
  const fPlatform = one(sp.platform);
  const fFrom = one(sp.from);
  const fTo = one(sp.to);

  // Multi-tenant: every filter is layered on top of the agencyId scope.
  const where: Prisma.ContentPieceWhereInput = { agencyId: member.agencyId };
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

  const [hotels, pieces] = await Promise.all([
    prisma.hotelClient.findMany({
      where: { agencyId: member.agencyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contentPiece.findMany({
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
    }),
  ]);

  // Performance metrics, matched on utm_content = ht-<id>.
  //   clicks   = number of visit events (every tracked arrival from this link)
  //   visits   = distinct sessions among those visits (unique visitors)
  //   bookings = number of conversion events
  // The agencyId filter is essential here, not redundant: the public ingest
  // endpoint accepts an attacker-influenced utm_content, so scoping to this
  // agency's events is what stops another tenant's traffic inflating the counts.
  const keys = pieces.map((p) => utmContentFor(p.id));
  const metrics = new Map<string, { clicks: number; visits: number; bookings: number }>();
  const blank = () => ({ clicks: 0, visits: 0, bookings: 0 });

  if (keys.length > 0) {
    const [grouped, distinctVisits] = await Promise.all([
      prisma.trackingEvent.groupBy({
        by: ["utmContent", "eventType"],
        where: { agencyId: member.agencyId, utmContent: { in: keys } },
        _count: { _all: true },
      }),
      prisma.trackingEvent.findMany({
        where: { agencyId: member.agencyId, utmContent: { in: keys }, eventType: "visit" },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Content Library</h1>
        <Link
          href="/agency/content/new"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          New Content Piece
        </Link>
      </div>

      <ContentFilters
        hotels={hotels}
        current={{ hotel: fHotel, type: fType, platform: fPlatform, from: fFrom, to: fTo }}
      />

      {pieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            No content pieces match these filters.
          </p>
          <Link
            href="/agency/content/new"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Create your first content piece
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 font-medium">Content</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 text-right font-medium">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium">Visits</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => {
                  const m = metrics.get(utmContentFor(p.id)) ?? blank();
                  return (
                    <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-zinc-500">
                          {p.hotelClient.name}
                          {p.influencerName ? ` · ${p.influencerName}` : ""}
                          {p.couponCode ? ` · ${p.couponCode}` : ""}
                          {` · ${p.createdAt.toLocaleDateString()}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {TYPE_LABELS[p.contentType] ?? p.contentType}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {PLATFORM_LABELS[p.platform] ?? p.platform}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.clicks}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.visits}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.bookings}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_CLS[p.status] ??
                            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CopyButton
                          text={p.utmLink}
                          label="Copy link"
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            <strong>Clicks</strong> counts every tracked arrival from a link;{" "}
            <strong>visits</strong> counts the unique sessions behind them;{" "}
            <strong>bookings</strong> counts conversions. All are matched to a
            piece via its <code>utm_content</code> tag.
          </p>
        </>
      )}
    </div>
  );
}
