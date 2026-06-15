/**
 * Shared wire types — the contract spoken by both client and server.
 * Kept deliberately small for M0; expanded as later milestones land
 * (Colyseus schema in M2, grid-delta encoding in M2, events in M3/M5).
 * See protocol.md.
 */

/** Colyseus room name used by every join flow (protocol.md §1). */
export const ARENA_ROOM = "arena";

/** Reserved owner id for an unclaimed cell (protocol.md §3b). */
export const NEUTRAL_OWNER = 0;

/** Message channel names shared by client and server (protocol.md §2–3). */
export const MSG = {
  /** Client → server: input packet. */
  INPUT: "input",
  /** Client → server: "I've registered my handlers, send me the grid snapshot." */
  READY: "ready",
  /** Server → one client: full territory grid (RLE) on join. */
  GRID_SNAPSHOT: "gridSnap",
  /** Server → room: changed cells since last tick (binary deltas). */
  GRID_DELTA: "gridDelta",
  /** Server → one client: static foliage terrain map (RLE) on join. */
  FOLIAGE: "foliage",
  /** Server → one client: you died (carries the cause; triggers the defeat banner → start-screen flow, ui-ux §5). */
  DIED: "youDied",
  /** Server → one client: your in-progress claim line was voided (someone crossed it). */
  CLAIM_VOIDED: "claimVoided",
  /** Server → room: a notable arena event (join, kill, conquest) for the news feed. */
  EVENT: "arenaEvent",
  /** Server → one client: your loop couldn't take an enemy capital that still has power. */
  CAP_BLOCKED: "capBlocked",
  /** Client → server: the private-arena host starts the match (everyone in the lobby spawns). */
  START_GAME: "startGame",
  /** Client → server: a waiting player toggles their ready flag in the lobby. */
  LOBBY_READY: "lobbyReady",
  /** Server → client: the current private-arena lobby roster (who's waiting + the host). */
  LOBBY: "lobby",
  /** Server → one client: you're out of a death match (no respawn); carries your placing so far. */
  ELIMINATED: "eliminated",
  /** Server → room: the death match is over; carries the final ranking. */
  MATCH_END: "matchEnd",
} as const;

/** Options a member passes to create a private arena. */
export interface PrivateOptions {
  /** Player cap, clamped server-side to 2..50. */
  maxPlayers: number;
  /** Wait in a lobby for the host to start, vs. drop straight into the arena on connect. */
  lobby: boolean;
  /** Last one standing: no respawn, eliminated players spectate, a ranking shows at the end. */
  deathmatch: boolean;
}

/** One row of the private-arena lobby roster. */
export interface LobbyMember {
  name: string;
  color: string;
  host: boolean;
  ready: boolean;
}

/** Payload for LOBBY: everyone currently waiting in the lobby. */
export interface LobbyState {
  players: LobbyMember[];
}

/** Payload for ELIMINATED: your place so far and how many started, shown while you spectate.
 *  `byId` is the sessionId of whoever knocked you out, so the client can start by watching them. */
export interface Eliminated {
  place: number;
  total: number;
  byId?: string;
}

/** One row of a finished death match's ranking. */
export interface RankRow {
  place: number;
  name: string;
  color: string;
  peak: number;
}

/** Payload for MATCH_END: the final standings, best place first. */
export interface MatchEnd {
  rankings: RankRow[];
}

/** Payload for CAP_BLOCKED: which operation the player attempted. */
export interface CapBlocked {
  context: "claim" | "sever";
}

/**
 * How the local player died — drives the wording of the defeat banner (ui-ux §5).
 * `home`: killed standing on an enemy's land. `wild`: lost a wilderness skirmish.
 * `wiped`: army ran out otherwise (e.g. decayed to nothing).
 */
export type DeathCause = "home" | "wild" | "wiped";

/** Payload for DIED: how the player died, the medals this defeat earned (0 for guests),
 *  the peak power reached this run, and the name of whoever landed the kill (if anyone). */
export interface Died {
  cause: DeathCause;
  medals: number;
  peak: number;
  by?: string;
}

/** One actor in an arena event — name + skin color, so the feed can color the name. */
export interface EventActor {
  name: string;
  color: string;
}

/**
 * A notable thing that happened in the arena, broadcast for the bottom-left news feed.
 * The client picks the wording (lots of phrasings) so it reads fresh; the server only
 * states what happened and who was involved.
 */
export interface ArenaEvent {
  kind: "join" | "killWild" | "killHome" | "conquer";
  a: EventActor; // the doer (joiner, or killer)
  b?: EventActor; // the victim, when there is one
}

/** Where a player's body currently is, relative to their own land (game-spec §3). */
export type PlayerStateTag = "HOME" | "WILD";

/**
 * Client → server input packet (protocol.md §2). Inputs only — the client never
 * asserts position, captures, kills, or army. `aim*` is the cursor offset from the
 * avatar (direction + magnitude → speed); `drawing` is true while LMB is held.
 */
export interface InputPacket {
  seq: number;
  aimX: number;
  aimY: number;
  drawing: boolean;
}

/** A read-only view of a player as rendered by clients (mirrors the schema in M2). */
export interface PlayerView {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  army: number;
  state: PlayerStateTag;
  drawing: boolean;
  alive: boolean;
}
