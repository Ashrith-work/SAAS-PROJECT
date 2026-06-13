import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant-scope";
import { clientIpFrom, hashIp } from "@/lib/hotel-share";
import { isPixelMode } from "@/lib/tracking-mode";
import {
  loadHotelPublicDashboard,
  type HotelPublicDashboard,
} from "@/lib/hotel-dashboard-data";
import {
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { KpiStrip, type KpiCardSpec } from "@/components/dashboard/mission/KpiStrip";
import { FollowerChart } from "@/components/report/FollowerChart";
import { SourcePieChart } from "@/components/report/SourcePieChart";
import { DailyVisitorsChart } from "./DailyVisitorsChart";
import { ContactAgencyCard } from "@/components/agency/ContactAgencyCard";

// Public, no-login, READ-ONLY hotel dashboard, addressed by an unguessable
// 256-bit share token. Access + data isolation are enforced entirely inside this
// route (token validity, revocation, and — critically — every data query is
// scoped to THIS hotel's agencyId + hotelClientId), never by a Clerk session.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your performance dashboard · HotelTrack",
  robots: { index: false, follow: false }, // shared privately; keep out of search
};

const DAY_MS = 86_400_000;

function InactiveLink() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-disabled">
        HotelTrack
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        This link is no longer active
      </h1>
      <p className="mt-2 text-sm text-ink-tertiary">
        Contact your marketing agency for a new link.
      </p>
    </main>
  );
}

function relativeTime(d: Date | null): string {
  if (!d) return "not synced yet";
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-medium text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-tertiary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function ChannelTable({
  rows,
  showAdSpend,
}: {
  rows: HotelPublicDashboard["channels"];
  showAdSpend: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-tertiary">
          <tr>
            <th className="px-4 py-2 font-medium sm:px-5">Channel</th>
            <th className="px-4 py-2 text-right font-medium">Visitors</th>
            <th className="px-4 py-2 text-right font-medium">Bookings</th>
            <th className="px-4 py-2 text-right font-medium">Revenue</th>
            {showAdSpend && (
              <>
                <th className="px-4 py-2 text-right font-medium">Spend</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">True ROAS</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-t border-line">
              <td className="px-4 py-2.5 font-medium text-ink sm:px-5">{r.label}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                {formatNumber(r.visitorsBrought)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                {formatNumber(r.bookings)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                {formatCurrency(r.revenue, { compact: true })}
              </td>
              {showAdSpend && (
                <>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                    {r.spend == null ? "—" : formatCurrency(r.spend, { compact: true })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary sm:px-5">
                    {formatMultiple(r.trueRoas)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-page p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default async function PublicHotelDashboard({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  // The token IS the credential — look the hotel up by it directly (NOT scoped
  // to a session). We deliberately fetch only this one hotel; no other hotel is
  // ever joined or listed.
  const hotel = await prisma.hotelClient.findUnique({
    where: { shareToken },
    select: {
      id: true,
      agencyId: true,
      name: true,
      shareTokenRevoked: true,
      showAdSpendToHotel: true,
      lastSyncedAt: true,
      deletedAt: true,
      agency: {
        select: {
          name: true,
          suspendedAt: true,
          mobile: true,
          contactEmail: true,
          address: true,
          websiteUrl: true,
          whatsappNumber: true,
        },
      },
    },
  });

  // Unknown token, revoked, soft-deleted, or a suspended agency → neutral
  // "inactive" message. We never reveal which reason, and never another hotel's data.
  if (!hotel || hotel.shareTokenRevoked || hotel.deletedAt || hotel.agency.suspendedAt) {
    return <InactiveLink />;
  }

  // Access audit (hashed IP only). Best-effort: a logging failure must never
  // break the dashboard. Stamped with this hotel's agencyId via the scoped client.
  try {
    const h = await headers();
    await agencyScopedFor(hotel.agencyId, prisma.hotelShareAccess).create({
      data: {
        agencyId: hotel.agencyId, // also stamped by the scoped client; kept for type-safety
        hotelClientId: hotel.id,
        ipHash: hashIp(clientIpFrom(h)),
        userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
      },
    });
  } catch {
    // ignore — a missed access-log row must never block the view
  }

  const pixelMode = isPixelMode();
  const until = new Date();
  const since = new Date(until.getTime() - 30 * DAY_MS);
  const showAdSpend = hotel.showAdSpendToHotel;

  const data = await loadHotelPublicDashboard({
    agencyId: hotel.agencyId,
    hotelId: hotel.id,
    since,
    until,
    showAdSpend,
    pixelMode,
  });

  const { kpis, channels, instagram, traffic, otaSavings } = data;

  const kpiCards: KpiCardSpec[] = [
    {
      label: "Revenue",
      value: formatCurrency(kpis.revenue, { compact: true }),
      title: formatCurrency(kpis.revenue),
      delta: null,
    },
    { label: "Bookings", value: formatNumber(kpis.bookings), delta: null },
    {
      label: "Avg booking value",
      value: kpis.adr == null ? "—" : formatCurrency(kpis.adr, { compact: true }),
      title: kpis.adr == null ? undefined : formatCurrency(kpis.adr),
      delta: null,
      hint: "ADR",
    },
    {
      label: "Top channel",
      value: kpis.topChannel ? `${(kpis.topChannel.pct * 100).toFixed(0)}%` : "—",
      delta: null,
      hint: kpis.topChannel ? kpis.topChannel.label : "of bookings",
    },
    {
      label: "Instagram followers",
      value: formatNumber(kpis.followers),
      delta: null,
    },
    {
      label: "Engagement rate",
      value: kpis.engagementRate == null ? "—" : formatPercent(kpis.engagementRate),
      delta: null,
      hint: "Instagram",
    },
    ...(showAdSpend
      ? ([
          {
            label: "Ad spend",
            value: kpis.adSpend == null ? "—" : formatCurrency(kpis.adSpend, { compact: true }),
            title: kpis.adSpend == null ? undefined : formatCurrency(kpis.adSpend),
            delta: null,
          },
          {
            label: "True ROAS",
            value: formatMultiple(kpis.trueRoas),
            delta: null,
            hint: "Real revenue ÷ spend",
          },
        ] satisfies KpiCardSpec[])
      : []),
  ];

  const showChannels = channels.length > 0;
  const showTraffic = traffic.source !== "none" && (traffic.dailyVisitors.length > 0 || traffic.sources.length > 0);
  const showInstagram =
    instagram.connected || instagram.followerSeries.length > 0 || instagram.topPosts.length > 0;

  return (
    <div className="min-h-screen">
      {/* Subtle read-only banner */}
      <div className="border-b border-line bg-elevated/60 px-4 py-2 text-center text-xs text-ink-tertiary">
        Read-only dashboard view shared by your marketing agency.
      </div>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {hotel.name}
          </h1>
          <p className="text-sm text-ink-tertiary">
            Last synced {relativeTime(hotel.lastSyncedAt)} · last 30 days
          </p>
          <p className="text-xs text-ink-disabled">
            Powered by HotelTrack via {hotel.agency.name}
          </p>
        </header>

        {/* KPI strip */}
        <KpiStrip cards={kpiCards} />

        {/* Commission saved vs OTAs — owner-facing savings highlight. */}
        {otaSavings.amount > 0 && (
          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 sm:px-5">
            <p className="text-sm text-ink-secondary">
              Your agency saved you{" "}
              <span className="font-semibold text-success" title={formatCurrency(otaSavings.amount)}>
                {formatCurrency(otaSavings.amount)}
              </span>{" "}
              over the last 30 days by driving direct bookings on your own website instead of OTA
              bookings (at a {otaSavings.rate}% OTA commission rate).
            </p>
          </div>
        )}

        {/* Channel performance — the key view */}
        {showChannels && (
          <Section
            title="Channel performance"
            subtitle="Where your visitors and bookings came from."
          >
            <ChannelTable rows={channels} showAdSpend={showAdSpend} />
          </Section>
        )}

        {/* Instagram performance */}
        {showInstagram && (
          <Section
            title="Instagram performance"
            subtitle={instagram.handle ? `@${instagram.handle}` : undefined}
          >
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3">
              <div className="bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Followers
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {formatNumber(instagram.followers)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  {instagram.followerGrowth >= 0 ? "+" : ""}
                  {formatNumber(instagram.followerGrowth)} this period
                </p>
              </div>
              <div className="bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Engagement rate
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {instagram.engagementRate == null
                    ? "—"
                    : formatPercent(instagram.engagementRate)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">Likes + comments ÷ reach</p>
              </div>
              <div className="col-span-2 bg-card p-4 sm:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Top posts
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {formatNumber(instagram.topPosts.length)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">in the last 30 days</p>
              </div>
            </div>

            {instagram.followerSeries.length > 0 && (
              <div className="p-4 sm:p-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Followers over time
                </p>
                <FollowerChart data={instagram.followerSeries} />
              </div>
            )}

            {instagram.topPosts.length > 0 && (
              <div className="border-t border-line p-4 sm:p-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Top-performing posts
                </p>
                <ul className="space-y-2">
                  {instagram.topPosts.map((p) => (
                    <li
                      key={p.mediaId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-page p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">
                          {p.caption?.trim() || "(no caption)"}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-tertiary">
                          {p.mediaType ?? "post"}
                          {p.postedAt ? ` · ${p.postedAt}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-4 text-right text-xs tabular-nums text-ink-secondary">
                        <span title="Reach">
                          <span className="block text-[10px] uppercase text-ink-disabled">Reach</span>
                          {formatNumber(p.reach)}
                        </span>
                        <span title="Likes">
                          <span className="block text-[10px] uppercase text-ink-disabled">Likes</span>
                          {formatNumber(p.likes)}
                        </span>
                        <span title="Comments">
                          <span className="block text-[10px] uppercase text-ink-disabled">Comments</span>
                          {formatNumber(p.comments)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {/* Website traffic */}
        {showTraffic && (
          <Section
            title="Website traffic"
            subtitle="Visitors to your website over the last 30 days."
          >
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3">
              <MiniStat label="Total visitors" value={formatNumber(traffic.totalSessions)} />
              <MiniStat
                label="Booking conversion"
                value={traffic.conversionRate == null ? "—" : formatPercent(traffic.conversionRate)}
              />
              <MiniStat label="Top sources" value={formatNumber(traffic.sources.length)} />
            </div>

            {traffic.dailyVisitors.length > 0 && (
              <div className="p-4 sm:p-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Daily visitors
                </p>
                <DailyVisitorsChart data={traffic.dailyVisitors} />
              </div>
            )}

            {traffic.sources.length > 0 && (
              <div className="border-t border-line p-4 sm:p-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Traffic by source
                </p>
                <SourcePieChart data={traffic.sources} />
              </div>
            )}
          </Section>
        )}

        {!showChannels && !showInstagram && !showTraffic && (
          <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-ink-tertiary">
            Your dashboard is being set up. Check back soon for bookings, channel
            performance and Instagram insights.
          </div>
        )}

        {/* Contact the managing agency. Hotel owner view: no edit affordance. */}
        <ContactAgencyCard
          agencyName={hotel.agency.name}
          contact={hotel.agency}
          canEdit={false}
          viewerIsAgency={false}
        />

        <footer className="pt-2 text-center text-xs text-ink-disabled">
          Powered by HotelTrack · shared by {hotel.agency.name}
        </footer>
      </main>
    </div>
  );
}
