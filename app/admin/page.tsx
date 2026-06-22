import { prisma } from "@/lib/prisma";
import { getPlan } from "@/lib/plans";
import { formatNumber } from "@/lib/format";
import { setAgencySuspended } from "./actions";

// Platform-wide super-admin overview.
//
// NOTE on multi-tenancy: every OTHER query in this app is filtered by agencyId.
// This page is the deliberate, role-gated exception — the platform owner needs a
// cross-tenant view. It stays read-mostly: the only write is suspend/reactivate.

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ status, suspended }: { status: string; suspended: boolean }) {
  if (suspended) {
    return (
      <span className="inline-flex items-center rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
        Suspended
      </span>
    );
  }
  const cls =
    status === "active" || status === "trialing"
      ? "bg-success/15 text-success"
      : "bg-elevated text-ink-tertiary";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default async function AdminOverviewPage() {
  // Cross-tenant aggregates (see note above).
  const [agencies, hotelGroups, bookingGroups, totalHotels, totalEvents] =
    await Promise.all([
      prisma.agency.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          subscriptionStatus: true,
          suspendedAt: true,
          createdAt: true,
        },
      }),
      prisma.hotelClient.groupBy({ by: ["agencyId"], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.trackingEvent.groupBy({
        by: ["agencyId"],
        where: { eventType: "conversion" },
        _count: { _all: true },
      }),
      prisma.hotelClient.count({ where: { deletedAt: null } }),
      prisma.trackingEvent.count(),
    ]);

  const hotelCount = new Map(hotelGroups.map((g) => [g.agencyId, g._count._all]));
  const bookingCount = new Map(bookingGroups.map((g) => [g.agencyId, g._count._all]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Platform overview</h1>
        <p className="mt-1 text-ink-secondary">
          Every agency on HotelTrack, across all tenants.
        </p>
      </div>

      {/* Platform-wide stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Agencies" value={formatNumber(agencies.length)} />
        <StatCard label="Hotels" value={formatNumber(totalHotels)} />
        <StatCard label="Tracking events" value={formatNumber(totalEvents)} />
      </div>

      {/* Agencies table */}
      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-medium text-ink">Agencies</h2>
        </div>
        {agencies.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">No agencies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ht-table w-full text-left text-sm">
              <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-4 py-3 font-medium">Agency</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Hotels</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((a) => {
                  const suspended = a.suspendedAt != null;
                  return (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-ink-tertiary">{a.email}</div>
                      </td>
                      <td className="px-4 py-3">{getPlan(a.plan).name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.subscriptionStatus} suspended={suspended} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(hotelCount.get(a.id) ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(bookingCount.get(a.id) ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={setAgencySuspended} className="inline">
                          <input type="hidden" name="agencyId" value={a.id} />
                          <input type="hidden" name="suspend" value={suspended ? "0" : "1"} />
                          <button
                            type="submit"
                            className={
                              suspended
                                ? "rounded-lg border border-success/40 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10"
                                : "rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                            }
                          >
                            {suspended ? "Reactivate" : "Suspend"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
