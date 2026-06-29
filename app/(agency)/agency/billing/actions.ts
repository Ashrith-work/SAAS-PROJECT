"use server";

import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant";
import { getRazorpay, ensurePlanId, publicKeyId, verifyCheckoutSignature } from "@/lib/razorpay";
import { isPlanKey, type PlanKey } from "@/lib/razorpay-plans";

// Server actions for the Razorpay subscription lifecycle. These are called
// directly from the billing client component (not <form> actions) and return
// result objects rather than redirecting, so the client can drive the Razorpay
// Checkout modal. Every action re-checks auth server-side and scopes writes to
// the caller's own agency — never trusting a client-supplied id.

type Member = NonNullable<Awaited<ReturnType<typeof getCurrentMember>>>;

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TOTAL_BILLING_CYCLES = 120; // monthly × 10 years ≈ ongoing until cancelled

function scopedAgency(member: Member) {
  return agencyScopedFor(member.agencyId, prisma.agency);
}

/**
 * Creates a Razorpay subscription for the chosen plan and returns the id +
 * public key the client needs to open Checkout. We persist the subscription id
 * immediately so the webhook (and verify step) can resolve this agency.
 */
export async function createSubscription(
  rawPlan: string,
): Promise<Result<{ subscriptionId: string; keyId: string; planKey: PlanKey }>> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired — please sign in again." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };
  if (!isPlanKey(rawPlan)) return { ok: false, error: "Unknown plan." };
  const planKey = rawPlan;

  const keyId = publicKeyId();
  if (!keyId) return { ok: false, error: "Billing isn't configured yet. Add your Razorpay keys." };

  try {
    const planId = await ensurePlanId(planKey);
    const rzp = getRazorpay();
    const sub = await rzp.subscriptions.create({
      plan_id: planId,
      total_count: TOTAL_BILLING_CYCLES,
      quantity: 1,
      customer_notify: 1,
      // Stamped so the webhook can resolve the agency + plan from the event alone.
      notes: { agencyId: member.agencyId, plan: planKey },
    });

    await scopedAgency(member).update({
      where: { id: member.agencyId },
      data: { razorpaySubscriptionId: sub.id, plan: planKey, subscriptionStatus: sub.status },
    });

    return { ok: true, subscriptionId: sub.id, keyId, planKey };
  } catch {
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}

/**
 * Verifies the signature Razorpay Checkout returns to the success handler, then
 * optimistically syncs the agency from the live subscription so the dashboard
 * unlocks immediately (the webhook remains the source of truth).
 */
export async function verifySubscriptionPayment(args: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}): Promise<Result> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired — please sign in again." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };

  // The subscription must be the one we created for THIS agency.
  if (member.agency.razorpaySubscriptionId !== args.razorpay_subscription_id) {
    return { ok: false, error: "Subscription mismatch." };
  }
  if (!verifyCheckoutSignature(args)) {
    return { ok: false, error: "Payment could not be verified." };
  }

  try {
    const rzp = getRazorpay();
    const sub = await rzp.subscriptions.fetch(args.razorpay_subscription_id);
    await scopedAgency(member).update({
      where: { id: member.agencyId },
      data: {
        subscriptionStatus: sub.status,
        ...(sub.customer_id ? { razorpayCustomerId: sub.customer_id } : {}),
        ...(sub.current_end
          ? { subscriptionExpiresAt: new Date(sub.current_end * 1000) }
          : {}),
      },
    });
    return { ok: true };
  } catch {
    // Signature was valid; the webhook will reconcile even if this fetch failed.
    return { ok: true };
  }
}

/** Upgrades or downgrades the plan immediately (prorated by Razorpay). */
export async function changePlan(rawPlan: string): Promise<Result> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };
  if (!isPlanKey(rawPlan)) return { ok: false, error: "Unknown plan." };
  const subId = member.agency.razorpaySubscriptionId;
  if (!subId) return { ok: false, error: "No active subscription to change." };
  if (member.agency.plan === rawPlan) return { ok: false, error: "You're already on that plan." };

  try {
    const planId = await ensurePlanId(rawPlan);
    const rzp = getRazorpay();
    await rzp.subscriptions.update(subId, { plan_id: planId, schedule_change_at: "now" });
    await scopedAgency(member).update({
      where: { id: member.agencyId },
      data: { plan: rawPlan },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't change your plan. Please try again." };
  }
}

/** Pauses billing immediately; resume re-activates it. */
export async function pauseSubscription(): Promise<Result> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };
  const subId = member.agency.razorpaySubscriptionId;
  if (!subId) return { ok: false, error: "No active subscription." };

  try {
    const rzp = getRazorpay();
    const sub = await rzp.subscriptions.pause(subId, { pause_at: "now" });
    await scopedAgency(member).update({
      where: { id: member.agencyId },
      data: { subscriptionStatus: sub.status },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't pause your subscription." };
  }
}

/** Resumes a paused subscription. */
export async function resumeSubscription(): Promise<Result> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };
  const subId = member.agency.razorpaySubscriptionId;
  if (!subId) return { ok: false, error: "No active subscription." };

  try {
    const rzp = getRazorpay();
    const sub = await rzp.subscriptions.resume(subId, { resume_at: "now" });
    await scopedAgency(member).update({
      where: { id: member.agencyId },
      data: { subscriptionStatus: sub.status },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't resume your subscription." };
  }
}

/**
 * Cancels at the end of the current billing cycle, so the agency keeps access
 * until the period they've paid for ends. The subscription.cancelled webhook
 * flips the status (and sends the confirmation email) when it actually cancels.
 */
export async function cancelSubscription(): Promise<Result> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Your session has expired." };
  if (member.role !== "admin") return { ok: false, error: "Only an agency admin can manage billing." };
  const subId = member.agency.razorpaySubscriptionId;
  if (!subId) return { ok: false, error: "No active subscription." };

  try {
    const rzp = getRazorpay();
    await rzp.subscriptions.cancel(subId, true); // true = cancel at cycle end
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't cancel your subscription." };
  }
}
