import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Capacitor wraps the built web client (`dist/`) into the iOS/Android apps. One web codebase,
 * same Colyseus server (wss://turfgame.io/colyseus); only native shell + plugins differ.
 * appId is permanent once the store listings exist — do not change it.
 */
const config: CapacitorConfig = {
  appId: "io.turfgame.app",
  appName: "Turfgame",
  webDir: "dist",
  backgroundColor: "#0f1623",
  ios: {
    // "never" stops WKWebView from applying automatic scroll-view content insets. With our
    // full-screen position:fixed overlays, "always" desynced paint vs hit-testing (small controls
    // like the toggles/steppers became untappable) and shifted the UI off-screen under the keyboard.
    contentInset: "never",
    backgroundColor: "#0f1623",
  },
  android: {
    backgroundColor: "#0f1623",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // we hide it ourselves once the game is ready (see nativeShell.ts)
      backgroundColor: "#0f1623",
      showSpinner: false,
    },
    Keyboard: {
      // Don't let the native keyboard resize/scroll the webview — it fought our visual-viewport
      // (--vvh) layout. We keep the focused field above the keyboard ourselves (main.ts).
      resize: KeyboardResize.None,
    },
  },
};

export default config;
