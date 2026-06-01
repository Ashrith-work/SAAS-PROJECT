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
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = isActiveStatus(status)
    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
    : status === "paused"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
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
          ? "rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300"
          : "rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300"
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
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Every agency&apos;s subscription, across all tenants.
        </p>
      </div>

      <Banner sp={sp} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Monthly recurring revenue" value={formatInr(mrrPaise)} />
        <StatCard label="Active subscriptions" value={formatNumber(activeAgencies.length)} />
        <StatCard label="Total agencies" value={formatNumber(agencies.length)} />
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-medium">Subscriptions</h2>
        </div>
        {agencies.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No agencies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
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
                    <tr key={a.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-zinc-500">{a.email}</div>
                      </td>
                      <td className="px-4 py-3">{getPlan(a.plan).name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
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
                              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              +30 days
                            </button>
                          </form>
                          <form action={refundLastPayment}>
                            <input type="hidden" name="agencyId" value={a.id} />
                            <button
                              type="submit"
                              disabled={!a.razorpaySubscriptionId}
                              className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
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

      <p className="text-xs text-zinc-500">
        MRR sums the list price of every <strong>active</strong> plan. &ldquo;+30 days&rdquo;
        comps access without taking payment. &ldquo;Refund last&rdquo; refunds the most
        recent captured payment through Razorpay.
      </p>
    </div>
  );
}
