import Stripe from "stripe";

// Lazily-constructed Stripe client. Reading the key lazily means importing this
// module never throws at build time when STRIPE_SECRET_KEY is absent — the error
// only surfaces if billing code actually runs without a key configured.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add your Stripe test secret key to .env.",
    );
  }
  client = new Stripe(key);
  return client;
}
