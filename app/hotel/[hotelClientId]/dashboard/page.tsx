import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveHotelForViewer } from "@/lib/hotel-auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped, runWithAgencyScope } from "@/lib/tenant";
import { resolveRange } from "@/lib/attribution";
import { computeFunnel, stageRank, STAGE_LABEL } from "@/lib/funnel";
import { isChannelKey, type ChannelKey } from "@/lib/channel-view";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { OwnerSummaryCard } from "@/components/dashboard/OwnerSummaryCard";
import { PerformanceOverview } from "@/components/dashboard/PerformanceOverview";
import { ChannelSelector } from "@/components/dashboard/ChannelSelector";
import { ChannelView } from "@/components/dashboard/ChannelView";
import { RevenueBySource } from "@/components/dashboard/RevenueBySource";
import { CommissionSavings } from "@/components/dashboard/CommissionSavings";
import { ContactAgencyCard } from "@/components/agency/ContactAgencyCard";
import { HotelDetailsForm } from "./HotelDetailsForm";

// Hotel-owner dashboard. Gives the hotel owner FULL visibility into their OWN
// hotel's data — the same depth an agency analyst sees for this hotel — but with
// none of the agency-operations chrome (no other hotels, no integration
// management, no billing/team/settings).
//
// Security model:
//   • resolveHotelForViewer gates access to THIS hotel only (owner or an agency
//     member of the owning agency); a foreign hotel id → 404.
//   • All data is read through the owner-scoped API routes (/api/hotel/[id]/*),
//     each of which re-checks ownership via requireHotelOwnerAccess, OR through
//     runWithAgencyScope(hotel.agencyId, …) for the server-rendered sections —
//     so every query is scoped to the owning agency + this hotel.
//   • Ad spend is ALWAYS shown to the signed-in owner for their own hotel; the
//     showAdSpendToHotel flag only gates the public /h/ share link.
//   • Only the owner's own contact details are editable. The OTA commission rate
//     is agency-managed (read-only here).

export const dynamic = "force-dynamic";
const HOTEL_API = "/api/hotel";

function relTime(d: Date | null): string {
  if (!d) return "not synced yet";
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const RANGE_PRESETS = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
] as const;

// Compact funnel + last-5 visitor journeys, server-rendered. Mirrors the agency
// dashboard's preview, scoped to this hotel via runWithAgencyScope.
async function loadJourneyPreview(agencyId: string, hotelId: string, since: Date, until: Date) {
  return runWithAgencyScope(agencyId, async () => {
    const [funnelStageGroups, recentSessions] = await Promise.all([
      agencyScoped(prisma.session).groupBy({
        by: ["highestStageReached"],
        where: { hotelClientId: hotelId, startedAt: { gte: since, lte: until } },
        _count: { _all: true },
      }),
      agencyScoped(prisma.session).findMany({
        where: { hotelClientId: hotelId },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: {
          id: true, visitorId: true, startedAt: true, totalTimeMs: true,
          pageViewCount: true, landingPath: true, exitPath: true,
        },
      }),
    ]);

    const reachedByRank: Record<number, number> = {};
    for (const g of funnelStageGroups) {
      const r = stageRank(g.highestStageReached);
      if (r > 0) reachedByRank[r] = (reachedByRank[r] ?? 0) + g._count._all;
    }
    const funnel = computeFunnel({ reachedByRank, revenue: 0 });

    const sessionIds = recentSessions.map((s) => s.id);
    const convertedSessionIds =
      sessionIds.length > 0
        ? new Set(
            (
              await agencyScoped(prisma.trackingEvent).findMany({
                where: { hotelClientId: hotelId, eventType: "conversion", sessionId: { in: sessionIds } },
                select: { sessionId: true },
              })
            ).map((r) => r.sessionId),
          )
        : new Set<string>();

    return { funnel, funnelHasData: (funnel.stages[0]?.visitors ?? 0) > 0, recentSessions, convertedSessionIds };
  });
}

export default async function HotelOwnerDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ hotelClientId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { hotelClientId } = await params;
  const viewer = await resolveHotelForViewer(hotelClientId);
  if (!viewer) notFound();
  const { hotel, canEdit } = viewer;

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });

  const installed = hotel.snippetStatus === "installed";

  // ── Channel deep-dive view (Meta Ads / Instagram / Influencer / …) ──
  const channelParam = one(sp.channel);
  const channel: ChannelKey = isChannelKey(channelParam) ? channelParam : "all";
  if (channel !== "all") {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <Link href={`/hotel/${hotel.id}/dashboard`} className="text-sm text-ink-tertiary hover:underline">
            ← My Dashboard
          </Link>
          <p className="text-sm text-ink-tertiary">{hotel.name}</p>
        </div>
        <ChannelView
          hotelId={hotel.id}
          channel={channel}
          from={range.fromInput}
          to={range.toInput}
          currentRange={range.key}
          apiBase={HOTEL_API}
          ownerView
        />
      </div>
    );
  }

  const showRestrictedNotice = one(sp.notice) === "agency-restricted";

  const journey = await loadJourneyPreview(hotel.agencyId, hotel.id, range.since, range.until);

  function rangeHref(key: string): string {
    return key === "30" ? `/hotel/${hotel.id}/dashboard` : `/hotel/${hotel.id}/dashboard?range=${key}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{hotel.name}</h1>
          <p className="text-sm text-ink-tertiary">
            Managed by {hotel.agency.name} · last synced {relTime(hotel.lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={rangeHref(p.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                range.key === p.key
                  ? "border-brand bg-brand text-white"
                  : "border-line-strong text-ink-secondary hover:bg-elevated"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </header>

      {showRestrictedNotice && (
        <div className="rounded-2xl border border-info/40 bg-info/10 px-4 py-3 text-sm text-ink-secondary sm:px-5">
          That area is managed by your agency and isn&apos;t available to hotel accounts. Here&apos;s your
          dashboard with everything for {hotel.name}.
        </div>
      )}

      {!installed && (
        <section className="rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
          <h2 className="font-medium text-ink">Finish setup: install your tracking snippet</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Your dashboard fills in once your website is sending visits. Ask {hotel.agency.name} if you
            need help getting the tracking snippet installed.
          </p>
        </section>
      )}

      {/* Plain-English performance summary (own period toggle). */}
      <OwnerSummaryCard hotelId={hotel.id} apiBase={HOTEL_API} />

      {/* Full KPI set: marketing spend, cost/booking, ROAS, conversion rate,
          new-vs-returning, device split, bounce, time-on-site, top campaigns. */}
      <PerformanceOverview hotelId={hotel.id} from={range.fromInput} to={range.toInput} apiBase={HOTEL_API} />

      {/* Channel filter — pick a channel for its full deep-dive (Meta spend/CTR/
          CPC/CPM/campaigns, Instagram content, Facebook, Influencer, Direct, Other). */}
      <section className="space-y-2">
        <h2 className="font-medium text-ink">Channels</h2>
        <p className="text-sm text-ink-tertiary">Pick a channel to see its full performance breakdown.</p>
        <ChannelSelector current="all" />
      </section>

      {/* Revenue by Source — 3-way granularity (source / +medium / +campaign). */}
      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-medium text-ink">Revenue by Source</h2>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            Booking revenue and counts per marketing source, with source / medium / campaign drill-down.
          </p>
        </div>
        <div className="p-4">
          <RevenueBySource hotelId={hotel.id} apiBase={HOTEL_API} />
        </div>
      </section>

      {/* Commission Saved vs OTAs — KPI + monthly trend. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-medium text-ink">Commission Saved vs OTAs</h2>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            How much your direct (tracked) bookings saved versus paying OTA commission.
          </p>
        </div>
        <div className="p-4">
          <CommissionSavings hotelId={hotel.id} apiBase={HOTEL_API} />
        </div>
      </section>

      {/* Recent Visitor Journeys + funnel — page-by-page paths and drop-off. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-medium text-ink">Recent Visitor Journeys</h2>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            The page-by-page path recent visitors took, with time on site and drop-off.
          </p>
        </div>
        {journey.funnelHasData && (
          <div className="border-b border-line px-4 py-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              Funnel · {range.label.toLowerCase()}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {journey.funnel.stages.map((st) => (
                <div key={st.stage} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-ink-tertiary">{STAGE_LABEL[st.stage]}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{formatNumber(st.visitors)}</p>
                  <p className="text-xs text-ink-tertiary tabular-nums">
                    {st.conversionFromPrev == null ? "—" : formatPercent(st.conversionFromPrev)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {journey.recentSessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
            No visitor journeys yet. They appear once your website is tracking visits.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {journey.recentSessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <code className="text-xs text-ink-tertiary">
                    {s.visitorId.length > 14 ? `${s.visitorId.slice(0, 14)}…` : s.visitorId}
                  </code>
                  {journey.convertedSessionIds.has(s.id) && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Converted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 tabular-nums text-ink-secondary">
                  <span className="truncate text-ink-tertiary" title={`${s.landingPath} → ${s.exitPath ?? "—"}`}>
                    {s.landingPath}
                    {s.exitPath && s.exitPath !== s.landingPath ? ` → ${s.exitPath}` : ""}
                  </span>
                  <span>{s.pageViewCount} pg</span>
                  <span>{formatDuration(s.totalTimeMs)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Contact the managing agency. */}
      <ContactAgencyCard agencyName={hotel.agency.name} contact={hotel.agency} canEdit={false} viewerIsAgency={false} />

      {/* Owner-editable details. OTA rate is agency-managed (read-only here). */}
      {canEdit && (
        <section className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-medium text-ink">Your hotel details</h2>
            <p className="mt-0.5 text-sm text-ink-tertiary">Keep your contact info and channel manager up to date.</p>
          </div>
          <HotelDetailsForm
            hotelClientId={hotel.id}
            canEditOtaRate={false}
            initial={{
              contactName: hotel.contactName,
              contactEmail: hotel.contactEmail,
              contactPhone: hotel.contactPhone ?? "",
              whatsappNumber: hotel.whatsappNumber ?? "",
              address: hotel.address ?? "",
              otaCommissionRate: hotel.otaCommissionRate == null ? "18" : Number(hotel.otaCommissionRate).toString(),
              channelManager: hotel.channelManager ?? "None",
            }}
          />
        </section>
      )}
    </div>
  );
}
