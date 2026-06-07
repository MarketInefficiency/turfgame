import { Client, type Room } from "colyseus.js";
import { ARENA_ROOM } from "@territory/shared";
import { SERVER_URL } from "./config";

/** The three start-screen entry options (protocol.md §1). */
export type JoinMode = "random" | "specific" | "create";

export interface JoinParams {
  mode: JoinMode;
  name: string;
  /** Required only for `specific` (the room code typed by the player). */
  roomId?: string;
}

// One Colyseus client for the whole app, pointed at the configured endpoint.
const client = new Client(SERVER_URL);

/**
 * Map each start-screen option to its Colyseus matchmaking call. The server assigns
 * color and (later) state; the client only sends its name. Throws on failure (room
 * missing/full/etc.) — the caller surfaces a friendly message.
 */
export function join({ mode, name, roomId }: JoinParams): Promise<Room> {
  // `mode` is forwarded so the server can decide how to populate the arena with AI
  // players (established arena for random, gradual fill for a freshly-created room).
  switch (mode) {
    case "specific":
      if (!roomId) throw new Error("Enter a room code.");
      return client.joinById(roomId, { name, mode });
    case "create":
      return client.create(ARENA_ROOM, { name, mode });
    case "random":
    default:
      return client.joinOrCreate(ARENA_ROOM, { name, mode: "random" });
  }
}
