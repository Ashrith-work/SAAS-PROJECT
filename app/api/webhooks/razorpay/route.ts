import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { planForPlanId, isPlanKey, getPlan, type PlanKey } from "@/lib/razorpay-plans";
import {
  sendSubscriptionActivatedEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/billing-email";

// Razorpay webhook. Verifies the HMAC-SHA256 signature with RAZORPAY_WEBHOOK_SECRET
// (the signature IS the auth — this route is public in proxy.ts, no Clerk session),
// then keeps each agency's subscriptionStatus / plan / expiry in sync.
//
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:    https://<your-app>/api/webhooks/razorpay
//   Events: subscription.activated, subscription.charged, subscription.cancelled,
//           subscription.paused, subscription.completed, payment.failed
//   Secret: the same value as RAZORPAY_WEBHOOK_SECRET
//
// Locally, expose the dev server with `npm run tunnel` (ngrok) and point the
// webhook URL at the tunnel.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Minimal shapes of the bits of the payload we read ───────────────────────
type SubscriptionEntity = {
  id: string;
  status: string;
  plan_id?: string;
  customer_id?: string | null;
  current_end?: number | null;
  notes?: Record<string, string | number> | null;
};
type PaymentEntity = {
  id: string;
  email?: string | null;
  contact?: string | null;
  notes?: Record<string, string | number> | null;
};
type WebhookEvent = {
  event?: string;
  payload?: {
    subscription?: { entity?: SubscriptionEntity };
    payment?: { entity?: PaymentEntity };
  };
};

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  // CRITICAL: never trust webhook data without verifying the signature first.
  if (!verifyWebhookSignature(body, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(body) as WebhookEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.event ?? "unknown";
  const sub = event.payload?.subscription?.entity;
  const payment = event.payload?.payment?.entity;

  // Log every event for debugging (ids only — no secrets/PII bodies).
  console.log(
    `[razorpay-webhook] event=${type} sub=${sub?.id ?? "-"} payment=${payment?.id ?? "-"} status=${sub?.status ?? "-"}`,
  );

  try {
    switch (type) {
      case "subscription.activated":
        if (sub) await applySubscription(sub, { welcome: true });
        break;
      case "subscription.charged":
        if (sub) await applySubscription(sub);
        break;
      case "subscription.paused":
      case "subscription.completed":
        if (sub) await applySubscription(sub);
        break;
      case "subscription.cancelled":
        if (sub) await applySubscription(sub, { cancelled: true });
        break;
      case "payment.failed":
        await handlePaymentFailed(payment);
        break;
      default:
        // Acknowledge unhandled events so Razorpay stops retrying them.
        break;
    }
  } catch (err) {
    // Return 500 so Razorpay retries. Message is redacted by the global console
    // net (instrumentation.ts) before it can reach logs.
    const message = err instanceof Error ? err.message : "Handler error";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}

/**
 * Syncs an agency row from a Razorpay subscription entity. Resolves the agency by
 * subscription id (set at checkout), then customer id, then the agencyId we
 * stamped into the subscription notes. Optionally fires lifecycle emails.
 */
async function applySubscription(
  sub: SubscriptionEntity,
  opts: { welcome?: boolean; cancelled?: boolean } = {},
) {
  const agency = await resolveAgency({
    subscriptionId: sub.id,
    customerId: sub.customer_id ?? undefined,
    agencyIdHint: noteString(sub.notes, "agencyId"),
  });
  if (!agency) return;

  const plan = resolvePlan(sub);
  const expiresAt = sub.current_end ? new Date(sub.current_end * 1000) : undefined;
  const wasActive = agency.subscriptionStatus === "active";

  await prisma.agency.update({
    where: { id: agency.id },
    data: {
      subscriptionStatus: sub.status,
      razorpaySubscriptionId: sub.id,
      ...(sub.customer_id ? { razorpayCustomerId: sub.customer_id } : {}),
      ...(plan ? { plan } : {}),
      ...(expiresAt ? { subscriptionExpiresAt: expiresAt } : {}),
    },
  });

  const planName = getPlan(plan ?? agency.plan).name;

  // Welcome email only on the transition into `active` (not on every renewal).
  if (opts.welcome && sub.status === "active" && !wasActive && agency.email) {
    await sendSubscriptionActivatedEmail({ to: agency.email, agencyName: agency.name, planName });
  }
  if (opts.cancelled && agency.email) {
    await sendSubscriptionCancelledEmail({ to: agency.email, agencyName: agency.name, planName });
  }
}

/** payment.failed is a payment-level event; we email the agency if we can map it. */
async function handlePaymentFailed(payment: PaymentEntity | undefined) {
  if (!payment) return;
  const agency = await resolveAgency({
    agencyIdHint: noteString(payment.notes, "agencyId"),
    email: payment.email ?? undefined,
  });
  if (agency?.email) {
    await sendPaymentFailedEmail({ to: agency.email, agencyName: agency.name });
  }
}

type ResolvedAgency = {
  id: string;
  email: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
};

/** Best-effort agency lookup across the identifiers a webhook might carry. */
async function resolveAgency(keys: {
  subscriptionId?: string;
  customerId?: string;
  agencyIdHint?: string;
  email?: string;
}): Promise<ResolvedAgency | null> {
  const select = {
    id: true,
    email: true,
    name: true,
    plan: true,
    subscriptionStatus: true,
  } as const;

  if (keys.subscriptionId) {
    const a = await prisma.agency.findUnique({
      where: { razorpaySubscriptionId: keys.subscriptionId },
      select,
    });
    if (a) return a;
  }
  if (keys.customerId) {
    const a = await prisma.agency.findUnique({
      where: { razorpayCustomerId: keys.customerId },
      select,
    });
    if (a) return a;
  }
  if (keys.agencyIdHint) {
    const a = await prisma.agency.findUnique({ where: { id: keys.agencyIdHint }, select });
    if (a) return a;
  }
  if (keys.email) {
    const a = await prisma.agency.findFirst({ where: { email: keys.email }, select });
    if (a) return a;
  }
  return null;
}

/** Resolve the plan key from subscription notes (stamped at checkout) or plan_id. */
function resolvePlan(sub: SubscriptionEntity): PlanKey | null {
  const fromNotes = noteString(sub.notes, "plan");
  if (fromNotes && isPlanKey(fromNotes)) return fromNotes;
  return planForPlanId(sub.plan_id);
}

function noteString(
  notes: Record<string, string | number> | null | undefined,
  key: string,
): string | undefined {
  const v = notes?.[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
}
