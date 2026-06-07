/**
 * Single place the client resolves the server endpoint. Config, not code branches:
 * dev defaults to plain ws://localhost; production sets VITE_SERVER_URL to the
 * wss://<domain>/colyseus value at build time. Never hard-code this in game logic.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";
