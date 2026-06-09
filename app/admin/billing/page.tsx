import { prisma } from "@/lib/prisma";
import { getPlan, isActiveStatus, formatInr, PLANS } from "@/lib/razorpay-plans";
import { formatNumber } from "@/lib/format";
import { extendSubscription, refundLastPayment } from "./actions";

// Super-admin billing overview. Like /admin, this is the deliberate, role-gated
// exception to the per-agency isolation rule: the platform owner needs a
// cross-tenant view of every subscription, MRR, and the ability to comp/refund.

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = isActiveStatus(status)
    ? "bg-success/15 text-success"
    : status === "paused"
      ? "bg-warning/15 text-warning"
      : "bg-elevated text-ink-tertiary";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function Banner({ sp }: { sp: SP }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (one(sp.extend) === "ok") {
    return <Note ok>Subscription extended.</Note>;
  }
  if (one(sp.refund) === "ok") {
    return <Note ok>Refund issued via Razorpay.</Note>;
  }
  if (one(sp.refund) === "err") {
    return <Note>Couldn&apos;t issue a refund — no captured payment found, or Razorpay rejected it.</Note>;
  }
  return null;
}

function Note({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <div
      className={
        ok
          ? "rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success"
          : "rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
      }
    >
      {children}
    </div>
  );
}

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const agencies = await prisma.agency.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      razorpaySubscriptionId: true,
    },
  });

  const activeAgencies = agencies.filter((a) => isActiveStatus(a.subscriptionStatus));
  const mrrPaise = activeAgencies.reduce((sum, a) => sum + (PLANS[a.plan as keyof typeof PLANS]?.pricePaise ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Billing</h1>
        <p className="mt-1 text-ink-secondary">
          Every agency&apos;s subscription, across all tenants.
        </p>
      </div>

      <Banner sp={sp} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Monthly recurring revenue" value={formatInr(mrrPaise)} />
        <StatCard label="Active subscriptions" value={formatNumber(activeAgencies.length)} />
        <StatCard label="Total agencies" value={formatNumber(agencies.length)} />
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-medium text-ink">Subscriptions</h2>
        </div>
        {agencies.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-tertiary">No agencies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-4 py-3 font-medium">Agency</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Renews</th>
                  <th className="px-4 py-3 text-right font-medium">MRR</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((a) => {
                  const active = isActiveStatus(a.subscriptionStatus);
                  return (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-ink-tertiary">{a.email}</div>
                      </td>
                      <td className="px-4 py-3">{getPlan(a.plan).name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {a.subscriptionExpiresAt
                          ? new Date(a.subscriptionExpiresAt).toLocaleDateString("en-IN")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {active ? `${formatInr(PLANS[a.plan as keyof typeof PLANS]?.pricePaise ?? 0)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <form action={extendSubscription}>
                            <input type="hidden" name="agencyId" value={a.id} />
                            <input type="hidden" name="days" value="30" />
                            <button
                              type="submit"
                              className="rounded-lg border border-line-strong bg-elevated px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-line-strong"
                            >
                              +30 days
                            </button>
                          </form>
                          <form action={refundLastPayment}>
                            <input type="hidden" name="agencyId" value={a.id} />
                            <button
                              type="submit"
                              disabled={!a.razorpaySubscriptionId}
                              className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                            >
                              Refund last
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-tertiary">
        MRR sums the list price of every <strong>active</strong> plan. &ldquo;+30 days&rdquo;
        comps access without taking payment. &ldquo;Refund last&rdquo; refunds the most
        recent captured payment through Razorpay.
      </p>
    </div>
  );
}
