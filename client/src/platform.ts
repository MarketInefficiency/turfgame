/**
 * Where the same web build is currently running. One build serves four contexts and each has its
 * own rules for ads and payments:
 *   - "web"        standalone turfgame.io  → AdSense ads, Stripe checkout
 *   - "crazygames" inside the CrazyGames iframe → CrazyGames SDK ads, NO external payments
 *   - "ios"/"android" inside the Capacitor app webview → AppLovin ads, store in-app purchases
 * Detected at runtime so a single deploy behaves correctly everywhere.
 */
export type RunContext = "web" | "crazygames" | "ios" | "android";

export function runContext(): RunContext {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.();
    if (p === "ios") return "ios";
    if (p === "android") return "android";
  }
  try {
    if (window.self !== window.top) {
      const ref = document.referrer || "";
      const anc = (location as unknown as { ancestorOrigins?: { [i: number]: string } }).ancestorOrigins?.[0] ?? "";
      if (/crazygames\.com/i.test(ref) || /crazygames\.com/i.test(anc)) return "crazygames";
    }
  } catch {
    // Cross-origin framed and unreadable → almost certainly a portal embed; play it safe.
    return "crazygames";
  }
  return "web";
}

/** Stripe Checkout only works on the standalone site (it can't load in the CrazyGames iframe, and
 *  the native apps must use store IAP instead). */
export function stripeCheckoutAllowed(): boolean {
  return runContext() === "web";
}
