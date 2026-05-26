import "dotenv/config";
import { getStripe } from "../lib/stripe";
import { PLAN_ORDER, PLANS, type PlanKey } from "../lib/plans";

// Creates the three subscription products + monthly prices in your Stripe TEST
// account, then prints the env lines to paste into .env. Idempotent: products
// are tagged with metadata.hoteltrack_plan and reused on re-runs; a matching
// monthly price is reused if one already exists.
//
// Requires STRIPE_SECRET_KEY (test mode, sk_test_…) in .env.
//   npm run setup:stripe

const stripe = getStripe();

const ENV_VAR: Record<PlanKey, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  agency: "STRIPE_PRICE_AGENCY",
};

async function findProduct(planKey: PlanKey) {
  const products = await stripe.products.list({ limit: 100, active: true });
  return products.data.find((p) => p.metadata?.hoteltrack_plan === planKey);
}

async function findMonthlyPrice(productId: string, amountCents: number) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return prices.data.find(
    (p) =>
      p.currency === "usd" &&
      p.unit_amount === amountCents &&
      p.recurring?.interval === "month",
  );
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    console.warn(
      "⚠ STRIPE_SECRET_KEY does not look like a test key (sk_test_…). " +
        "This script is meant for test mode.",
    );
  }

  const lines: string[] = [];

  for (const key of PLAN_ORDER) {
    const plan = PLANS[key];
    const amountCents = plan.priceMonthly * 100;

    let product = await findProduct(key);
    if (!product) {
      product = await stripe.products.create({
        name: `HotelTrack ${plan.name}`,
        metadata: { hoteltrack_plan: key },
      });
      console.log(`Created product for ${plan.name}: ${product.id}`);
    } else {
      console.log(`Reusing product for ${plan.name}: ${product.id}`);
    }

    let price = await findMonthlyPrice(product.id, amountCents);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: amountCents,
        recurring: { interval: "month" },
        metadata: { hoteltrack_plan: key },
      });
      console.log(`Created $${plan.priceMonthly}/mo price: ${price.id}`);
    } else {
      console.log(`Reusing $${plan.priceMonthly}/mo price: ${price.id}`);
    }

    lines.push(`${ENV_VAR[key]}="${price.id}"`);
  }

  console.log("\n── Paste these into your .env ──\n");
  console.log(lines.join("\n"));
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
