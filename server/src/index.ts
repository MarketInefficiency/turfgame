import "dotenv/config";
import { Server } from "colyseus";
import { uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { ARENA_ROOM, CONFIG } from "@territory/shared";
import { ArenaRoom } from "./rooms/ArenaRoom.js";
import { refreshCatalog } from "./auth/supabase.js";

// Keep the cosmetics catalog warm so onJoin can validate equipped items (incl. admin-created ones).
void refreshCatalog();
setInterval(() => void refreshCatalog(), 5 * 60 * 1000);

// Port comes from env (architecture.md: config, not code branches). Local dev runs
// plain ws:// with no TLS/nginx; production fronts this with nginx + WSS.
const port = Number(process.env.PORT) || 2567;

const gameServer = new Server({
  transport: new uWebSocketsTransport(),
});

gameServer.define(ARENA_ROOM, ArenaRoom);

gameServer
  .listen(port)
  .then(() => {
    console.log(
      `[territory] server listening on ws://localhost:${port} ` +
        `(room "${ARENA_ROOM}", tick ${CONFIG.TICK_RATE}Hz)`
    );
  })
  .catch((err) => {
    console.error("[territory] failed to start server:", err);
    process.exit(1);
  });
