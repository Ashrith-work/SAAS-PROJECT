import { prisma } from "@/lib/prisma";
import { SyncNowForm, type SyncableHotel } from "./SyncNowForm";

// Super-admin manual Meta sync. Lists hotels across ALL agencies — this is the
// platform owner's cross-tenant view (the proxy + admin layout gate /admin to
// super_admin; the action additionally requires ADMIN_PASSWORD). Useful for
// demos and testing before the daily cron has run.

export const dynamic = "force-dynamic";

export default async function AdminSyncNowPage() {
  const rows = await prisma.hotelClient.findMany({
    select: {
      id: true,
      name: true,
      metaAdAccountId: true,
      lastSyncedAt: true,
      agency: { select: { name: true } },
    },
    orderBy: [{ agency: { name: "asc" } }, { name: "asc" }],
  });

  const hotels: SyncableHotel[] = rows.map((h) => ({
    id: h.id,
    name: h.name,
    agencyName: h.agency.name,
    mapped: h.metaAdAccountId != null,
    lastSyncedAt: h.lastSyncedAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Manual Meta sync</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pull a hotel&apos;s trailing ads data right now instead of waiting for
          the daily cron. Hotels without a mapped ad account can&apos;t be
          synced.
        </p>
      </div>

      <SyncNowForm hotels={hotels} />

      <div>
        <h2 className="text-sm font-medium text-zinc-500">Last synced</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {hotels.map((h) => (
            <li key={h.id} className="text-zinc-600 dark:text-zinc-400">
              {h.agencyName} / {h.name} —{" "}
              {h.lastSyncedAt
                ? new Date(h.lastSyncedAt).toLocaleString()
                : "never"}
              {!h.mapped && " (no ad account mapped)"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
