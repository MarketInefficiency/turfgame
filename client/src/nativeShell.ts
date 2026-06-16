/**
 * Native shell setup (iOS/Android only): style/hide the status bar for a fullscreen game, hold the
 * splash a beat longer, then cross-fade into the title screen. Capacitor plugins are dynamically
 * imported so the web/CrazyGames bundle never loads native code. No-op off-device.
 *
 * Orientation is enforced by the platform config, not here: iOS Info.plist and the Android manifest
 * allow ONLY the two landscape orientations. That makes the launch splash landscape, never flashes
 * the portrait rotate-gate, and lets the device flip freely between landscape-left and -right.
 */
import { isNative } from "./native";

export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;
  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);
    // Dark UI over the deep-navy backdrop; hidden for an immersive fullscreen game.
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.hide().catch(() => {});
    // Hold the logo splash a touch longer, then fade it out so it eases into the title screen
    // (which is already rendered underneath) instead of snapping away.
    await new Promise((r) => setTimeout(r, 900));
    await SplashScreen.hide({ fadeOutDuration: 500 }).catch(() => {});
  } catch {
    // Plugins unavailable (shouldn't happen on a real device) — fail open, keep the game running.
  }
}
