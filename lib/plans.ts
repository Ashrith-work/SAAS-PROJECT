// Subscription plans (Stripe, test mode).
//
// Price IDs come from env — run `npm run setup:stripe` to create the products +
// monthly prices in your Stripe test account and paste the printed IDs into
// .env. Limits are enforced server-side (see hotel creation) and surfaced on the
// billing page. `Infinity` means unlimited.

export type PlanKey = "starter" | "growth" | "agency";

export type Plan = {
  key: PlanKey;
  name: string;
  /** Monthly price in whole dollars, for display. */
  priceMonthly: number;
  /** Stripe Price ID (env), or undefined until configured. */
  priceId: string | undefined;
  limits: { hotels: number; members: number };
  features: string[];
};

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceId: process.env.STRIPE_PRICE_STARTER,
    limits: { hotels: 3, members: 1 },
    features: ["Up to 3 hotel clients", "1 team member", "All attribution reporting"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceMonthly: 249,
    priceId: process.env.STRIPE_PRICE_GROWTH,
    limits: { hotels: 10, members: 5 },
    features: ["Up to 10 hotel clients", "5 team members", "All attribution reporting"],
  },
  agency: {
    key: "agency",
    name: "Agency",
    priceMonthly: 499,
    priceId: process.env.STRIPE_PRICE_AGENCY,
    limits: { hotels: Infinity, members: Infinity },
    features: ["Unlimited hotel clients", "Unlimited team members", "All attribution reporting"],
  },
};

export const PLAN_ORDER: PlanKey[] = ["starter", "growth", "agency"];

export function getPlan(key: string): Plan {
  return PLANS[key as PlanKey] ?? PLANS.starter;
}

/** Maps a Stripe Price ID back to its plan key (used by the webhook). */
export function planForPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const key of PLAN_ORDER) {
    if (PLANS[key].priceId === priceId) return key;
  }
  return null;
}

/** Hotel cap for a plan key (Infinity = unlimited). */
export function hotelLimit(planKey: string): number {
  return getPlan(planKey).limits.hotels;
}

/**
 * Whether a Stripe subscription status grants access. We treat `active` and
 * `trialing` as live; everything else (past_due, canceled, incomplete, unpaid,
 * inactive) is gated.
 */
export function isActiveStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
