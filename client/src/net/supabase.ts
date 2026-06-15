/**
 * Client Supabase instance for accounts. Built from PUBLIC env (the publishable/anon key is safe
 * to embed). If accounts aren't configured (no URL/key), `supabase` is null and the whole app
 * stays in guest-only mode — the game plays exactly as before. Config, not code branches.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // detectSessionInUrl: pick up the session when Google/Apple redirect back with tokens in the URL.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

/** True when accounts are configured for this build; the UI hides sign-in when false. */
export const accountsEnabled = supabase !== null;
