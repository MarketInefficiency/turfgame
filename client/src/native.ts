/**
 * Native (iOS/Android) capabilities the web client calls through one thin layer, so the UI is final
 * and only the bodies change when the Capacitor plugins land.
 *
 * Phase 1: purchases/restore are stubbed with a friendly "being set up" result so the whole flow is
 * wired and testable in a browser (force the context to see it). Phase 3 fills these in with
 * RevenueCat, which grants through the same Supabase backbone the web Stripe path uses.
 */
import { runContext } from "./platform";

export function isNative(): boolean {
  const c = runContext();
  return c === "ios" || c === "android";
}

export interface PurchaseResult {
  ok: boolean;
  message: string;
}

/** Buy a product through the device store (RevenueCat). Never called on web (that path uses Stripe). */
export async function nativePurchase(product: string): Promise<PurchaseResult> {
  const { rcPurchase } = await import("./revenuecat"); // lazy: keeps RevenueCat out of the web bundle
  return rcPurchase(product);
}

/** Restore prior non-consumable / subscription purchases (App Store & Play require this). */
export async function nativeRestore(): Promise<PurchaseResult> {
  const { rcRestore } = await import("./revenuecat");
  return rcRestore();
}
