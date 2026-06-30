import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Stripe sends checkout.session.completed when a candidate pays via a Payment Link.
// We verify the signature, read who paid + which tier (from client_reference_id =
// "<candidate_code>__<tier>"), and grant the entitlement — idempotently.
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return new Response("Stripe webhook not configured", { status: 400 });
  }

  const body = await req.text(); // raw body — required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return new Response(`Signature verification failed: ${(e as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const [candidateCode, tierStr] = (session.client_reference_id || "").split("__");
    const tier = Number(tierStr);

    if (candidateCode && [2, 3, 4].includes(tier)) {
      const svc = createServiceClient();
      const { data: attempt } = await svc
        .from("attempts")
        .select("id, user_id")
        .eq("candidate_code", candidateCode)
        .maybeSingle();

      if (attempt) {
        await svc.from("entitlements").upsert(
          {
            user_id: attempt.user_id,
            attempt_id: attempt.id,
            tier,
            source: "stripe",
            stripe_event_id: event.id,
            stripe_session_id: session.id,
            amount_cents: session.amount_total ?? null,
            currency: session.currency ?? null,
          },
          { onConflict: "attempt_id,tier", ignoreDuplicates: true },
        );
      } else {
        console.error("stripe webhook: no attempt for candidate_code", candidateCode);
      }
    }
  }

  return new Response("ok", { status: 200 });
}
