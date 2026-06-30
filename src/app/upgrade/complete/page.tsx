import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Upgrade complete — CourseCred" };

// Stripe Payment Links redirect here after checkout:
//   /upgrade/complete?session_id={CHECKOUT_SESSION_ID}
// We resolve the session → the candidate's attempt, grant the tier
// idempotently (so the unlock is instant — the webhook still does the
// authoritative grant + the email/PDF), then send them to their result.
export default async function UpgradeCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  let dest = "/dashboard?upgrade=processing";

  if (session_id) {
    try {
      const session = await stripe().checkout.sessions.retrieve(session_id);
      const [candidateCode, tierStr] = (session.client_reference_id || "").split("__");
      const tier = Number(tierStr);
      if (session.status === "complete" && candidateCode && [2, 3, 4].includes(tier)) {
        const svc = createServiceClient();
        const { data: attempt } = await svc
          .from("attempts")
          .select("id, user_id")
          .eq("candidate_code", candidateCode)
          .maybeSingle();
        if (attempt) {
          const { error: grantErr } = await svc.from("entitlements").upsert(
            {
              user_id: attempt.user_id,
              attempt_id: attempt.id,
              tier,
              source: "stripe",
              stripe_session_id: session.id,
              amount_cents: session.amount_total ?? null,
              currency: session.currency ?? null,
            },
            { onConflict: "attempt_id,tier", ignoreDuplicates: true },
          );
          if (grantErr) console.error("upgrade/complete: entitlement grant failed", grantErr);
          dest = `/results/${attempt.id}`;
        }
      }
    } catch (e) {
      console.error("upgrade complete: could not resolve session", e);
    }
  }

  redirect(dest);
}
