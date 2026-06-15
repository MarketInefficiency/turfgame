// Supabase Edge Function: permanently delete the signed-in player's account and data.
//
// The App Store and Google Play both REQUIRE in-app account deletion. A user can't delete their own
// auth row from the client, so the browser/app calls this with their session token; we verify it,
// then use the service-role key to wipe their profile/entitlements/purchases and the auth user.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Deploy: supabase functions deploy delete-account
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    // Identify the caller from their session token (anon client scoped to their JWT).
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "not signed in" }, 401);

    // Admin client (service role) to wipe their rows and the auth user, bypassing RLS.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    // Remove user-owned rows first. Ignore "table missing" style errors so deletion still completes.
    await admin.from("entitlements").delete().eq("user_id", user.id);
    await admin.from("purchases").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
