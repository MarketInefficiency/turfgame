/**
 * Server-side Supabase access for accounts. Uses the SECRET (service-role) key, which bypasses
 * Row Level Security — so it lives ONLY here, read from the server env, never sent to clients.
 *
 * The room verifies a player's access token on join (onAuth) and loads their profile (username +
 * equipped cosmetics). Everything is defensive: if Supabase isn't configured, the token is missing
 * or invalid, or a query fails, we return null and the caller falls back to guest play. Accounts
 * never block someone from playing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";

const admin: SupabaseClient | null =
  url && secret ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

export const accountsEnabled = admin !== null;

/** The account data the room needs: who they are, their name, equipped designs, and owned ids. */
export interface AccountProfile {
  userId: string;
  username: string | null;
  equippedSkin: string;
  equippedCapital: string;
  equippedSword: string;
  equippedCloak: string;
  equippedHat: string;
  equippedHair: string;
  equippedShirt: string;
  owned: string[]; // cosmetic ids the player has bought (free ones are always allowed)
  member: boolean; // active membership (premium) — unlocks cloaks
}

/**
 * Verify a Supabase access token and load the player's profile. Returns null if accounts are
 * off, the token is missing/invalid, or the lookup fails (the caller then treats them as a guest).
 */
export async function profileFromToken(token: string | undefined): Promise<AccountProfile | null> {
  if (!admin || !token) return null;
  try {
    const { data: userData, error } = await admin.auth.getUser(token);
    if (error || !userData.user) return null;
    const id = userData.user.id;
    const { data: prof } = await admin
      .from("profiles")
      .select("username, equipped_skin, equipped_capital, equipped_sword, equipped_cloak, equipped_hat, equipped_hair, equipped_shirt, premium_until")
      .eq("id", id)
      .single();
    const { data: ent } = await admin.from("entitlements").select("cosmetic_id").eq("user_id", id);
    const premiumUntil = prof?.premium_until as string | null | undefined;
    return {
      userId: id,
      username: (prof?.username as string | null) ?? null,
      equippedSkin: (prof?.equipped_skin as string) ?? "default",
      equippedCapital: (prof?.equipped_capital as string) ?? "default",
      equippedSword: (prof?.equipped_sword as string) ?? "default",
      equippedCloak: (prof?.equipped_cloak as string) ?? "default",
      equippedHat: (prof?.equipped_hat as string) ?? "default",
      equippedHair: (prof?.equipped_hair as string) ?? "default",
      equippedShirt: (prof?.equipped_shirt as string) ?? "default",
      owned: (ent ?? []).map((e) => e.cosmetic_id as string),
      member: premiumUntil != null && Date.parse(premiumUntil) > Date.now(),
    };
  } catch {
    return null; // never let an accounts hiccup stop someone from playing
  }
}

// --- Cosmetics catalog cache (server-authoritative validation of what a player may equip) ---
interface CatalogRow {
  free: boolean;
  color: string | null;
}
let catalog = new Map<string, CatalogRow>(); // key `${type}:${id}`

/** Refresh the cosmetics catalog from the DB (called at start + on an interval). No-op if off. */
export async function refreshCatalog(): Promise<void> {
  if (!admin) return;
  try {
    const { data } = await admin.from("cosmetics").select("id,type,free,color").eq("active", true);
    catalog = new Map(
      (data ?? []).map((r) => [`${r.type}:${r.id}`, { free: Boolean(r.free), color: (r.color as string | null) ?? null }]),
    );
  } catch {
    /* keep the last good catalog */
  }
}

/** A player may equip an item only if it's the default, a free item, or one they own. */
export function catalogAllows(type: string, id: string, owned: ReadonlySet<string>): boolean {
  if (id === "default") return true;
  const c = catalog.get(`${type}:${id}`);
  return c ? c.free || owned.has(id) : false;
}

/** The territory/builtin colour for a skin id (null = use a random colour, e.g. image skins). */
export function catalogSkinColor(id: string): string | null {
  if (id === "default") return null;
  return catalog.get(`skin:${id}`)?.color ?? null;
}

/**
 * Credit medals to a player's account (server-authoritative; called on defeat). Uses the
 * award_medals RPC so the balance change + ledger row are atomic. Fire-and-forget; failures
 * are swallowed so they never affect gameplay.
 */
export async function awardMedals(userId: string, amount: number, reason: string): Promise<void> {
  if (!admin || amount <= 0) return;
  try {
    await admin.rpc("award_medals", { p_user: userId, p_amount: amount, p_reason: reason });
  } catch {
    /* ignore — medals can be reconciled later, gameplay must not break */
  }
}
