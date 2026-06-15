/**
 * Ads — one small, platform-agnostic controller.
 *
 * The frequency + gating live here and are the same everywhere: show a full-screen interstitial only
 * once every few game-overs, never back-to-back, and never for members or anyone who bought "Remove
 * Ads". Each platform plugs its own ad SDK into `setAdProvider`:
 *   - Web inside CrazyGames iframe → CrazyGames SDK (detected at runtime)
 *   - Web on our own domain        → Google AdSense H5 Games Ads (VITE_ADSENSE_CLIENT)
 *   - iOS / Android                → AppLovin MAX, registered by the Capacitor app once it exists
 * If no provider is registered (e.g. local dev), it simply shows nothing.
 */
import { runContext } from "./platform";

const EVERY_N = 3; // show on every 3rd game-over
const COOLDOWN_MS = 90_000; // and never more often than this
const MAX_AD_MS = 30_000; // safety: never let a stuck ad block the game longer than this

let gameOvers = 0;
let lastAdAt = 0;
let due = false;
let provider: (() => Promise<void>) | null = null;
let isAdFree: () => boolean = () => false;

/** Register the platform's interstitial. The promise should resolve when the ad finishes or fails. */
export function setAdProvider(show: () => Promise<void>): void {
  provider = show;
}

/** Tell the controller when ads should be suppressed (members + the ad-free purchase). */
export function setAdFreeCheck(fn: () => boolean): void {
  isAdFree = fn;
}

/** Count a game-over and decide whether the next "Play again" should run an ad. */
export function noteGameOver(): void {
  gameOvers++;
  due = !isAdFree() && provider !== null && gameOvers % EVERY_N === 0 && Date.now() - lastAdAt >= COOLDOWN_MS;
}

/** Run the interstitial if one is due (call this as the player continues). Never throws. */
export async function showAdIfDue(): Promise<void> {
  if (!due || !provider || isAdFree()) {
    due = false;
    return;
  }
  due = false;
  lastAdAt = Date.now();
  try {
    await Promise.race([provider(), new Promise<void>((r) => setTimeout(r, MAX_AD_MS))]);
  } catch {
    /* ad unavailable or errored — just carry on */
  }
}

/** Inject a script tag once and resolve when it loads. */
function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Wire the right web ad SDK for the CURRENT context (detected at runtime, since one build serves both
 * the standalone site and the CrazyGames iframe). Safe to call always; on local dev it does nothing,
 * so the game never shows ads in development.
 */
export function initWebAds(): void {
  // Inside the CrazyGames iframe → their SDK (required there; their own ad fill).
  if (runContext() === "crazygames") {
    void loadScript("https://sdk.crazygames.com/crazygames-sdk-v3.js")
      .then(async () => {
        const sdk = (window as unknown as { CrazyGames?: { SDK?: any } }).CrazyGames?.SDK;
        if (!sdk) return;
        try {
          await sdk.init();
        } catch {
          /* init can fail; requestAd will just error and we no-op */
        }
        setAdProvider(
          () =>
            new Promise<void>((resolve) => {
              sdk.ad.requestAd("midgame", { adFinished: () => resolve(), adError: () => resolve() });
            }),
        );
      })
      .catch(() => {
        /* SDK didn't load → no ads */
      });
    return;
  }

  // Standalone site → Google AdSense H5 Games Ads. Needs an approved pub id (set on the site build).
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  if (client) {
    void loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`, {
      crossorigin: "anonymous",
    })
      .then(() => {
        const w = window as unknown as { adsbygoogle?: unknown[]; adBreak?: (o: unknown) => void; adConfig?: (o: unknown) => void };
        w.adsbygoogle = w.adsbygoogle ?? [];
        w.adConfig?.({ preloadAdBreaks: "on" });
        if (typeof w.adBreak !== "function") return;
        setAdProvider(
          () =>
            new Promise<void>((resolve) => {
              w.adBreak!({ type: "next", name: "respawn", adBreakDone: () => resolve() });
            }),
        );
      })
      .catch(() => {
        /* script blocked / not approved → no ads */
      });
  }
}
