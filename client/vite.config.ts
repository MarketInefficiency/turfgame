import { defineConfig } from "vite";

// Vite exposes import.meta.env.VITE_* automatically. The Colyseus endpoint comes
// from VITE_SERVER_URL (see src/net/config.ts), never hard-coded in game logic.
export default defineConfig({
  server: {
    host: true, // allow other devices/tabs on the LAN to reach the dev server
  },
});
