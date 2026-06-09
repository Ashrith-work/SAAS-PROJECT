"use client";

import { useState } from "react";
import {
  createSubscription,
  verifySubscriptionPayment,
  changePlan,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Checkout integration (client).
//
// Subscribe flow:
//   1. createSubscription() (server) makes the Razorpay subscription + returns id
//   2. we open the official Checkout modal (checkout.js) against that id
//   3. on success, verifySubscriptionPayment() (server) checks the signature
//   4. the webhook + verify flip the agency to `active`
//
// Switching plans on an ACTIVE subscription needs no checkout — Razorpay updates
// the existing mandate via changePlan().
// ─────────────────────────────────────────────────────────────────────────────

type PlanView = {
  key: "starter" | "growth" | "agency";
  name: string;
  priceLabel: string;
  features: string[];
};

type Props = {
  plans: PlanView[];
  currentPlanKey: string;
  active: boolean;
  status: string;
  paused: boolean;
  agencyName: string;
  agencyEmail: string;
};

// Minimal shape of the global the checkout.js script installs.
type RazorpayCheckout = { open: () => void };
type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (resp: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};
type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads checkout.js on demand and resolves once window.Razorpay is available. */
function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("checkout failed to load"));
    document.body.appendChild(s);
  });
}

export function BillingPanel({
  plans,
  currentPlanKey,
  active,
  paused,
  agencyName,
  agencyEmail,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function handleSubscribe(planKey: PlanView["key"]) {
    setError(null);
    setBusy(planKey);
    const res = await createSubscription(planKey);
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    try {
      await loadCheckout();
    } catch {
      setError("Couldn't load Razorpay Checkout. Check your connection and retry.");
      setBusy(null);
      return;
    }
    const Razorpay = window.Razorpay;
    if (!Razorpay) {
      setError("Razorpay Checkout is unavailable.");
      setBusy(null);
      return;
    }
    const checkout = new Razorpay({
      key: res.keyId,
      subscription_id: res.subscriptionId,
      name: "HotelTrack",
      description: `${plans.find((p) => p.key === planKey)?.name ?? ""} plan — monthly`,
      prefill: { name: agencyName, email: agencyEmail },
      notes: { plan: planKey },
      theme: { color: "#18181b" },
      handler: async (resp) => {
        const verified = await verifySubscriptionPayment(resp);
        if (verified.ok) {
          window.location.assign("/agency/billing?success=1");
        } else {
          setError("We received your payment but couldn't verify it. It'll reconcile shortly.");
          setBusy(null);
        }
      },
      modal: { ondismiss: () => setBusy(null) },
    });
    checkout.open();
  }

  async function handleSwitch(planKey: PlanView["key"]) {
    setError(null);
    setBusy(planKey);
    const res = await changePlan(planKey);
    if (res.ok) {
      window.location.assign("/agency/billing?success=1");
    } else {
      setError(res.error);
      setBusy(null);
    }
  }

  async function handlePauseResume() {
    setError(null);
    setBusy("pause");
    const res = paused ? await resumeSubscription() : await pauseSubscription();
    if (res.ok) {
      window.location.assign("/agency/billing?success=1");
    } else {
      setError(res.error);
      setBusy(null);
    }
  }

  async function handleCancel() {
    setError(null);
    setBusy("cancel");
    const res = await cancelSubscription();
    if (res.ok) {
      window.location.assign("/agency/billing?canceled=1");
    } else {
      setError(res.error);
      setBusy(null);
      setConfirmingCancel(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border-l-4 border-danger bg-danger/10 p-3 text-sm text-ink-secondary">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = active && currentPlanKey === plan.key;
          const loading = busy === plan.key;
          return (
            <div
              key={plan.key}
              className={`flex flex-col rounded-xl border p-5 ${
                isCurrent ? "border-brand" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">{plan.name}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {plan.priceLabel}
                <span className="text-sm font-normal text-ink-tertiary">/mo</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-secondary">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <div className="mt-4">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-lg bg-elevated px-4 py-2 text-sm font-medium text-ink-tertiary"
                  >
                    Your plan
                  </button>
                ) : active ? (
                  <button
                    onClick={() => handleSwitch(plan.key)}
                    disabled={busy !== null}
                    className="w-full rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong disabled:opacity-50"
                  >
                    {loading ? "Switching…" : "Switch to this plan"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={busy !== null}
                    className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    {loading ? "Opening checkout…" : "Subscribe"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div className="rounded-xl border border-line p-4">
          <h3 className="font-medium text-ink">Manage subscription</h3>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            Switch plans above, or pause/cancel here.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={handlePauseResume}
              disabled={busy !== null}
              className="rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-line-strong disabled:opacity-50"
            >
              {busy === "pause" ? "Working…" : paused ? "Resume subscription" : "Pause subscription"}
            </button>
            <button
              onClick={() => setConfirmingCancel(true)}
              disabled={busy !== null}
              className="rounded-lg border border-danger/60 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Cancel subscription
            </button>
          </div>
        </div>
      )}

      {confirmingCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <h3 className="text-lg font-semibold text-ink">Cancel your subscription?</h3>
            <p className="mt-2 text-sm text-ink-secondary">
              Your plan will cancel at the end of the current billing period. You&apos;ll
              keep dashboard access until then. Your hotels, content, and historical
              data are kept if you resubscribe later.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmingCancel(false)}
                disabled={busy === "cancel"}
                className="rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
              >
                Keep subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={busy === "cancel"}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
