/**
 * RevenueCat in-app purchases (native iOS/Android). Wraps the Capacitor plugin behind the same
 * intent the rest of the app already uses (buy a product key, restore). The RevenueCat app user id
 * is set to the Supabase user id, so RevenueCat's server-side webhook can grant the purchase to the
 * right account through grant_purchase — the same backbone the web/Stripe path uses.
 *
 * App Store product ids are `io.turfgame.app.<key>` where <key> is our internal product key
 * (pack_500 … pack_16000, membership, adfree). The webhook strips the prefix back to the key.
 *
 * Needs VITE_REVENUECAT_IOS_KEY (the RevenueCat public SDK key) at build time. Without it, or off
 * native, every call is a no-op so web/dev are unaffected.
 */
import { Purchases } from "@revenuecat/purchases-capacitor";
import { isNative, type PurchaseResult } from "./native";
import { authUserId } from "./auth/account";

const API_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY ?? "";
const PREFIX = "io.turfgame.app.";

let configured = false;

async function ensureConfigured(): Promise<boolean> {
  if (!isNative() || !API_KEY) return false;
  if (!configured) {
    await Purchases.configure({ apiKey: API_KEY, appUserID: authUserId() });
    configured = true;
  }
  return true;
}

/** Tie RevenueCat to the signed-in account (call on sign-in) so purchases credit the right user. */
export async function rcIdentify(): Promise<void> {
  if (!(await ensureConfigured())) return;
  const uid = authUserId();
  if (uid) await Purchases.logIn({ appUserID: uid });
}

/** Buy a product by our internal key (pack_500 / membership / adfree …). */
export async function rcPurchase(productKey: string): Promise<PurchaseResult> {
  if (!(await ensureConfigured())) return { ok: false, message: "Purchases aren't available right now." };
  try {
    const { products } = await Purchases.getProducts({ productIdentifiers: [PREFIX + productKey] });
    if (!products.length) return { ok: false, message: "This item isn't available right now." };
    await Purchases.purchaseStoreProduct({ product: products[0]! });
    // The grant lands via the RevenueCat → Supabase webhook; tell the player to expect it shortly.
    return { ok: true, message: "Purchase complete. Your balance will update in a moment." };
  } catch (e) {
    const err = e as { code?: string; message?: string; userCancelled?: boolean };
    if (err.userCancelled || /cancel/i.test(err.message ?? "")) return { ok: false, message: "" };
    return { ok: false, message: err.message ?? "Purchase didn't complete. Please try again." };
  }
}

/** Restore previously bought non-consumables / the subscription. */
export async function rcRestore(): Promise<PurchaseResult> {
  if (!(await ensureConfigured())) return { ok: false, message: "Purchases aren't available right now." };
  try {
    await Purchases.restorePurchases();
    return { ok: true, message: "Purchases restored." };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? "Couldn't restore purchases." };
  }
}
