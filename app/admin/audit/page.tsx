import { redirect } from "next/navigation";
import { getPlatformRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Token audit log — super-admin only. Cross-tenant by design (the platform owner
// needs to see token handling across every agency), gated by the /admin layout
// and re-checked here. Filterable by agency and action via query params.

export const dynamic = "force-dynamic";

const ACTIONS = [
  "created",
  "decrypted",
  "refreshed",
  "rotated",
  "deleted",
  "failed_decrypt",
] as const;

const ACTION_CLS: Record<string, string> = {
  failed_decrypt: "bg-danger/15 text-danger",
  created: "bg-success/15 text-success",
  decrypted: "bg-info/15 text-info",
  refreshed: "bg-info/15 text-info",
  rotated: "bg-warning/15 text-warning",
  deleted: "bg-elevated text-ink-tertiary",
};

function fmt(d: Date): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Defense in depth — the layout already gates /admin to super_admin.
  if ((await getPlatformRole()) !== "super_admin") redirect("/");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const fAgency = one(sp.agency);
  const fAction = one(sp.action);

  const where: Prisma.TokenAuditLogWhereInput = {};
  if (fAgency) where.agencyId = fAgency;
  if ((ACTIONS as readonly string[]).includes(fAction)) {
    where.action = fAction as (typeof ACTIONS)[number];
  }

  // eslint-disable-next-line react-hooks/purity -- async server-component data fetch, not client render
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [agencies, logs, failedCount] = await Promise.all([
    prisma.agency.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tokenAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        tokenType: true,
        action: true,
        success: true,
        errorReason: true,
        ipAddress: true,
        userAgent: true,
        actorId: true,
        source: true,
        createdAt: true,
        agency: { select: { name: true } },
        hotelClient: { select: { name: true } },
      },
    }),
    prisma.tokenAuditLog.count({
      where: {
        action: "failed_decrypt",
        success: false,
        createdAt: { gte: since24h },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Token audit log</h1>
        <p className="mt-1 text-ink-secondary">
          Every encrypt / decrypt of a stored secret across all agencies.
          {failedCount > 0 && (
            <span className="ml-1 font-medium text-danger">
              {failedCount} failed decryption{failedCount === 1 ? "" : "s"} in the last 24h.
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-ink-tertiary">Agency</span>
          <select
            name="agency"
            defaultValue={fAgency}
            className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm text-ink"
          >
            <option value="">All agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-ink-tertiary">Action</span>
          <select
            name="action"
            defaultValue={fAction}
            className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm text-ink"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Filter
        </button>
      </form>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-12 text-center">
          <p className="text-ink-secondary">No audit entries match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Agency</th>
                <th className="px-3 py-2 font-medium">Token</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Actor / source</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className={`border-t border-line ${
                    !l.success ? "bg-danger/10" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-ink-tertiary">{fmt(l.createdAt)}</td>
                  <td className="px-3 py-2">
                    {l.agency.name}
                    {l.hotelClient?.name && (
                      <span className="block text-xs text-ink-tertiary">{l.hotelClient.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{l.tokenType}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        ACTION_CLS[l.action] ?? ACTION_CLS.deleted
                      }`}
                    >
                      {l.action}
                    </span>
                    {!l.success && (
                      <span className="ml-1 text-xs font-medium text-danger">failed</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="block text-xs text-ink-secondary">
                      {l.actorId ?? "system"}
                    </span>
                    <span className="block text-xs text-ink-disabled">{l.source ?? "—"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-tertiary">
                    {l.ipAddress ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-tertiary">
                    {l.errorReason ? (
                      <span className="text-danger">{l.errorReason}</span>
                    ) : (
                      <span className="block max-w-xs truncate" title={l.userAgent ?? ""}>
                        {l.userAgent ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
