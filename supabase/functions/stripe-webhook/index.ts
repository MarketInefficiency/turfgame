// Supabase Edge Function: Stripe webhook. The single trusted point where a confirmed payment turns
// into medals / membership / ad-free, by calling grant_purchase with the service role. The client
// is never involved, and grant_purchase is idempotent, so a repeated delivery is harmless.
//
// One-time purchases (medal packs, ad-free) are granted on `checkout.session.completed`.
// Membership is granted on `invoice.paid`, which fires for the first charge AND every renewal, so
// each month credits once (keyed by the invoice id).
//
// Secrets:
//   STRIPE_SECRET_KEY     - sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET - whsec_... (from the Stripe webhook endpoint you create)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//   (--no-verify-jwt because Stripe calls it directly; we verify the Stripe signature instead.)
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

async function grant(userId: string | undefined, product: string | undefined, txn: string | undefined): Promise<void> {
  if (!userId || !product || !txn) return;
  const { error } = await admin.rpc("grant_purchase", {
    p_user: userId,
    p_product: product,
    p_txn: txn,
    p_platform: "web",
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", webhookSecret);
  } catch (e) {
    return new Response(`bad signature: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      // Reliable grant point for everything: one-time packs/ad-free AND a membership's first month.
      // The session carries our metadata no matter the API version, so we don't depend on the
      // invoice shape here.
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid") {
        await grant(s.metadata?.userId, s.metadata?.product, s.id);
      }
    } else if (event.type === "invoice.paid") {
      // Membership renewals only — the first month already came from the session above. Newer Stripe
      // API versions moved the subscription reference off the invoice, so check the known spots.
      const inv = event.data.object as Record<string, unknown> & { lines?: { data?: unknown[] } };
      if (inv.billing_reason === "subscription_cycle") {
        const line = (Array.isArray(inv.lines?.data) ? inv.lines?.data[0] : undefined) as Record<string, any> | undefined;
        const parent = inv.parent as Record<string, any> | undefined;
        const subId =
          (typeof inv.subscription === "string" ? inv.subscription : undefined) ??
          parent?.subscription_details?.subscription ??
          (typeof line?.subscription === "string" ? line.subscription : undefined) ??
          line?.parent?.subscription_item_details?.subscription;
        let meta: Record<string, string> = {};
        if (typeof subId === "string") {
          const sub = await stripe.subscriptions.retrieve(subId);
          meta = (sub.metadata as Record<string, string>) ?? {};
        }
        await grant(meta.userId, meta.product, inv.id as string); // invoice id → one grant per cycle
      }
    }
  } catch (e) {
    console.error("grant failed:", e);
    return new Response("grant error", { status: 500 }); // 500 → Stripe retries later
  }
  return new Response("ok", { status: 200 });
});
