import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { planForPriceId } from "@/lib/plans";

// Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET, then keeps
// each agency's subscriptionStatus + plan in sync with Stripe. Public in proxy
// (no Clerk session) — the signature check is the auth.
//
// Local testing:
//   stripe listen --forward-to localhost:3001/api/webhooks/stripe
//   (prints the whsec_… signing secret to put in STRIPE_WEBHOOK_SECRET)

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Syncs an agency row from a Stripe subscription object. */
async function applySubscription(sub: Stripe.Subscription, agencyIdHint?: string) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id;
  const plan = planForPriceId(priceId);

  // Resolve the agency by Stripe customer, falling back to the agencyId we
  // stamped in metadata at checkout time.
  let agency = await prisma.agency.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!agency) {
    const hint = agencyIdHint ?? (sub.metadata?.agencyId as string | undefined);
    if (hint) {
      agency = await prisma.agency.findUnique({
        where: { id: hint },
        select: { id: true },
      });
    }
  }
  if (!agency) return;

  await prisma.agency.update({
    where: { id: agency.id },
    data: {
      stripeCustomerId: customerId,
      subscriptionStatus: sub.status,
      ...(plan ? { plan } : {}),
    },
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return Response.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(sub, session.metadata?.agencyId ?? undefined);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log-free failure (never leak tokens/PII). Return 500 so Stripe retries.
    const message = err instanceof Error ? err.message : "Handler error";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}
