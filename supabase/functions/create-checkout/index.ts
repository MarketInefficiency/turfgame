// Supabase Edge Function: create a Stripe Checkout session for a signed-in player.
//
// The browser calls this with the product id; we look up its Stripe price, open a hosted Checkout
// session tied to the player's account, and hand back the URL to redirect to. No card data ever
// touches our code. Granting happens later in the webhook, never here.
//
// Secrets (set with `supabase secrets set ...`):
//   STRIPE_SECRET_KEY   - sk_test_... / sk_live_...
//   STRIPE_PRICE_MAP    - JSON, our product id -> Stripe price id, e.g.
//                         {"pack_500":"price_...","membership":"price_...","adfree":"price_..."}
//   APP_URL             - optional fallback return origin (e.g. https://play.yourgame.com)
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.
//
// Deploy: supabase functions deploy create-checkout
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2024-06-20",
});
const priceMap: Record<string, string> = JSON.parse(Deno.env.get("STRIPE_PRICE_MAP") ?? "{}");

const cors = {
  "Access-Control-Allow-Origin": "*",
  // The Supabase JS client adds apikey + x-client-info to function calls; allow them or the
  // browser's preflight blocks the request.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Identify the player from their Supabase session token.
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "not signed in" }, 401);

    const { product } = (await req.json()) as { product?: string };
    const price = product ? priceMap[product] : undefined;
    if (!product || !price) return json({ error: "unknown product" }, 400);

    const subscription = product === "membership";
    const origin = req.headers.get("origin") ?? Deno.env.get("APP_URL") ?? "";

    const session = await stripe.checkout.sessions.create({
      mode: subscription ? "subscription" : "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      success_url: `${origin}/?purchase=success`,
      cancel_url: `${origin}/?purchase=cancel`,
      // Metadata rides along to the webhook so it knows who bought what. For subscriptions we also
      // stamp the subscription itself, so every monthly invoice can be credited.
      metadata: { userId: user.id, product },
      ...(subscription ? { subscription_data: { metadata: { userId: user.id, product } } } : {}),
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("create-checkout error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
