"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe";
import { PLANS, type PlanKey } from "@/lib/plans";

type Member = NonNullable<Awaited<ReturnType<typeof getCurrentMember>>>;

async function baseUrl(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Returns the agency's Stripe customer id, creating + persisting one if needed. */
async function ensureCustomer(member: Member): Promise<string> {
  if (member.agency.stripeCustomerId) return member.agency.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: member.agency.email || member.email,
    name: member.agency.name,
    metadata: { agencyId: member.agencyId },
  });
  // Agency is the tenant root (scoped by id). agencyScopedFor also pins the
  // where to this member's own agency.
  await agencyScopedFor(member.agencyId, prisma.agency).update({
    where: { id: member.agencyId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Starts a Stripe Checkout subscription for the chosen plan. */
export async function subscribeToPlan(formData: FormData) {
  const member = await getCurrentMember();
  if (!member) redirect("/sign-in");

  const rawPlan = String(formData.get("plan") ?? "");
  if (!(rawPlan in PLANS)) redirect("/agency/billing?error=invalid_plan");
  const planKey = rawPlan as PlanKey;
  const priceId = PLANS[planKey]?.priceId;
  if (!priceId) redirect("/agency/billing?error=config");

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const customerId = await ensureCustomer(member);
    const base = await baseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/agency/billing?success=1`,
      cancel_url: `${base}/agency/billing?canceled=1`,
      allow_promotion_codes: true,
      // Carried onto the subscription so the webhook can resolve the agency
      // even before the customer id is persisted.
      metadata: { agencyId: member.agencyId, plan: planKey },
      subscription_data: { metadata: { agencyId: member.agencyId } },
    });
    url = session.url;
  } catch {
    redirect("/agency/billing?error=checkout");
  }

  redirect(url ?? "/agency/billing?error=checkout");
}

/** Opens the Stripe Billing Portal to change plan, update card, or cancel. */
export async function openBillingPortal() {
  const member = await getCurrentMember();
  if (!member) redirect("/sign-in");
  if (!member.agency.stripeCustomerId) redirect("/agency/billing?error=nocustomer");

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const base = await baseUrl();
    const portal = await stripe.billingPortal.sessions.create({
      customer: member.agency.stripeCustomerId,
      return_url: `${base}/agency/billing`,
    });
    url = portal.url;
  } catch {
    redirect("/agency/billing?error=portal");
  }

  redirect(url ?? "/agency/billing?error=portal");
}
