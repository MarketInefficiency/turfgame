import type { CapacitorConfig } from "@capacitor/cli";

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
    contentInset: "always",
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
  },
};

export default config;
