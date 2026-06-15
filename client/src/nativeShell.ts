/**
 * Native shell setup (iOS/Android only): lock to landscape, style/hide the status bar for a
 * fullscreen game, and dismiss the splash once we're ready. Capacitor plugins are dynamically
 * imported so the web/CrazyGames bundle never loads native code. No-op off-device.
 */
import { isNative } from "./native";

export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;
  try {
    const [{ ScreenOrientation }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/screen-orientation"),
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);
    // Hard-lock landscape so the rotate-gate prompt is never needed in the app.
    await ScreenOrientation.lock({ orientation: "landscape" }).catch(() => {});
    // Dark UI over the deep-navy backdrop; hidden for an immersive fullscreen game.
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.hide().catch(() => {});
    await SplashScreen.hide().catch(() => {});
  } catch {
    // Plugins unavailable (shouldn't happen on a real device) — fail open, keep the game running.
  }
}
