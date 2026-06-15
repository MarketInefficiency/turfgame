/**
 * Native Sign in with Apple (iOS). Apple's guideline 4.8 wants the real native sheet when you also
 * offer another social login, so on the app we use the Capacitor plugin instead of the web OAuth
 * redirect. The secure flow: make a random nonce, send its SHA-256 hash to Apple, then give Supabase
 * the returned identity token plus the RAW nonce to verify against. The plugin is dynamically
 * imported so the web bundle never loads it.
 */
import { signInWithAppleIdToken } from "./account";

function randomNonce(len = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Run the native Apple sheet and sign in to Supabase. Returns an error message, or null on success. */
export async function nativeAppleSignIn(): Promise<string | null> {
  try {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);
    const result = await SignInWithApple.authorize({
      clientId: "io.turfgame.app", // bundle id on iOS; the Services ID on web/android
      redirectURI: "https://turfgame.io",
      scopes: "name email",
      nonce: hashedNonce,
    });
    const idToken = result.response?.identityToken;
    if (!idToken) return "Apple sign in was cancelled.";
    return await signInWithAppleIdToken(idToken, rawNonce);
  } catch (e) {
    // User cancelled or the sheet failed — surface a friendly message, don't crash the UI.
    const msg = e instanceof Error ? e.message : String(e);
    return /cancel/i.test(msg) ? null : "Apple sign in didn't complete. Please try again.";
  }
}
