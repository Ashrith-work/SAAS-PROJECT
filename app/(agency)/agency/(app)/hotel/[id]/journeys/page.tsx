import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { resolveRange } from "@/lib/attribution";
import { JourneyFilters } from "./JourneyFilters";
import { JourneyList, type JourneySession } from "./JourneyList";

// Per-hotel "Recent Visitor Journeys" — the full page-by-page journey for each
// session (snippet v2 Session/PageView). Every read is agency-scoped (auto
// agencyId via agencyScoped) AND filtered by hotelClientId (multi-tenant safe).

const PAGE_SIZE = 20;

function relativeAgo(d: Date, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function HotelJourneysPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id },
    select: { id: true, name: true, websiteUrl: true },
  });
  if (!hotel) notFound();

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Default range for journeys is the last 7 days.
  const range = resolveRange({ range: one(sp.range) ?? "7", from: one(sp.from), to: one(sp.to) });
  const convertedOnly = one(sp.converted) === "1";
  const utmSource = one(sp.utmSource) || null;
  const landing = one(sp.landing) || null;
  const pageNum = Math.max(1, Number(one(sp.page)) || 1);
  const now = new Date();

  // Conversion session ids in range (for the "Converted" badge + the filter).
  const convRows = await agencyScoped(prisma.trackingEvent).findMany({
    where: {
      hotelClientId: hotel.id,
      eventType: "conversion",
      createdAt: { gte: range.since, lte: range.until },
      NOT: { sessionId: "" },
    },
    select: { sessionId: true },
  });
  const convertedIds = new Set(convRows.map((r) => r.sessionId));

  const where = {
    hotelClientId: hotel.id,
    startedAt: { gte: range.since, lte: range.until },
    ...(utmSource ? { utmSource } : {}),
    ...(landing ? { landingPath: landing } : {}),
    ...(convertedOnly ? { id: { in: [...convertedIds] } } : {}),
  };

  const [total, sessions, utmGroups, landingGroups] = await Promise.all([
    agencyScoped(prisma.session).count({ where }),
    agencyScoped(prisma.session).findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        visitorId: true,
        startedAt: true,
        endedAt: true,
        totalTimeMs: true,
        pageViewCount: true,
        landingPath: true,
        exitPath: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    }),
    // Distinct UTM sources + landing paths for the filter dropdowns (this hotel).
    agencyScoped(prisma.session).groupBy({
      by: ["utmSource"],
      where: { hotelClientId: hotel.id, NOT: { utmSource: null } },
    }),
    agencyScoped(prisma.session).groupBy({
      by: ["landingPath"],
      where: { hotelClientId: hotel.id },
    }),
  ]);

  // Pages for the visible sessions, in one scoped query, grouped for the modal.
  const ids = sessions.map((s) => s.id);
  const pageRows =
    ids.length > 0
      ? await agencyScoped(prisma.pageView).findMany({
          where: { hotelClientId: hotel.id, sessionId: { in: ids } },
          orderBy: { enteredAt: "asc" },
          select: {
            sessionId: true,
            pagePath: true,
            pageTitle: true,
            enteredAt: true,
            exitedAt: true,
            timeOnPageMs: true,
            exitReason: true,
          },
        })
      : [];
  const pagesBySession = new Map<string, JourneySession["pages"]>();
  for (const p of pageRows) {
    const list = pagesBySession.get(p.sessionId) ?? [];
    list.push({
      pagePath: p.pagePath,
      pageTitle: p.pageTitle,
      enteredAt: p.enteredAt.toISOString(),
      timeOnPageMs: p.timeOnPageMs,
      exitReason: p.exitReason,
    });
    pagesBySession.set(p.sessionId, list);
  }

  const items: JourneySession[] = sessions.map((s) => ({
    id: s.id,
    visitorId: s.visitorId,
    startedAtLabel: relativeAgo(s.startedAt, now),
    startedAtISO: s.startedAt.toISOString(),
    durationMs: s.totalTimeMs,
    pageViewCount: s.pageViewCount,
    landingPath: s.landingPath,
    exitPath: s.exitPath,
    utmSource: s.utmSource,
    utmMedium: s.utmMedium,
    utmCampaign: s.utmCampaign,
    converted: convertedIds.has(s.id),
    pages: pagesBySession.get(s.id) ?? [],
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const utmOptions = utmGroups.map((g) => g.utmSource).filter((v): v is string => !!v).sort();
  const landingOptions = landingGroups.map((g) => g.landingPath).sort().slice(0, 100);

  // Build a query string for pagination links, preserving the active filters.
  const baseParams = new URLSearchParams();
  if (range.key === "custom") {
    baseParams.set("from", range.fromInput);
    baseParams.set("to", range.toInput);
  } else {
    baseParams.set("range", range.key);
  }
  if (convertedOnly) baseParams.set("converted", "1");
  if (utmSource) baseParams.set("utmSource", utmSource);
  if (landing) baseParams.set("landing", landing);
  const pageHref = (p: number) => {
    const q = new URLSearchParams(baseParams);
    q.set("page", String(p));
    return `?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/agency/hotel/${hotel.id}`} className="text-sm text-ink-tertiary hover:underline">
          ← {hotel.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Recent Visitor Journeys</h1>
            <p className="text-ink-tertiary">
              Page-by-page paths, time on page, and where visitors dropped off.
            </p>
          </div>
          <p className="text-sm text-ink-tertiary">
            <span className="font-medium text-ink-secondary">{total}</span> session
            {total === 1 ? "" : "s"} · {range.label.toLowerCase()}
          </p>
        </div>
      </div>

      <JourneyFilters
        rangeKey={range.key}
        convertedOnly={convertedOnly}
        utmSource={utmSource}
        landing={landing}
        utmOptions={utmOptions}
        landingOptions={landingOptions}
      />

      <JourneyList sessions={items} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pageNum > 1 ? (
            <Link href={pageHref(pageNum - 1)} className="rounded-lg border border-line-strong bg-elevated px-3 py-1.5 font-medium text-ink-secondary hover:bg-line-strong">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-tertiary">
            Page {pageNum} of {totalPages}
          </span>
          {pageNum < totalPages ? (
            <Link href={pageHref(pageNum + 1)} className="rounded-lg border border-line-strong bg-elevated px-3 py-1.5 font-medium text-ink-secondary hover:bg-line-strong">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
