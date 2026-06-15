import { Client, type Room } from "colyseus.js";
import { ARENA_ROOM, type PrivateOptions } from "@territory/shared";
import { SERVER_URL } from "./config";
import { authToken } from "../auth/account";

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
  // `token` is the Supabase access token when signed in (the server verifies it in onAuth and
  // uses the account username); guests send undefined and are named from their typed input.
  const token = authToken();
  switch (mode) {
    case "specific":
      if (!roomId) throw new Error("Enter a room code.");
      return client.joinById(roomId, { name, mode, token });
    case "create":
      return client.create(ARENA_ROOM, { name, mode, token });
    case "random":
    default:
      return client.joinOrCreate(ARENA_ROOM, { name, mode: "random", token });
  }
}

/**
 * Create a private arena (members only — the server rejects non-members). It's excluded from
 * matchmaking, so only the shared room code reaches it. Throws on rejection (e.g. not a member).
 */
export function createPrivate(name: string, options: PrivateOptions): Promise<Room> {
  return client.create(ARENA_ROOM, { name, token: authToken(), private: options });
}
