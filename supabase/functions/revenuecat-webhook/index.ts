// Supabase Edge Function: grant in-app purchases reported by RevenueCat.
//
// RevenueCat POSTs an event whenever a purchase/renewal happens. We map its product id back to our
// internal product key and call grant_purchase — the SAME idempotent grant the web/Stripe path uses
// (dedupes on the event id). The RevenueCat app user id IS the Supabase user id (set on the client).
//
// Secrets:
//   REVENUECAT_WEBHOOK_AUTH  - a shared secret; set the identical value as the Authorization header
//                              in RevenueCat → Project → Webhooks.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Event types that represent money in (consumables, non-consumables, and subscription renewals).
const GRANT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "UNCANCELLATION"]);
const PREFIX = "io.turfgame.app."; // App Store product id = PREFIX + our internal key

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  // Shared-secret auth: RevenueCat sends the configured Authorization header on every call.
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";
  if (expected && req.headers.get("Authorization") !== expected) return json({ error: "unauthorized" }, 401);

  try {
    const body = (await req.json()) as { event?: Record<string, unknown> };
    const ev = body.event ?? {};
    const type = String(ev.type ?? "");
    if (!GRANT_TYPES.has(type)) return json({ ok: true, skipped: type }); // ignore cancellations, test pings, etc.

    const userId = String(ev.app_user_id ?? "");
    const productId = String(ev.product_id ?? "");
    const product = productId.startsWith(PREFIX) ? productId.slice(PREFIX.length) : productId;
    // event id is unique per purchase/renewal → perfect idempotency key for grant_purchase.
    const txn = String(ev.id ?? ev.transaction_id ?? "");
    const platform = ev.store === "PLAY_STORE" ? "android" : "ios";
    if (!userId || !product || !txn) return json({ error: "missing fields", type }, 400);
    // Anonymous RevenueCat ids mean the purchase wasn't tied to an account — can't grant.
    if (userId.startsWith("$RCAnonymousID")) return json({ ok: true, skipped: "anonymous" });

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data, error } = await admin.rpc("grant_purchase", {
      p_user: userId,
      p_product: product,
      p_txn: txn,
      p_platform: platform,
    });
    if (error) {
      console.error("grant_purchase error:", error, { userId, product, txn });
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, result: data });
  } catch (e) {
    console.error("revenuecat-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
