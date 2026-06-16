/**
 * Native (iOS/Android) social sign-in via Supabase OAuth + a deep link.
 *
 * On the web, Supabase redirects back to the page and reads the session from the URL. The native app
 * has no such page, so the redirect must come back to the app through a custom URL scheme
 * (io.turfgame.app://login-callback). We open the provider page in the system browser, catch the
 * redirect via Capacitor's appUrlOpen, and exchange the PKCE code for a session. Works for both
 * Google and Apple with no native provider SDKs (so no Capacitor-8 plugin conflicts).
 *
 * Requires: the redirect URL allow-listed in Supabase Auth, and the URL scheme registered in
 * Info.plist (done in codemagic.yaml).
 */
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "../net/supabase";

const REDIRECT = "io.turfgame.app://login-callback";

/** Run the native OAuth flow for a provider. Returns an error message, or null on success. */
export async function nativeOAuth(provider: "google" | "apple"): Promise<string | null> {
  if (!supabase) return "Accounts are not available.";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return error?.message ?? "Could not start sign in.";

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const finish = (result: string | null): void => {
      if (settled) return;
      settled = true;
      void handle?.remove();
      void Browser.close().catch(() => {});
      resolve(result);
    };
    const onUrl = async (event: URLOpenListenerEvent): Promise<void> => {
      if (!event.url.startsWith(REDIRECT)) return;
      try {
        const u = new URL(event.url);
        const code = u.searchParams.get("code");
        if (code) {
          const { error: exErr } = await supabase!.auth.exchangeCodeForSession(code);
          finish(exErr ? exErr.message : null);
          return;
        }
        // Fallback for implicit flow: tokens arrive in the URL fragment.
        const hash = new URLSearchParams(event.url.split("#")[1] ?? "");
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        if (access_token && refresh_token) {
          const { error: sErr } = await supabase!.auth.setSession({ access_token, refresh_token });
          finish(sErr ? sErr.message : null);
        } else {
          finish("Sign in didn't complete.");
        }
      } catch (e) {
        finish(e instanceof Error ? e.message : "Sign in failed.");
      }
    };
    void App.addListener("appUrlOpen", onUrl).then((h) => {
      handle = h;
    });
    void Browser.open({ url: data.url });
  });
}
