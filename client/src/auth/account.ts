/**
 * Account state for the client: guest by default, optional email sign-in to persist a username
 * and (later) cosmetics. All no-ops when accounts aren't configured, so guest play is untouched.
 */
import type { Session } from "@supabase/supabase-js";
import type { CosmeticType } from "@territory/shared";
import { supabase } from "../net/supabase";

export interface Profile {
  username: string | null;
  equippedSkin: string;
  equippedCapital: string;
  equippedSword: string;
  equippedCloak: string;
  equippedHat: string;
  equippedHair: string;
  equippedShirt: string;
  owned: string[]; // cosmetic ids this account has bought (free ones are always usable)
  medals: number;
  adFree: boolean;
  premiumUntil: string | null;
}

/** True while a membership is active (unlocks cloaks + member perks). */
export function isMember(p: Profile | null | undefined): boolean {
  return !!p?.premiumUntil && Date.parse(p.premiumUntil) > Date.now();
}

export interface AccountState {
  signedIn: boolean;
  email: string | null;
  provider: string | null; // how they signed in: "google" | "apple" | "email"
  name: string | null; // display name the account already provides (profile username, or the name/email the provider returned)
  profile: Profile | null;
}

let session: Session | null = null;
let current: AccountState = { signedIn: false, email: null, provider: null, name: null, profile: null };
const listeners = new Set<(s: AccountState) => void>();

/** Access token to hand Colyseus on join (undefined for guests). */
export function authToken(): string | undefined {
  return session?.access_token;
}

/** The signed-in player's Supabase user id (used as the RevenueCat app user id). */
export function authUserId(): string | undefined {
  return session?.user.id;
}

/** Subscribe to account changes; fires immediately with the current state. Returns an unsubscribe. */
export function onAccountChange(fn: (s: AccountState) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn(current);
}

async function refreshProfile(): Promise<void> {
  if (!supabase || !session) {
    current = { signedIn: false, email: null, provider: null, name: null, profile: null };
    emit();
    return;
  }
  const { data } = await supabase
    .from("profiles")
    .select("username, equipped_skin, equipped_capital, equipped_sword, equipped_cloak, equipped_hat, equipped_hair, equipped_shirt, medals, ad_free, premium_until")
    .eq("id", session.user.id)
    .single();
  const { data: ent } = await supabase.from("entitlements").select("cosmetic_id").eq("user_id", session.user.id);
  // The provider (Apple/Google) hands us a name on first sign-in; use it so we never ask the player to
  // type their name again (App Store Guideline 4 for Sign in with Apple). Falls back to the email handle.
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = (meta.full_name ?? meta.name ?? meta.preferred_username) as string | undefined;
  const emailLocal = session.user.email ? session.user.email.split("@")[0] : undefined;
  const displayName = ((data?.username as string | null) || metaName || emailLocal) ?? null;
  current = {
    signedIn: true,
    email: session.user.email ?? null,
    // Supabase records the sign-in method on the user; show it so people know which login they used.
    provider: (session.user.app_metadata?.provider as string | undefined) ?? null,
    name: displayName,
    profile: data
      ? {
          username: (data.username as string | null) ?? null,
          equippedSkin: (data.equipped_skin as string) ?? "default",
          equippedCapital: (data.equipped_capital as string) ?? "default",
          equippedSword: (data.equipped_sword as string) ?? "default",
          equippedCloak: (data.equipped_cloak as string) ?? "default",
          equippedHat: (data.equipped_hat as string) ?? "default",
          equippedHair: (data.equipped_hair as string) ?? "default",
          equippedShirt: (data.equipped_shirt as string) ?? "default",
          owned: (ent ?? []).map((e) => e.cosmetic_id as string),
          medals: (data.medals as number) ?? 0,
          adFree: (data.ad_free as boolean) ?? false,
          premiumUntil: (data.premium_until as string | null) ?? null,
        }
      : null,
  };
  emit();
}

/** Wire session tracking once at boot. No-op if accounts are disabled. */
export async function initAccounts(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  session = data.session;
  await refreshProfile();
  supabase.auth.onAuthStateChange((_event, s) => {
    session = s;
    void refreshProfile();
  });
}

export async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Accounts are not available.");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Accounts are not available.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Start an OAuth sign-in (Google or Apple). On success the browser redirects to the provider and
 * comes back to this page, where supabase-js reads the session from the URL. Returns an error
 * message if the redirect couldn't be started (e.g. the provider isn't enabled in Supabase).
 */
export async function signInWithProvider(provider: "google" | "apple"): Promise<string | null> {
  if (!supabase) return "Accounts are not available.";
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      // Always show Google's account chooser, so a signed-out user can switch accounts instead of
      // being dropped straight back into the one still logged into Google.
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  return error ? error.message : null;
}

/**
 * Native Sign in with Apple: the device returns an Apple identity token (with a hashed nonce) which
 * we hand to Supabase along with the matching raw nonce. Used on iOS instead of the OAuth redirect
 * (Apple guideline 4.8 wants the native sheet). Returns an error message, or null on success.
 */
export async function signInWithAppleIdToken(idToken: string, nonce: string): Promise<string | null> {
  if (!supabase) return "Accounts are not available.";
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken, nonce });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Permanently delete the signed-in player's account and data (App Store / Play requirement).
 * Runs server-side via the `delete-account` edge function (a user can't delete their own auth row
 * from the client), then signs out locally. Returns an error message, or null on success.
 */
export async function deleteAccount(): Promise<string | null> {
  if (!supabase || !session) return "You're not signed in.";
  const { error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) return error.message || "Could not delete your account. Please try again.";
  await supabase.auth.signOut();
  return null;
}

/** Re-fetch the signed-in player's profile (e.g. after earning medals on defeat). */
export async function refreshAccount(): Promise<void> {
  await refreshProfile();
}

/** Send a password-reset email. Returns an error message, or null on success. */
export async function resetPassword(email: string): Promise<string | null> {
  if (!supabase) return "Accounts are not available.";
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? error.message : null;
}

const USERNAME_RE = /^[A-Za-z0-9_-]{1,8}$/;

/** Claim/replace the account username. Returns an error message, or null on success. */
export async function claimUsername(name: string): Promise<string | null> {
  if (!supabase || !session) return "You're not signed in.";
  const trimmed = name.trim();
  if (!USERNAME_RE.test(trimmed)) return "1–8 letters, numbers, _ or -.";
  const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", session.user.id);
  if (error) return error.code === "23505" ? "That name is taken." : "Couldn't save that name.";
  await refreshProfile();
  return null;
}

const EQUIP_COLUMN: Record<CosmeticType, string> = {
  skin: "equipped_skin",
  capital: "equipped_capital",
  sword: "equipped_sword",
  cloak: "equipped_cloak",
  hat: "equipped_hat",
  hair: "equipped_hair",
  shirt: "equipped_shirt",
};

/** Equip a cosmetic for this account. Returns an error message, or null on success. */
export async function equipCosmetic(type: CosmeticType, id: string): Promise<string | null> {
  if (!supabase || !session) return "Sign in to equip cosmetics.";
  const { error } = await supabase
    .from("profiles")
    .update({ [EQUIP_COLUMN[type]]: id })
    .eq("id", session.user.id);
  if (error) return "Couldn't equip that.";
  await refreshProfile();
  return null;
}

/**
 * What's equipped in a slot right now. Cosmetics are tracked per account, so a guest has nothing
 * equipped (everything reads as default) until they make a free account.
 */
export function equippedId(type: CosmeticType): string {
  const p = current.profile;
  if (!current.signedIn || !p) return "default";
  const byType: Record<CosmeticType, string> = {
    skin: p.equippedSkin, capital: p.equippedCapital, sword: p.equippedSword,
    cloak: p.equippedCloak, hat: p.equippedHat, hair: p.equippedHair, shirt: p.equippedShirt,
  };
  return byType[type] ?? "default";
}

/**
 * Start a real-money purchase (medal pack, membership, or ad-free) via Stripe Checkout. Calls the
 * create-checkout edge function, then redirects the browser to the hosted Stripe page. The account
 * is credited later by the webhook, never here. Returns an error message, or null (the page is
 * redirecting on success).
 */
export async function startCheckout(product: string): Promise<string | null> {
  if (!supabase || !session) return "Sign in to make a purchase.";
  const { data, error } = await supabase.functions.invoke("create-checkout", { body: { product } });
  if (error) {
    // Surface the function's actual error body (e.g. the Stripe message) instead of a generic line.
    let detail = "";
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === "function" ? ((await ctx.json()) as { error?: string }) : null;
      detail = body?.error ?? "";
    } catch {
      /* couldn't read the body */
    }
    return detail || "Couldn't start checkout. Try again in a moment.";
  }
  const url = (data as { url?: string; error?: string } | null)?.url;
  if (!url) return (data as { error?: string } | null)?.error ?? "Couldn't start checkout.";
  window.location.href = url;
  return null;
}

/**
 * Spend medals on a cosmetic via the server-authoritative buy_cosmetic RPC (the price is enforced
 * in the database, never trusted from the client). Returns an error message, or null on success.
 */
export async function buyCosmetic(id: string): Promise<string | null> {
  if (!supabase || !session) return "Sign in to buy cosmetics.";
  const { data, error } = await supabase.rpc("buy_cosmetic", { p_id: id });
  if (error) return "Couldn't complete the purchase.";
  const res = data as { ok?: boolean; error?: string } | null;
  if (!res?.ok) return res?.error ?? "Purchase failed.";
  await refreshProfile();
  return null;
}
