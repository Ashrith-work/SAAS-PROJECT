import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";
import { PLAN_ORDER, PLANS, getPlan, isActiveStatus } from "@/lib/plans";
import { subscribeToPlan, openBillingPortal } from "./actions";

type SP = { [key: string]: string | string[] | undefined };

function Banner({ sp, active }: { sp: SP; active: boolean }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (one(sp.success)) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300">
        Subscription updated. It can take a few seconds to activate — refresh if
        your plan isn&apos;t shown yet.
      </div>
    );
  }
  if (one(sp.canceled)) {
    return (
      <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Checkout canceled — no changes were made.
      </div>
    );
  }
  const err = one(sp.error);
  if (err) {
    const msg =
      err === "config"
        ? "Plans aren't configured yet. Run `npm run setup:stripe` and set the price IDs in .env."
        : "Something went wrong starting that. Please try again.";
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300">
        {msg}
      </div>
    );
  }
  if (!active) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
        Your subscription is inactive. Choose a plan below to unlock your agency
        dashboard.
      </div>
    );
  }
  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const sp = await searchParams;
  const active = isActiveStatus(member.agency.subscriptionStatus);
  const currentKey = active ? member.agency.plan : null;
  const currentPlan = getPlan(member.agency.plan);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-zinc-500">{member.agency.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <Link
              href="/agency/dashboard"
              className="text-sm text-zinc-500 hover:underline"
            >
              ← Dashboard
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      <div className="space-y-4">
        <Banner sp={sp} active={active} />

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Current plan</p>
          <p className="mt-0.5 text-lg font-medium">
            {active ? currentPlan.name : "No active subscription"}
            <span className="ml-2 align-middle text-xs font-normal text-zinc-500">
              ({member.agency.subscriptionStatus})
            </span>
          </p>
          {active && (
            <form action={openBillingPortal} className="mt-3">
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Manage subscription — change plan, update card, or cancel
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isCurrent = currentKey === key;
            return (
              <div
                key={key}
                className={`flex flex-col rounded-xl border p-5 ${
                  isCurrent
                    ? "border-black dark:border-white"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{plan.name}</h2>
                  {isCurrent && (
                    <span className="rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  ${plan.priceMonthly}
                  <span className="text-sm font-normal text-zinc-500">/mo</span>
                </p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {plan.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>

                <div className="mt-4">
                  {active ? (
                    isCurrent ? (
                      <button
                        disabled
                        className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-800"
                      >
                        Your plan
                      </button>
                    ) : (
                      <form action={openBillingPortal}>
                        <button
                          type="submit"
                          className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          Switch in portal
                        </button>
                      </form>
                    )
                  ) : (
                    <form action={subscribeToPlan}>
                      <input type="hidden" name="plan" value={key} />
                      <button
                        type="submit"
                        disabled={!plan.priceId}
                        className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {plan.priceId ? "Subscribe" : "Not configured"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-zinc-500">
          Payments run in Stripe test mode. Use card{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            4242 4242 4242 4242
          </code>{" "}
          with any future expiry and CVC.
        </p>
      </div>
    </main>
  );
}
