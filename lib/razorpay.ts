import "server-only";

import Razorpay from "razorpay";
import crypto from "node:crypto";
import { PLANS, planIdFor, type PlanKey } from "./razorpay-plans";

// Lazily-constructed Razorpay client. Reading the keys lazily means importing
// this module never throws at build time when the keys are absent — the error
// only surfaces if billing code actually runs without keys configured.
//
// SECURITY: RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are server-only and
// must never reach the browser. Only NEXT_PUBLIC_RAZORPAY_KEY_ID (the public key
// id) is safe to expose to the frontend Checkout script.
let client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (client) return client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Add your Razorpay test " +
        "keys (rzp_test_…) to .env.local.",
    );
  }
  client = new Razorpay({ key_id, key_secret });
  return client;
}

/** The public key id exposed to the browser for Checkout. */
export function publicKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
}

/**
 * Verifies a Razorpay WEBHOOK signature. Razorpay signs the raw request body
 * with HMAC-SHA256 keyed by your webhook secret and sends it in the
 * `x-razorpay-signature` header. Compared in constant time so the check can't be
 * timing-probed. (Razorpay's SDK ships validateWebhookSignature() too, but the
 * brief calls for an explicit Node crypto implementation.)
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Verifies a Razorpay CHECKOUT subscription payment signature returned to the
 * client handler. For subscriptions the signed message is
 * `<razorpay_payment_id>|<razorpay_subscription_id>`, keyed by KEY_SECRET.
 */
export function verifyCheckoutSignature(args: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const payload = `${args.razorpay_payment_id}|${args.razorpay_subscription_id}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeEqualHex(expected, args.razorpay_signature);
}

/** Constant-time compare of two hex strings (length-safe). */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan provisioning
//
// Razorpay subscriptions require a Plan id created in advance. We resolve it in
// this order: (1) the RAZORPAY_PLAN_<KEY> env var, (2) an existing plan on the
// account tagged with notes.hoteltrack_plan, (3) create one. The resolved id is
// cached in memory so we don't hit the API on every checkout. The setup script
// (`npm run setup:razorpay`) is the recommended way to create them up front and
// print the env lines; this lazy path is the safety net for first run.
// ─────────────────────────────────────────────────────────────────────────────

const planIdCache = new Map<PlanKey, string>();

export async function ensurePlanId(key: PlanKey): Promise<string> {
  const fromEnv = planIdFor(key);
  if (fromEnv) return fromEnv;

  const cached = planIdCache.get(key);
  if (cached) return cached;

  const rzp = getRazorpay();
  const plan = PLANS[key];

  // Reuse a previously-created plan tagged for this key, if any.
  const existing = await rzp.plans.all({ count: 100 });
  const match = existing.items.find(
    (p) => p.notes?.hoteltrack_plan === key && p.item?.amount === plan.pricePaise,
  );
  if (match) {
    planIdCache.set(key, match.id);
    return match.id;
  }

  const created = await rzp.plans.create({
    period: "monthly",
    interval: 1,
    item: {
      name: `HotelTrack ${plan.name}`,
      amount: plan.pricePaise,
      currency: "INR",
    },
    notes: { hoteltrack_plan: key },
  });
  planIdCache.set(key, created.id);
  return created.id;
}
