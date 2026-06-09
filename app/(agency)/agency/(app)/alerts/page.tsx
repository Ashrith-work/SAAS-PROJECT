import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";

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
  critical: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
};

const EMAIL_CLS: Record<string, string> = {
  sent: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
  skipped: "bg-elevated text-ink-tertiary",
  pending: "bg-elevated text-ink-tertiary",
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

  // Multi-tenant: agencyScoped injects { agencyId } automatically.
  const alerts = await agencyScoped(prisma.alert).findMany({
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
        <p className="mt-1 text-ink-tertiary">
          Performance drops, tracking failures, Meta expiries, and weekly
          summaries — and whether each was emailed to {member.agency.email}.
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-12 text-center">
          <p className="text-ink-tertiary">No alerts yet.</p>
          <p className="mt-1 text-sm text-ink-disabled">
            We&apos;ll flag booking drops, broken tracking, and expiring Meta
            connections here as they happen.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
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
                  <span className="text-sm font-medium text-ink-tertiary">All hotels</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Badge
                    label={EMAIL_LABELS[a.emailStatus] ?? a.emailStatus}
                    cls={EMAIL_CLS[a.emailStatus] ?? EMAIL_CLS.pending}
                  />
                  <time className="text-xs text-ink-disabled">{fmtWhen(a.createdAt)}</time>
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-secondary">
                {a.message}
              </p>
              {a.emailStatus === "failed" && a.emailError ? (
                <p className="mt-1 text-xs text-danger">
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
