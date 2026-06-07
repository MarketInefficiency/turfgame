import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Authoritative, auto-delta-synced room state (protocol.md §3a). The client decodes
 * this via colyseus.js reflection — no shared schema classes required. Position/army
 * are written only by the server tick; clients send inputs, never state.
 */
export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "#888888";
  /** Numeric owner id used in the territory grid (0 is reserved for NEUTRAL). */
  @type("uint16") ownerId = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") army = 0;
  /** "HOME" (inside own territory) or "WILD" — drives location-based zoom. */
  @type("string") stateTag = "WILD";
  @type("boolean") drawing = false;
  @type("boolean") alive = true;
  /**
   * Which foliage patch the player is standing in (0 = none). While in cover they're
   * concealed from everyone EXCEPT players sharing the same coverId (same patch).
   */
  @type("uint16") coverId = 0;
  /** True this tick while locked in wilderness body-to-body combat (drives the combat icon). */
  @type("boolean") fighting = false;
  /**
   * Spawn protection: for a few seconds after (re)spawning the player can't be killed and
   * their own home soil won't kill intruders — so a fresh spawn landing on a passer-by
   * doesn't instantly kill them. The client blinks the avatar while this is true.
   */
  @type("boolean") immune = false;
  /** Grid cell index of this player's capital (the castle), placed on their spawn core. */
  @type("uint32") capCell = 0;
  /** Capital power points: gained from skirmish cells taken / sieging; shields their land. */
  @type("number") capPower = 0;
  /** Last input seq the server has applied — lets the owning client reconcile. */
  @type("uint32") lastSeq = 0;
}

export class RoomState extends Schema {
  @type("number") dayNightPhase = 0; // 0..1 canonical time-of-day (advanced in M4)
  @type({ map: Player }) players = new MapSchema<Player>();
}
