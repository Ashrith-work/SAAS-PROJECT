import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Alert history for the agency. Read-only audit log of every alert the engine
// raised and tried to email. Multi-tenant: scoped to the signed-in agency.

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  performance_drop: "Performance drop",
  snippet_error: "Snippet error",
  meta_token_expiry: "Meta token expiry",
  weekly_summary: "Weekly summary",
};

const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const EMAIL_CLS: Record<string, string> = {
  sent: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const EMAIL_LABELS: Record<string, string> = {
  sent: "Emailed",
  failed: "Email failed",
  skipped: "Not emailed",
  pending: "Pending",
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function fmtWhen(d: Date): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AlertsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: only this agency's alerts.
  const alerts = await prisma.alert.findMany({
    where: { agencyId: member.agencyId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      emailTo: true,
      emailStatus: true,
      emailError: true,
      createdAt: true,
      hotelClient: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Performance drops, tracking failures, Meta expiries, and weekly
          summaries — and whether each was emailed to {member.agency.email}.
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">No alerts yet.</p>
          <p className="mt-1 text-sm text-zinc-400">
            We&apos;ll flag booking drops, broken tracking, and expiring Meta
            connections here as they happen.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {alerts.map((a) => (
            <li key={a.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={TYPE_LABELS[a.type] ?? a.type}
                  cls={SEVERITY_CLS[a.severity] ?? SEVERITY_CLS.info}
                />
                {a.hotelClient?.name ? (
                  <span className="text-sm font-medium">{a.hotelClient.name}</span>
                ) : (
                  <span className="text-sm font-medium text-zinc-500">All hotels</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Badge
                    label={EMAIL_LABELS[a.emailStatus] ?? a.emailStatus}
                    cls={EMAIL_CLS[a.emailStatus] ?? EMAIL_CLS.pending}
                  />
                  <time className="text-xs text-zinc-400">{fmtWhen(a.createdAt)}</time>
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {a.message}
              </p>
              {a.emailStatus === "failed" && a.emailError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {a.emailError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
