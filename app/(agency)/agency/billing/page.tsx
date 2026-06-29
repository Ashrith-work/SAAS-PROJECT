import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";
import { PLAN_ORDER, PLANS, getPlan, isActiveStatus, formatInr } from "@/lib/razorpay-plans";
import { BILLING_ENABLED } from "@/lib/billing-config";
import { listInvoices, type InvoiceView } from "@/lib/razorpay-invoices";
import { BillingPanel } from "./BillingPanel";

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY TEST MODE — test payment instruments (no real money is charged).
// Only works while your keys are rzp_test_… .
//
//   Card (success):   4111 1111 1111 1111   any future expiry · any CVV · any name
//                     → on the OTP/auth screen, choose "Success"
//   Card (failure):   5104 0600 0000 0008   → choose "Failure" to test payment.failed
//   UPI  (success):   success@razorpay
//   UPI  (failure):   failure@razorpay
//
// Full list: https://razorpay.com/docs/payments/payments/test-card-details/
// ─────────────────────────────────────────────────────────────────────────────

type SP = { [key: string]: string | string[] | undefined };

function Banner({ sp, active }: { sp: SP; active: boolean }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (one(sp.success)) {
    return (
      <div className="rounded-lg border-l-4 border-success bg-success/10 p-3 text-sm text-ink-secondary">
        Subscription updated. It can take a few seconds to activate — refresh if your
        plan isn&apos;t shown yet.
      </div>
    );
  }
  if (one(sp.canceled)) {
    return (
      <div className="rounded-lg border border-line bg-card p-3 text-sm text-ink-secondary">
        Your subscription will cancel at the end of the current billing period.
      </div>
    );
  }
  if (one(sp.error)) {
    return (
      <div className="rounded-lg border-l-4 border-danger bg-danger/10 p-3 text-sm text-ink-secondary">
        Something went wrong. Please try again.
      </div>
    );
  }
  if (!active) {
    return (
      <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3 text-sm text-ink-secondary">
        Your subscription is inactive. Choose a plan below to unlock your agency
        dashboard.
      </div>
    );
  }
  return null;
}

function InvoiceHistory({ invoices }: { invoices: InvoiceView[] }) {
  if (invoices.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-medium">Invoice history</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="ht-table w-full text-left text-sm">
          <thead className="bg-card text-xs uppercase tracking-wide text-ink-tertiary">
            <tr>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{inv.number ?? inv.id}</td>
                <td className="px-4 py-3 text-ink-tertiary">
                  {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-IN") : "—"}
                </td>
                <td className="px-4 py-3 capitalize text-ink-tertiary">{inv.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(inv.amountPaise)}</td>
                <td className="px-4 py-3 text-right">
                  {inv.shortUrl && (
                    <a
                      href={inv.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-ink-tertiary hover:underline"
                    >
                      View →
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Shown while BILLING_ENABLED is false (free beta). Replaces the whole paywall —
// no plan cards, no Razorpay checkout — with a simple "free during beta" notice.
// The page itself stays reachable from the sidebar so the nav doesn't 404; flip
// BILLING_ENABLED=true to restore the real billing UI below.
function FreeBetaBilling({ agencyName }: { agencyName: string }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-ink-tertiary">{agencyName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/agency/dashboard" className="text-sm text-ink-tertiary hover:underline">
            ← Dashboard
          </Link>
          <UserButton />
        </div>
      </header>

      <div className="rounded-xl border-l-4 border-success bg-success/10 p-6">
        <h2 className="text-lg font-medium text-ink">Free during beta 🎉</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          HotelTrack is completely free while we&apos;re in beta. You have full access
          to every feature — unlimited hotel clients, team members, GA4 analytics and
          reports — with nothing to pay and no plan to choose.
        </p>
        <p className="mt-3 text-sm text-ink-tertiary">
          We&apos;ll let you know well in advance before paid plans begin. Until then,
          enjoy everything on the house.
        </p>
        <Link
          href="/agency/dashboard"
          className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Go to dashboard →
        </Link>
      </div>
    </main>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Free beta: skip the entire paywall / Razorpay checkout and show the beta
  // notice instead. All the billing code below stays intact for when billing
  // is re-enabled (BILLING_ENABLED=true).
  if (!BILLING_ENABLED) {
    return <FreeBetaBilling agencyName={member.agency.name} />;
  }

  const sp = await searchParams;
  const status = member.agency.subscriptionStatus;
  const active = isActiveStatus(status);
  const paused = status === "paused";
  const currentPlan = getPlan(member.agency.plan);

  const invoices = member.agency.razorpaySubscriptionId
    ? await listInvoices(member.agency.razorpaySubscriptionId)
    : [];

  const plans = PLAN_ORDER.map((key) => {
    const plan = PLANS[key];
    return {
      key,
      name: plan.name,
      priceLabel: formatInr(plan.pricePaise),
      features: plan.features,
    };
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-ink-tertiary">{member.agency.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <Link href="/agency/dashboard" className="text-sm text-ink-tertiary hover:underline">
              ← Dashboard
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      <div className="space-y-4">
        <Banner sp={sp} active={active} />

        <div className="rounded-xl border border-line p-4">
          <p className="text-sm text-ink-tertiary">Current plan</p>
          <p className="mt-0.5 text-lg font-medium">
            {active || paused ? currentPlan.name : "No active subscription"}
            <span className="ml-2 align-middle text-xs font-normal text-ink-tertiary">({status})</span>
          </p>
          {member.agency.subscriptionExpiresAt && (active || paused) && (
            <p className="mt-1 text-xs text-ink-tertiary">
              Current period ends{" "}
              {new Date(member.agency.subscriptionExpiresAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        <BillingPanel
          plans={plans}
          currentPlanKey={member.agency.plan}
          active={active}
          status={status}
          paused={paused}
          agencyName={member.agency.name}
          agencyEmail={member.agency.email || member.email}
        />

        <InvoiceHistory invoices={invoices} />

        <p className="text-xs text-ink-tertiary">
          Payments run in Razorpay test mode. Use card{" "}
          <code className="rounded bg-elevated px-1">4111 1111 1111 1111</code>{" "}
          (any future expiry &amp; CVV) and choose <strong>Success</strong> on the
          authentication screen. No real money is charged.
        </p>
      </div>
    </main>
  );
}
