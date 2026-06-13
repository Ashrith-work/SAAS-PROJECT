import { notFound } from "next/navigation";
import { resolveHotelForViewer } from "@/lib/hotel-auth";
import { loadHotelPublicDashboard } from "@/lib/hotel-dashboard-data";
import { isPixelMode } from "@/lib/tracking-mode";
import { formatCurrency, formatMultiple, formatNumber, formatPercent } from "@/lib/format";
import { KpiStrip, type KpiCardSpec } from "@/components/dashboard/mission/KpiStrip";
import { ContactAgencyCard } from "@/components/agency/ContactAgencyCard";
import { HotelDetailsForm } from "./HotelDetailsForm";

// Hotel-owner dashboard. Shows ONLY this hotel's data (session-less data layer,
// scoped to the hotel's own agencyId+id — never the whole agency). Read-only
// except the owner's own details. Access is enforced by resolveHotelForViewer.

export const dynamic = "force-dynamic";
const DAY_MS = 86_400_000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function relTime(d: Date | null): string {
  if (!d) return "not synced yet";
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function HotelOwnerDashboard({ params }: { params: Promise<{ hotelClientId: string }> }) {
  const { hotelClientId } = await params;
  const viewer = await resolveHotelForViewer(hotelClientId);
  if (!viewer) notFound();
  const { hotel, canEdit } = viewer;

  const until = new Date();
  const since = new Date(until.getTime() - 30 * DAY_MS);
  const showAdSpend = hotel.showAdSpendToHotel;
  const data = await loadHotelPublicDashboard({
    agencyId: hotel.agencyId, hotelId: hotel.id, since, until, showAdSpend, pixelMode: isPixelMode(),
  });
  const { kpis, channels, otaSavings } = data;

  const installed = hotel.snippetStatus === "installed";
  const snippet = `<script async src="${APP_URL}/t.js" data-ht-site="${hotel.siteId}"></script>`;

  const kpiCards: KpiCardSpec[] = [
    { label: "Revenue", value: formatCurrency(kpis.revenue, { compact: true }), title: formatCurrency(kpis.revenue), delta: null },
    { label: "Bookings", value: formatNumber(kpis.bookings), delta: null },
    { label: "Avg booking value", value: kpis.adr == null ? "—" : formatCurrency(kpis.adr, { compact: true }), delta: null, hint: "ADR" },
    { label: "Top channel", value: kpis.topChannel ? `${(kpis.topChannel.pct * 100).toFixed(0)}%` : "—", delta: null, hint: kpis.topChannel?.label ?? "of bookings" },
    { label: "Instagram followers", value: formatNumber(kpis.followers), delta: null },
    { label: "Engagement rate", value: kpis.engagementRate == null ? "—" : formatPercent(kpis.engagementRate), delta: null, hint: "Instagram" },
    ...(showAdSpend
      ? ([
          { label: "Ad spend", value: kpis.adSpend == null ? "—" : formatCurrency(kpis.adSpend, { compact: true }), delta: null },
          { label: "True ROAS", value: formatMultiple(kpis.trueRoas), delta: null, hint: "Real revenue ÷ spend" },
        ] satisfies KpiCardSpec[])
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{hotel.name}</h1>
        <p className="text-sm text-ink-tertiary">
          Managed by {hotel.agency.name} · last synced {relTime(hotel.lastSyncedAt)} · last 30 days
        </p>
      </header>

      {!installed && (
        <section className="rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
          <h2 className="font-medium text-ink">Finish setup: install your tracking snippet</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Paste this just before <code>&lt;/head&gt;</code> on your website so we can attribute your bookings.
            Your dashboard will fill in once visits start coming through.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-page p-3 text-xs text-ink">{snippet}</pre>
        </section>
      )}

      <KpiStrip cards={kpiCards} />

      {otaSavings.amount > 0 && (
        <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 sm:px-5">
          <p className="text-sm text-ink-secondary">
            Your agency saved you{" "}
            <span className="font-semibold text-success">{formatCurrency(otaSavings.amount)}</span>{" "}
            over the last 30 days by driving direct bookings instead of OTA bookings (at a {otaSavings.rate}% OTA commission rate).
          </p>
        </div>
      )}

      {channels.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-medium text-ink">Channel performance</h2>
            <p className="mt-0.5 text-sm text-ink-tertiary">Where your visitors and bookings came from.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2 font-medium sm:px-5">Channel</th>
                  <th className="px-4 py-2 text-right font-medium">Visitors</th>
                  <th className="px-4 py-2 text-right font-medium">Bookings</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((r) => (
                  <tr key={r.source} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium text-ink sm:px-5">{r.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{formatNumber(r.visitorsBrought)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{formatNumber(r.bookings)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink sm:px-5">{formatCurrency(r.revenue, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Contact the managing agency. */}
      <ContactAgencyCard agencyName={hotel.agency.name} contact={hotel.agency} canEdit={false} viewerIsAgency={false} />

      {/* Owner-editable details. */}
      {canEdit && (
        <section className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-medium text-ink">Your hotel details</h2>
            <p className="mt-0.5 text-sm text-ink-tertiary">Keep your contact info, OTA rate and channel manager up to date.</p>
          </div>
          <HotelDetailsForm
            hotelClientId={hotel.id}
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
