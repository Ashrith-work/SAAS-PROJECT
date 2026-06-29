// Subscription plans (Razorpay, INR).
//
// HotelTrack bills agencies in Indian Rupees through Razorpay. Razorpay works in
// PAISE everywhere (1 INR = 100 paise), so every amount that goes to the API is
// stored here in paise and only converted to rupees for display.
//
// Each plan maps to a Razorpay Plan entity whose id lives in an env var
// (RAZORPAY_PLAN_<KEY>). Create them with `npm run setup:razorpay`, or let the
// app create them lazily on first checkout (see ensurePlanId in lib/razorpay.ts).
//
// This module is pure data + helpers (no SDK import) so it can be imported from
// any server component. Limits are enforced server-side (hotel/member creation)
// and surfaced on the billing page. `Infinity` means unlimited.
//
// FREE BETA (see lib/billing-config.ts): while BILLING_ENABLED is false, the
// access/feature gates below (hasDashboardAccess, hotelLimit, memberLimit,
// planHasGa4) unconditionally grant full, unlimited, highest-tier access. The
// plan DATA (PLANS, prices, etc.) is left untouched so billing snaps back the
// instant BILLING_ENABLED is flipped to true. isActiveStatus stays a pure
// reflection of the Razorpay status so admin analytics remain honest.

import { BILLING_ENABLED } from "./billing-config";

export type PlanKey = "starter" | "growth" | "agency";

export type Plan = {
  key: PlanKey;
  name: string;
  /** Monthly price in paise — the unit Razorpay's API expects. */
  pricePaise: number;
  /** Name of the env var holding this plan's Razorpay Plan id. */
  planIdEnvVar: string;
  limits: { hotels: number; members: number };
  features: string[];
};

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    pricePaise: 249900, // ₹2,499/month
    planIdEnvVar: "RAZORPAY_PLAN_STARTER",
    limits: { hotels: 3, members: 1 },
    features: ["Up to 3 hotel clients", "1 team member", "PDF reports"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    pricePaise: 649900, // ₹6,499/month
    planIdEnvVar: "RAZORPAY_PLAN_GROWTH",
    limits: { hotels: 10, members: 5 },
    features: ["Up to 10 hotel clients", "5 team members", "PDF + Excel reports", "GA4 analytics"],
  },
  agency: {
    key: "agency",
    name: "Agency",
    pricePaise: 1299900, // ₹12,999/month
    planIdEnvVar: "RAZORPAY_PLAN_AGENCY",
    limits: { hotels: Infinity, members: Infinity },
    features: ["Unlimited hotel clients", "Unlimited team members", "White-label reports", "GA4 analytics"],
  },
};

export const PLAN_ORDER: PlanKey[] = ["starter", "growth", "agency"];

export function isPlanKey(value: string): value is PlanKey {
  return value === "starter" || value === "growth" || value === "agency";
}

export function getPlan(key: string): Plan {
  return PLANS[key as PlanKey] ?? PLANS.starter;
}

/** The configured Razorpay Plan id for a plan key, or undefined until set. */
export function planIdFor(key: PlanKey): string | undefined {
  return process.env[PLANS[key].planIdEnvVar];
}

/** Maps a Razorpay Plan id back to its plan key (used as a webhook fallback). */
export function planForPlanId(planId: string | null | undefined): PlanKey | null {
  if (!planId) return null;
  for (const key of PLAN_ORDER) {
    if (planIdFor(key) === planId) return key;
  }
  return null;
}

/** The next plan up from a given key, or null if already on the top plan. */
export function nextPlan(planKey: string): Plan | null {
  const idx = PLAN_ORDER.indexOf(planKey as PlanKey);
  if (idx < 0 || idx >= PLAN_ORDER.length - 1) return null;
  return PLANS[PLAN_ORDER[idx + 1]];
}

/** Hotel cap for a plan key (Infinity = unlimited). Unlimited during the free beta. */
export function hotelLimit(planKey: string): number {
  if (!BILLING_ENABLED) return Infinity;
  return getPlan(planKey).limits.hotels;
}

/** Team-member cap for a plan key (Infinity = unlimited). Unlimited during the free beta. */
export function memberLimit(planKey: string): number {
  if (!BILLING_ENABLED) return Infinity;
  return getPlan(planKey).limits.members;
}

/** Monthly price in whole rupees, for display. */
export function priceInr(plan: Plan): number {
  return Math.round(plan.pricePaise / 100);
}

/** Formats paise as an INR string, e.g. 249900 → "₹2,499". */
export function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * Whether a Razorpay subscription status grants access. Razorpay statuses are:
 * created, authenticated, active, pending, halted, cancelled, completed,
 * expired, paused. Only `active` is a live, paid subscription — everything else
 * (including `authenticated`, which means the mandate exists but the first
 * charge hasn't cleared) is gated.
 */
export function isActiveStatus(status: string | null | undefined): boolean {
  return status === "active";
}

/**
 * Whether the signed-in agency may reach the gated dashboard. This is the single
 * paywall check used by the agency app layout.
 *
 * During the free beta (BILLING_ENABLED=false) every authenticated agency has
 * full access regardless of its Razorpay status. Flip BILLING_ENABLED=true to
 * restore the paywall, which then requires a live `active` subscription. Kept
 * separate from isActiveStatus so admin billing analytics stay truthful.
 */
export function hasDashboardAccess(status: string | null | undefined): boolean {
  if (!BILLING_ENABLED) return true;
  return isActiveStatus(status);
}

/**
 * Whether a plan unlocks the Google Analytics 4 integration. GA4 is a paid
 * upgrade — the Starter tier is gated and shown an "Upgrade to Growth" overlay
 * on the integrations page. Growth and Agency both include it. Unlocked for
 * everyone during the free beta.
 */
export function planHasGa4(planKey: string | null | undefined): boolean {
  if (!BILLING_ENABLED) return true;
  return planKey === "growth" || planKey === "agency";
}
