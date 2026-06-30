import Stripe from "stripe";

// Lazily constructed so the module imports cleanly without the key (build time).
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set (server-only secret).");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
