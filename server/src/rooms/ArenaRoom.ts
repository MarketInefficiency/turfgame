import { Room, type Client } from "colyseus";
import {
  CONFIG,
  DECAY_OWNER,
  GRID_SIZE,
  MSG,
  NEUTRAL,
  cellIndex,
  cellX,
  cellY,
  dayNightPhase,
  encodeFoliage,
  labelFoliageClusters,
  randomSkinColor,
  stepMovement,
  worldToCellX,
  worldToCellY,
  medalsForPower,
  MEMBER_SWORD_ID,
  type ArenaEvent,
  type DeathCause,
  type Died,
  type Eliminated,
  type InputPacket,
  type LobbyMember,
  type LobbyState,
  type MatchEnd,
  type PrivateOptions,
  type RankRow,
} from "@territory/shared";
import { Player, RoomState } from "./schema.js";
import { awardMedals, catalogAllows, catalogSkinColor, profileFromToken, type AccountProfile } from "../auth/supabase.js";
import { ServerGrid } from "../grid.js";
import { generateFoliage } from "../foliage.js";
import { BotBrain, type BotCosmetics, type BotOther, type Pt } from "../bots/brain.js";
import { rollBotCosmetics } from "../bots/cosmetics.js";
import { BOT_NAMES } from "../bots/names.js";

interface JoinOptions {
  name?: string;
  /** How the player entered: "random" | "specific" | "create" — drives AI population. */
  mode?: string;
  /** Supabase access token if the player is signed in (validated server-side in onAuth). */
  token?: string;
  /** Present (with settings) only when a member is creating a private arena. */
  private?: PrivateOptions;
}

/** A player waiting in a private-arena lobby: enough to spawn them when the host starts. */
interface LobbyEntry {
  name: string;
  color: string;
  acc: AccountProfile | null;
  ready: boolean;
}

/** Latest input received from a client; applied by the authoritative tick. */
interface StoredInput {
  aimX: number;
  aimY: number;
  drawing: boolean;
  seq: number;
  age: number;
}

/** In-progress claim line for a player (wilderness cells since leaving home). */
interface Trail {
  cells: Set<number>;
  last: number;
}

/**
 * One ArenaRoom instance = one shard/arena (architecture.md). M2 complete: an
 * authoritative ~20 Hz tick moves players (shared sim) AND resolves territory claims —
 * holding draw outside your land lays a trail; closing it back into your land captures
 * the enclosed neutral region. The grid syncs via a one-time snapshot + per-tick binary
 * deltas. Combat, enemy carving, and decay come in later milestones.
 */
export class ArenaRoom extends Room<RoomState> {
  maxClients: number = CONFIG.PLAYERS_PER_SHARD;

  private readonly grid = new ServerGrid();
  private readonly foliage = generateFoliage(); // static per-arena concealment terrain
  private readonly coverIds = labelFoliageClusters(this.foliage); // cell → cover patch id
  private readonly inputs = new Map<string, StoredInput>();
  private readonly trails = new Map<string, Trail>();
  private readonly ownerIds = new Map<string, number>();
  private readonly ownerToId = new Map<number, string>(); // reverse: ownerId → sessionId
  private readonly accountIds = new Map<string, string>(); // sessionId → Supabase user id (signed-in only)
  private readonly peakPower = new Map<string, number>(); // sessionId → highest army this life (for medals)
  private freeOwnerIds: number[] = [];
  private nextOwnerId = 1;

  // Dead/abandoned cells (owner = DECAY_OWNER) awaiting rapid neutralization.
  // Rubble awaiting crumble: each cell holds grey until its own `due` time, then dissolves. There
  // is no shared throughput cap, so empires that fall in the same tick crumble in parallel rather
  // than serially. `simClock` is a dt-accumulated clock (no wall-clock in the sim).
  private decayQueue: { idx: number; due: number }[] = [];
  private simClock = 0;

  // Spawn-protection expiry (room-clock seconds) per player; while active they can't kill
  // or be killed (fixes a fresh spawn landing on a passer-by and instakilling them).
  private readonly immuneUntil = new Map<string, number>();

  // Precise (fractional) capital power per player; Player.capPower is the floored display.
  private readonly capFloat = new Map<string, number>();

  // Fractional combat / overgrowth-decay army loss carried between ticks, per player.
  private readonly combatDebt = new Map<string, number>();
  private readonly overgrowthDebt = new Map<string, number>();
  private contigSweepAccum = 0;

  // Room clock for the canonical day/night phase.
  private elapsedSec = 0;

  // AI players that fill the arena. Keyed by their (bot_) id; the brain persists across
  // a bot's deaths so it "rejoins" with the same name/skin like a real returning player.
  private readonly bots = new Map<string, BotBrain>();
  private nameBag: string[] = [];
  private nextBotNum = 1;
  private coverPts: Pt[] = []; // foliage-patch centroids bots flee into to hide
  // CREATE-room trickle fill: add a bot every so often until the arena reaches the target
  // headcount, then stop (0 = not trickling).
  private botFillTarget = 0;
  private botFillAccum = 0;
  private botFillNext = 0;

  // Private arena state (all false/empty for normal public rooms).
  private isPrivate = false;
  private lobbyMode = false; // wait in a lobby for the host to start
  private deathmatch = false; // last one standing, no respawn
  private hostId = ""; // sessionId of the creator (the only one who can start it)
  private readonly lobby = new Map<string, LobbyEntry>(); // waiting players, by sessionId
  private matchStarted = false;
  private startCount = 0; // how many spawned when the death match began (for the end check)
  private readonly eliminated: RankRow[] = []; // death-match knockouts, in order of elimination

  async onCreate(options: JoinOptions): Promise<void> {
    this.state = new RoomState();

    this.onMessage(MSG.START_GAME, (client) => this.startMatch(client));
    this.onMessage(MSG.LOBBY_READY, (client) => {
      const entry = this.lobby.get(client.sessionId);
      if (!entry) return;
      entry.ready = !entry.ready;
      this.broadcastLobby();
    });

    this.onMessage(MSG.INPUT, (client, msg: InputPacket) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      this.inputs.set(client.sessionId, {
        aimX: Number(msg.aimX) || 0,
        aimY: Number(msg.aimY) || 0,
        drawing: Boolean(msg.drawing),
        seq: Number(msg.seq) || 0,
        age: 0,
      });
    });

    // Client signals it has registered handlers → send the one-time terrain snapshots.
    this.onMessage(MSG.READY, (client) => {
      client.send(MSG.FOLIAGE, encodeFoliage(this.foliage));
      client.send(MSG.GRID_SNAPSHOT, this.grid.snapshot());
    });

    this.setSimulationInterval((dtMs) => this.update(dtMs), 1000 / CONFIG.TICK_RATE);
    console.log(`[arena] created ${this.roomId}`);

    this.coverPts = this.computeCoverPts();
    this.initNameBag();

    // A member creating a private arena: members only (checked here so a crafted client can't host),
    // a custom player cap, no AI fill, and excluded from matchmaking so it's reachable by code only.
    const priv = options?.private;
    if (priv) {
      const host = await profileFromToken(options?.token);
      if (!host?.member) throw new Error("Only members can host a private arena.");
      this.isPrivate = true;
      this.lobbyMode = Boolean(priv.lobby);
      this.deathmatch = Boolean(priv.deathmatch);
      const cap = Math.max(2, Math.min(50, Math.floor(Number(priv.maxPlayers) || 2)));
      this.maxClients = cap;
      this.state.maxPlayers = cap;
      this.state.deathmatch = this.deathmatch;
      this.state.phase = this.lobbyMode ? "lobby" : "live";
      this.setPrivate(true);
      console.log(`[arena] ${this.roomId} PRIVATE cap=${cap} lobby=${this.lobbyMode} deathmatch=${this.deathmatch}`);
      return; // no bots in a private arena
    }
    this.state.maxPlayers = CONFIG.PLAYERS_PER_SHARD;

    // Populate the arena with AI players according to HOW it was created. A room is only
    // created via "random" (joinOrCreate found no open room) or "create" (new room);
    // "specific" joins never create, so they reach an already-populated room and add none.
    if (options?.mode === "create") {
      // New arena: trickle players in over time until it holds 15–20.
      const span = CONFIG.BOT_CREATE_FILL_MAX - CONFIG.BOT_CREATE_FILL_MIN + 1;
      this.botFillTarget = CONFIG.BOT_CREATE_FILL_MIN + Math.floor(Math.random() * span);
      this.botFillNext = 0.6; // first arrival shortly after creation
      console.log(`[arena] ${this.roomId} create-mode: trickling up to ${this.botFillTarget} players`);
    } else {
      // Random/new arena that didn't exist yet: make it look already-established by
      // dropping in bots that ALREADY OWN TERRITORY.
      const span = CONFIG.BOT_COUNT_MAX - CONFIG.BOT_COUNT_MIN + 1;
      const n = CONFIG.BOT_COUNT_MIN + Math.floor(Math.random() * span);
      for (let i = 0; i < n; i++) this.addBot(true);
      console.log(`[arena] ${this.roomId} random-mode: spawned ${n} established AI players`);
    }
  }

  /** Shuffle a private copy of the name pool so this arena's handles don't repeat. */
  private initNameBag(): void {
    this.nameBag = [...BOT_NAMES];
    for (let i = this.nameBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.nameBag[i], this.nameBag[j]] = [this.nameBag[j]!, this.nameBag[i]!];
    }
  }

  /** Centroid (world coords) of each foliage patch — where bots run to hide. */
  private computeCoverPts(): Pt[] {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (let i = 0; i < this.coverIds.length; i++) {
      const pid = this.coverIds[i]!;
      if (pid <= 0) continue;
      const s = sums.get(pid) ?? { x: 0, y: 0, n: 0 };
      s.x += cellX(i);
      s.y += cellY(i);
      s.n++;
      sums.set(pid, s);
    }
    const S = CONFIG.GRID_CELL;
    const pts: Pt[] = [];
    for (const s of sums.values()) pts.push({ x: (s.x / s.n + 0.5) * S, y: (s.y / s.n + 0.5) * S });
    return pts;
  }

  /**
   * Validate the player's account before they join. Signed-in players present a Supabase token;
   * we verify it and attach their profile to client.auth. Guests (no/invalid token) get an empty
   * object — onAuth must return something truthy or Colyseus rejects the join, and we never want
   * to turn a guest away.
   */
  async onAuth(_client: Client, options: JoinOptions): Promise<AccountProfile | Record<string, never>> {
    const profile = await profileFromToken(options?.token);
    return profile ?? {};
  }

  onJoin(client: Client, options: JoinOptions): void {
    // A signed-in player with a claimed username uses it (server-trusted); otherwise the typed
    // guest name, sanitized. client.auth was set by onAuth above.
    const raw = client.auth as AccountProfile | Record<string, never> | undefined;
    const acc = raw && "username" in raw ? (raw as AccountProfile) : null;
    // The in-game name is whatever the player typed on the start screen, signed in or not — they can
    // change it freely on any join. (sanitizeName falls back to a guest handle if it's empty.)
    const name = sanitizeName(options?.name);
    const entry: LobbyEntry = { name, color: catalogSkinColor(this.resolveSkin(acc)) ?? randomSkinColor(), acc, ready: false };

    // The first player into a private arena is its host (the only one who can start it).
    if (this.isPrivate && !this.hostId) {
      this.hostId = client.sessionId;
      this.state.hostId = client.sessionId;
    }

    // Lobby mode: collect waiting players and show everyone the roster — they don't spawn until the
    // host starts the match.
    if (this.isPrivate && this.lobbyMode && this.state.phase === "lobby") {
      this.lobby.set(client.sessionId, entry);
      this.broadcastLobby();
      return;
    }

    // A late arrival into a death match that's already running just spectates (no respawn means no
    // jumping into a fight in progress); the match-end ranking still reaches them.
    if (this.isPrivate && this.deathmatch && this.matchStarted && this.state.phase === "live") {
      client.send(MSG.ELIMINATED, { place: this.state.players.size + 1, total: this.startCount } satisfies Eliminated);
      return;
    }
    if (this.state.phase === "ended") {
      client.send(MSG.MATCH_END, { rankings: this.eliminated } satisfies MatchEnd);
      return;
    }

    this.spawnFromEntry(client.sessionId, entry);
    if (this.isPrivate && this.deathmatch && !this.lobbyMode) this.matchStarted = true; // immediate DM counts arrivals
    if (this.isPrivate && this.deathmatch) this.startCount = Math.max(this.startCount, this.state.players.size);
    console.log(`[arena] join ${client.sessionId} as "${name}" (${this.clients.length} humans, ${this.state.players.size} total)`);
  }

  /** The skin id an account would equip (default for guests), gated to owned items. */
  private resolveSkin(acc: AccountProfile | null): string {
    if (!acc) return "default";
    const owned = new Set(acc.owned);
    return catalogAllows("skin", acc.equippedSkin, owned) ? acc.equippedSkin : "default";
  }

  /** Spawn a (deferred or immediate) player with their account's owned cosmetics applied. */
  private spawnFromEntry(sessionId: string, entry: LobbyEntry): void {
    const acc = entry.acc;
    const owned = new Set(acc?.owned ?? []);
    const allow = (type: string, id: string | undefined): string =>
      acc && id && catalogAllows(type, id, owned) ? id : "default";
    const p = this.spawnEntity(sessionId, entry.name, entry.color);
    p.skinId = allow("skin", acc?.equippedSkin);
    p.capSkin = allow("capital", acc?.equippedCapital);
    // The members-only sword is never "owned" — it's allowed only while the account is an active member.
    p.swordSkin =
      acc?.equippedSword === MEMBER_SWORD_ID ? (acc?.member ? MEMBER_SWORD_ID : "default") : allow("sword", acc?.equippedSword);
    p.cloakSkin = allow("cloak", acc?.equippedCloak);
    p.hatSkin = allow("hat", acc?.equippedHat);
    p.hairSkin = allow("hair", acc?.equippedHair);
    p.shirtSkin = allow("shirt", acc?.equippedShirt);
    if (acc?.userId) this.accountIds.set(sessionId, acc.userId); // earns medals on defeat
    this.peakPower.set(sessionId, p.army);
    this.enforcePlayerCap(); // public rooms displace a bot; private rooms have none to evict
    this.announceJoin(p.name, p.color);
  }

  /** Host-only: spawn everyone in the lobby and flip the arena live. */
  private startMatch(client: Client): void {
    if (client.sessionId !== this.hostId || this.state.phase !== "lobby") return;
    for (const [sid, entry] of this.lobby) this.spawnFromEntry(sid, entry);
    this.startCount = this.lobby.size;
    this.lobby.clear();
    this.matchStarted = true;
    this.state.phase = "live";
    console.log(`[arena] ${this.roomId} match started with ${this.startCount} players`);
  }

  /** Push the current lobby roster (with the host flagged) to everyone waiting. */
  private broadcastLobby(): void {
    const players: LobbyMember[] = [];
    for (const [sid, entry] of this.lobby) {
      players.push({ name: entry.name, color: entry.color, host: sid === this.hostId, ready: entry.ready });
    }
    this.broadcast(MSG.LOBBY, { players } satisfies LobbyState);
  }

  /** Evict AI players (smallest first) until the arena is back within PLAYERS_PER_SHARD. */
  private enforcePlayerCap(): void {
    while (this.state.players.size > CONFIG.PLAYERS_PER_SHARD) {
      let victim: string | undefined;
      let smallest = Infinity;
      for (const id of this.bots.keys()) {
        const bp = this.state.players.get(id);
        if (!bp || !bp.alive) continue; // dead bots aren't in the player count
        if (bp.army < smallest) { smallest = bp.army; victim = id; }
      }
      if (victim === undefined) break; // no bot left to displace
      this.removeBot(victim);
    }
  }

  /** Permanently remove a bot (its land self-heals); it will not respawn. */
  private removeBot(id: string): void {
    const ownerId = this.ownerIds.get(id);
    if (ownerId !== undefined) {
      this.startDecay(ownerId);
      this.freeOwnerIds.push(ownerId);
      this.ownerToId.delete(ownerId);
    }
    this.state.players.delete(id);
    this.inputs.delete(id);
    this.trails.delete(id);
    this.ownerIds.delete(id);
    this.combatDebt.delete(id);
    this.overgrowthDebt.delete(id);
    this.immuneUntil.delete(id);
    this.capFloat.delete(id);
    this.bots.delete(id); // drop the brain so it never rejoins
  }

  /** Broadcast a "player joined" event for the news feed. */
  private announceJoin(name: string, color: string): void {
    this.broadcast(MSG.EVENT, { kind: "join", a: { name, color } } satisfies ArenaEvent);
  }

  /**
   * Create (or recreate, on respawn) a live player entity with a fresh starter
   * territory. Shared by human joins and AI bots so they are set up identically — the
   * only difference is who supplies the per-tick input.
   */
  private spawnEntity(id: string, name: string, color: string, turfCells = 0, protect = true): Player {
    const ownerId = this.allocOwnerId();

    // turfCells > 0 → an "established" bot: grow an ORGANIC blob of roughly that many cells
    // (never a perfect circle — that's a dead giveaway). Otherwise seed the tiny starter
    // disc every fresh player begins with.
    let scx: number;
    let scy: number;
    let spawnX: number;
    let spawnY: number;
    if (turfCells > 0) {
      const boundR = Math.max(CONFIG.START_TERRITORY_RADIUS, Math.ceil(Math.sqrt(turfCells / Math.PI) * 1.7));
      const spawn = this.findSpawn(boundR);
      scx = worldToCellX(spawn.x);
      scy = worldToCellY(spawn.y);
      this.grid.seedBlob(ownerId, scx, scy, boundR, turfCells);
      spawnX = spawn.x;
      spawnY = spawn.y;
    } else {
      const spawn = this.findSpawn();
      scx = worldToCellX(spawn.x);
      scy = worldToCellY(spawn.y);
      this.grid.seedDisc(ownerId, scx, scy, CONFIG.START_TERRITORY_RADIUS);
      spawnX = spawn.x;
      spawnY = spawn.y;
    }
    const coreCell = cellIndex(scx, scy);
    this.grid.setCore(ownerId, coreCell);

    const p = new Player();
    p.id = id;
    p.name = name;
    p.color = color;
    p.ownerId = ownerId;
    p.x = spawnX;
    p.y = spawnY;
    p.army = this.grid.count(ownerId);
    p.stateTag = "HOME";
    p.alive = true;
    // Spawn protection for players arriving into a LIVE arena (your join, bot respawns,
    // trickle arrivals). The pre-existing "established" population skips it so the arena
    // doesn't blink en masse the instant you join.
    p.immune = protect;
    if (protect) this.immuneUntil.set(id, this.elapsedSec + CONFIG.SPAWN_IMMUNITY_SEC);
    else this.immuneUntil.delete(id);
    p.capCell = coreCell; // the capital (castle) sits on the spawn core
    p.capPower = 0;
    this.capFloat.set(id, 0);
    this.state.players.set(id, p);
    this.ownerIds.set(id, ownerId);
    this.ownerToId.set(ownerId, id);
    return p;
  }

  // --- AI players ---------------------------------------------------------------

  /**
   * Add one AI player. `established` gives it a randomly-sized chunk of pre-grown turf
   * (for a random-joined arena that should look already-played-in); otherwise it spawns
   * small and grows like a fresh arrival.
   */
  private addBot(established = false, announce = false): void {
    const id = `bot_${this.nextBotNum++}`;
    const name = this.nameBag.pop() ?? `guest${this.nextBotNum}`;
    const color = randomSkinColor();
    const brain = new BotBrain(id, name, color);
    brain.cosmetics = rollBotCosmetics(); // ~20% of bots show off real cosmetics; null otherwise
    this.bots.set(id, brain);
    const turfCells = established
      ? CONFIG.BOT_ESTABLISHED_ARMY_MIN +
        Math.floor(Math.random() * (CONFIG.BOT_ESTABLISHED_ARMY_MAX - CONFIG.BOT_ESTABLISHED_ARMY_MIN + 1))
      : 0; // 0 → tiny starter disc, like a fresh arrival
    // Established (creation-time) bots are the pre-existing population → no spawn blink;
    // trickle arrivals are new, so they get protection.
    const p = this.spawnEntity(id, name, color, turfCells, !established);
    applyBotCosmetics(p, brain.cosmetics);
    if (announce) this.announceJoin(name, color); // trickle arrivals show up in the feed
  }

  /** CREATE-mode arenas trickle bots in over time until the headcount target is met. */
  private trickleBots(dt: number): void {
    if (this.botFillTarget <= 0) return;
    if (this.state.players.size >= this.botFillTarget) {
      this.botFillTarget = 0; // filled — respawns keep it populated from here
      return;
    }
    this.botFillAccum += dt;
    if (this.botFillAccum < this.botFillNext) return;
    this.botFillAccum = 0;
    this.botFillNext =
      CONFIG.BOT_CREATE_INTERVAL_MIN +
      Math.random() * (CONFIG.BOT_CREATE_INTERVAL_MAX - CONFIG.BOT_CREATE_INTERVAL_MIN);
    this.addBot(false, true); // fresh arrival, announced in the feed
  }

  /** Drive every alive bot: compute a synthetic input and feed it to the normal sim. */
  private updateBots(dt: number): void {
    if (this.bots.size === 0) return;

    // Shared perception snapshot of all alive players (bots filter themselves by ownerId).
    const others: BotOther[] = [];
    this.state.players.forEach((p) => {
      if (p.alive) {
        others.push({
          x: p.x, y: p.y, army: p.army, ownerId: p.ownerId,
          capCell: p.capCell, capPower: p.capPower, immune: p.immune, coverId: p.coverId,
        });
      }
    });

    // The current top-3 by army — shared gang-up targets, so bots converge on the same giants.
    const topIds = new Set<number>();
    const ranked = [...others].sort((a, b) => b.army - a.army);
    for (let i = 0; i < Math.min(3, ranked.length); i++) topIds.add(ranked[i]!.ownerId);

    for (const [id, brain] of this.bots) {
      if (brain.dead) {
        brain.respawnIn -= dt;
        if (brain.respawnIn <= 0) {
          if (this.state.players.size >= CONFIG.PLAYERS_PER_SHARD) {
            brain.respawnIn = 1; // arena is full (mostly humans) — wait for a free slot
          } else {
            brain.dead = false;
            brain.reset();
            // "Rejoins" small with the same name and the same look (a returning player keeps their kit).
            applyBotCosmetics(this.spawnEntity(brain.id, brain.name, brain.color), brain.cosmetics);
          }
        }
        continue;
      }
      const p = this.state.players.get(id);
      const ownerId = this.ownerIds.get(id);
      if (!p || ownerId === undefined || !p.alive) continue;
      const out = brain.think(
        {
          self: { x: p.x, y: p.y, army: p.army, ownerId, stateTag: p.stateTag, capPower: p.capPower, coverId: p.coverId },
          others,
          cells: this.grid.cells,
          topIds,
          coverPts: this.coverPts,
        },
        dt,
      );
      this.inputs.set(id, { aimX: out.aimX, aimY: out.aimY, drawing: out.drawing, seq: 0, age: 0 });
    }
  }

  onLeave(client: Client): void {
    // A player waiting in the lobby just drops out of the roster (they never spawned).
    if (this.lobby.delete(client.sessionId)) {
      if (client.sessionId === this.hostId) this.reassignHost();
      this.broadcastLobby();
      console.log(`[arena] lobby leave ${client.sessionId} (${this.lobby.size} waiting)`);
      return;
    }

    // If the player was already killed, their land is decaying and id freed already.
    const ownerId = this.ownerIds.get(client.sessionId);
    if (ownerId !== undefined) {
      this.startDecay(ownerId); // self-healing: abandoned land rapidly decays to neutral
      this.freeOwnerIds.push(ownerId);
      this.ownerToId.delete(ownerId);
    }
    const wasPlaying = this.state.players.has(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.trails.delete(client.sessionId);
    this.ownerIds.delete(client.sessionId);
    this.combatDebt.delete(client.sessionId);
    this.overgrowthDebt.delete(client.sessionId);
    this.immuneUntil.delete(client.sessionId);
    this.capFloat.delete(client.sessionId);
    this.accountIds.delete(client.sessionId);
    this.peakPower.delete(client.sessionId);
    // A live death-match player quitting counts them out; the match can end if one (or none) remain.
    if (wasPlaying && this.deathmatch && this.matchStarted && this.state.phase === "live" && this.startCount >= 2 && this.state.players.size <= 1) {
      this.endMatch();
    }
    console.log(`[arena] leave ${client.sessionId} (${this.clients.length}/${this.maxClients})`);
  }

  /** Hand a private arena's host role to whoever's next in the lobby (else leave it empty). */
  private reassignHost(): void {
    const next = this.lobby.keys().next().value as string | undefined;
    this.hostId = next ?? "";
    this.state.hostId = this.hostId;
  }

  /** Kill a player: their land starts decaying and they're sent back to the start screen. */
  private killPlayer(id: string, killer?: { ownerId: number; kind: ArenaEvent["kind"] }): void {
    const p = this.state.players.get(id);
    if (!p || !p.alive) return;

    // Announce the kill to the news feed (both players still exist here for their colors).
    let killerName: string | undefined;
    let killerSession: string | undefined;
    if (killer) {
      const killerId = this.ownerToId.get(killer.ownerId);
      const kp = killerId !== undefined ? this.state.players.get(killerId) : undefined;
      if (kp && killerId !== id) {
        killerName = kp.name;
        killerSession = killerId;
        this.broadcast(MSG.EVENT, {
          kind: killer.kind,
          a: { name: kp.name, color: kp.color },
          b: { name: p.name, color: p.color },
        } satisfies ArenaEvent);
      }
    }

    p.alive = false;

    const ownerId = this.ownerIds.get(id);
    if (ownerId !== undefined) {
      this.startDecay(ownerId);
      this.freeOwnerIds.push(ownerId);
      this.ownerToId.delete(ownerId);
    }
    this.inputs.delete(id);
    this.trails.delete(id);
    this.ownerIds.delete(id);
    this.combatDebt.delete(id);
    this.overgrowthDebt.delete(id);
    this.immuneUntil.delete(id);
    this.capFloat.delete(id);

    // Award medals for the run, scaled to the peak power reached (signed-in players only).
    const peak = this.peakPower.get(id) ?? 0;
    this.peakPower.delete(id);
    const userId = this.accountIds.get(id);
    const medals = userId ? medalsForPower(peak) : 0;
    if (userId && medals > 0) void awardMedals(userId, medals, "earn");

    if (this.deathmatch && this.matchStarted) {
      // Last one standing: record the knockout, tell them to spectate (no DIED, so the client shows
      // the spectator view instead of the respawn screen), and end the match when one (or none) remain.
      const place = Math.max(1, this.startCount - this.eliminated.length);
      this.eliminated.push({ place, name: p.name, color: p.color, peak });
      this.clients.find((c) => c.sessionId === id)?.send(MSG.ELIMINATED, { place, total: this.startCount, byId: killerSession } satisfies Eliminated);
      this.state.players.delete(id);
      if (this.startCount >= 2 && this.state.players.size <= 1) this.endMatch();
      console.log(`[arena] eliminated ${id} (place ${place})`);
      return;
    }

    // Tell the (human) victim how they fell + what they earned, so the client can show a defeat
    // banner before the start screen returns. killHome = killed on enemy soil, killWild = lost a
    // wild skirmish, anything else (e.g. decayed to nothing) = a plain wipe.
    const cause: DeathCause = killer?.kind === "killHome" ? "home" : killer?.kind === "killWild" ? "wild" : "wiped";
    this.clients.find((c) => c.sessionId === id)?.send(MSG.DIED, { cause, medals, peak, by: killerName } satisfies Died);
    this.state.players.delete(id);

    // A downed bot doesn't disappear — it waits a human-like beat then "rejoins" small
    // (handled in updateBots), keeping the arena population steady.
    const brain = this.bots.get(id);
    if (brain) {
      brain.dead = true;
      brain.respawnIn = CONFIG.BOT_RESPAWN_MIN + Math.random() * (CONFIG.BOT_RESPAWN_MAX - CONFIG.BOT_RESPAWN_MIN);
    }
    console.log(`[arena] death ${id}`);
  }

  /** Finish a death match: rank the survivor first, then knockouts by reverse elimination, and
   *  broadcast the standings. The arena goes "ended" and disposes once everyone leaves. */
  private endMatch(): void {
    if (this.state.phase === "ended") return;
    const survivor = this.state.players.values().next().value as Player | undefined;
    const rankings: RankRow[] = [];
    if (survivor) {
      const peak = Math.max(survivor.army, this.peakPower.get(survivor.id) ?? 0);
      rankings.push({ place: 1, name: survivor.name, color: survivor.color, peak });
    }
    rankings.push(...this.eliminated);
    rankings.sort((a, b) => a.place - b.place);
    this.state.phase = "ended";
    this.eliminated.length = 0;
    this.eliminated.push(...rankings); // keep the final table around for anyone who joins after
    this.broadcast(MSG.MATCH_END, { rankings } satisfies MatchEnd);
    console.log(`[arena] ${this.roomId} match ended, winner ${survivor?.name ?? "(none)"}`);
  }

  /** Turn an owner's whole kingdom to rubble (grey); the tick drains it into the decay queue. */
  private startDecay(ownerId: number): void {
    this.grid.recolor(ownerId, DECAY_OWNER);
  }

  /** Close a claim loop: inherit the enclosed region, then resolve victims' contiguity. */
  private closeLoop(ownerId: number, trail: Set<number>): void {
    const { victims, blocked } = this.grid.capture(ownerId, trail, this.poweredCapitals());
    if (blocked.size > 0) this.alertCapBlocked(ownerId, "claim"); // hit a powered capital
    // A loop-severed piece is inherited by the cutter if it borders them, else neutralized.
    for (const v of victims) this.grid.enforceContiguity(v, ownerId);
    this.syncArmy(ownerId);
    for (const v of victims) this.resolveVictim(v, ownerId);
  }

  /** Sever loop (closed in the wild): cut the enclosed enemy land to neutral; cutter gains nothing. */
  private severLoop(cutterId: number, trail: Set<number>): void {
    const { victims, blocked } = this.grid.severEnclosed(cutterId, trail, this.poweredCapitals());
    if (blocked.size > 0) this.alertCapBlocked(cutterId, "sever");
    for (const v of victims) this.grid.enforceContiguity(v); // remaining orphans → rubble
    for (const v of victims) this.resolveVictim(v, cutterId);
  }

  /**
   * After a victim lost cells to a loop, sync their army and eliminate them if they were
   * wiped out OR lost their capital cell (capturing a 0-power capital ends that player).
   */
  private resolveVictim(victimOwnerId: number, attackerOwnerId: number): void {
    this.syncArmy(victimOwnerId);
    const sid = this.ownerToId.get(victimOwnerId);
    if (sid === undefined) return;
    const p = this.state.players.get(sid);
    if (!p || !p.alive) return;
    const lostCapital = this.grid.cells[p.capCell] !== victimOwnerId;
    if (this.grid.count(victimOwnerId) === 0 || lostCapital) {
      this.killPlayer(sid, { ownerId: attackerOwnerId, kind: "conquer" });
    }
  }



  /**
   * Periodically re-assert the contiguity invariant for every kingdom, cleaning up any
   * scraps that frontier shedding (combat/decay) may have disconnected — they self-heal
   * to neutral. Keeps the strict per-cell work off the hot path (game-spec §7).
   */
  private contiguitySweep(dt: number): void {
    this.contigSweepAccum += dt;
    if (this.contigSweepAccum < CONFIG.CONTIG_SWEEP_SEC) return;
    this.contigSweepAccum = 0;
    this.state.players.forEach((p, id) => {
      const ownerId = this.ownerIds.get(id);
      if (ownerId === undefined || !p.alive) return;
      this.grid.enforceContiguity(ownerId); // no inheritor → orphans neutral
      p.army = this.grid.count(ownerId);
    });
  }

  /** Add (or remove, if negative) capital power for a player; keeps Player.capPower floored. */
  private addCapPower(id: string, delta: number): void {
    let v = (this.capFloat.get(id) ?? 0) + delta;
    if (v < 0) v = 0;
    this.capFloat.set(id, v);
    const p = this.state.players.get(id);
    if (p) p.capPower = Math.floor(v);
  }

  /** Map of every powered capital's cell → its owner id (for loop-capture shielding). */
  private poweredCapitals(): Map<number, number> {
    const m = new Map<number, number>();
    this.state.players.forEach((p) => {
      if (p.alive && p.capPower > 0) m.set(p.capCell, p.ownerId);
    });
    return m;
  }

  /** Tell a (human) attacker their loop couldn't take a still-powered enemy capital. */
  private alertCapBlocked(attackerOwnerId: number, context: "claim" | "sever"): void {
    const sid = this.ownerToId.get(attackerOwnerId);
    if (sid === undefined) return;
    this.clients.find((c) => c.sessionId === sid)?.send(MSG.CAP_BLOCKED, { context });
  }

  /** Push an owner's authoritative cell count into their Player.army. */
  private syncArmy(ownerId: number): void {
    const sid = this.ownerToId.get(ownerId);
    if (sid === undefined) return;
    const p = this.state.players.get(sid);
    if (p) p.army = this.grid.count(ownerId);
  }

  onDispose(): void {
    console.log(`[arena] disposed ${this.roomId}`);
  }

  /** Authoritative simulation step: movement, then claim resolution, then grid deltas. */
  private update(dtMs: number): void {
    const dt = dtMs / 1000;

    // Advance the room-synced day/night phase (clients derive colors from it).
    this.elapsedSec += dt;
    this.state.dayNightPhase = dayNightPhase(this.elapsedSec);

    // AI players: trickle in new arrivals (create-mode), then drive every bot's input.
    this.trickleBots(dt);
    this.updateBots(dt);

    this.state.players.forEach((p, id) => {
      const ownerId = this.ownerIds.get(id);
      if (ownerId === undefined) return;

      // Spawn protection ticks down on the room clock.
      p.immune = (this.immuneUntil.get(id) ?? 0) > this.elapsedSec;

      // --- Movement (stale input halts the avatar) ---
      const inp = this.inputs.get(id);
      if (inp) {
        p.lastSeq = inp.seq;
        inp.age += dt;
        if (inp.age > CONFIG.INPUT_STALE_SEC) {
          p.drawing = false;
        } else {
          p.drawing = inp.drawing;
          stepMovement(p, inp, dt);
        }
      }

      // --- Claim resolution ---
      const curIdx = cellIndex(worldToCellX(p.x), worldToCellY(p.y));
      const atHome = this.grid.cells[curIdx] === ownerId;
      p.stateTag = atHome ? "HOME" : "WILD";
      p.coverId = this.coverIds[curIdx]!; // 0 = open ground; >0 = which foliage patch

      const trail = this.trails.get(id);
      if (atHome) {
        // Returned home: close the loop (lasso) — capture the enclosed region.
        if (trail && trail.cells.size > 0) this.closeLoop(ownerId, trail.cells);
        this.trails.delete(id);
      } else if (p.drawing) {
        // In the wild with the button held: extend the trail. If it closes on ITSELF,
        // that's a sever loop — cut the enclosed enemy land to neutral.
        if (this.extendTrail(id, curIdx)) {
          const closed = this.trails.get(id);
          if (closed) this.severLoop(ownerId, closed.cells);
          this.trails.delete(id);
        }
      } else if (trail) {
        // Released without closing → nothing. Territory only changes via a closed loop
        // that encloses an area; a bare line neither claims nor severs.
        this.trails.delete(id);
      }

      // Keep army authoritative, and apply accelerating overgrowth decay above the
      // threshold — sheds the frontier furthest from the avatar (game-spec §9).
      p.army = this.grid.count(ownerId);
      if (p.army > CONFIG.DECAY_THRESHOLD) {
        const rate = CONFIG.DECAY_C * Math.pow(p.army - CONFIG.DECAY_THRESHOLD, CONFIG.DECAY_EXP);
        const debt = (this.overgrowthDebt.get(id) ?? 0) + rate * dt;
        const n = Math.floor(debt);
        this.overgrowthDebt.set(id, debt - n);
        if (n > 0) {
          this.grid.shed(ownerId, n, p.x, p.y);
          p.army = this.grid.count(ownerId);
        }
      }

      // Capital power is a soft-ceilinged resource too: above the threshold it bleeds off
      // at an accelerating rate, so a hoarded capital can't grow without bound.
      if (p.capPower > CONFIG.CAP_DECAY_THRESHOLD) {
        const rate = CONFIG.CAP_DECAY_C * Math.pow(p.capPower - CONFIG.CAP_DECAY_THRESHOLD, CONFIG.CAP_DECAY_EXP);
        this.addCapPower(id, -rate * dt);
      }

      // Track the highest army this life — medals on defeat scale to it.
      if (p.army > (this.peakPower.get(id) ?? 0)) this.peakPower.set(id, p.army);
    });

    this.resolveInteractions(dt);
    this.contiguitySweep(dt);
    // Everything that just became rubble this tick (shed, sever, orphaned scraps, deaths) joins
    // the decay queue. Each cell gets its own due time: a base dwell plus a deterministic per-cell
    // jitter (hashed off the cell index) so a patch disintegrates progressively instead of poofing.
    const base = this.simClock + CONFIG.CRUMBLE_DWELL;
    for (const idx of this.grid.takeFreshDecay()) {
      const jitter = ((idx * 0.6180339887) % 1) * CONFIG.CRUMBLE_WAVE;
      this.decayQueue.push({ idx, due: base + jitter });
    }
    this.decayStep(dt);

    const delta = this.grid.flushDelta();
    if (delta) this.broadcast(MSG.GRID_DELTA, delta);
  }

  /**
   * Body contacts (game-spec §8) + claim-line collisions (§7). On the contact cell's
   * owner's home, the intruder dies instantly; elsewhere both bodies drain frontier
   * cells at DRAIN_RATE and whoever hits zero dies. A body crossing another player's
   * in-progress claim line voids that claim (non-lethal).
   */
  private resolveInteractions(dt: number): void {
    interface Actor {
      id: string;
      p: Player;
      ownerId: number;
      cell: number;
    }
    const list: Actor[] = [];
    this.state.players.forEach((p, id) => {
      const ownerId = this.ownerIds.get(id);
      if (!p.alive || ownerId === undefined) return;
      list.push({ id, p, ownerId, cell: cellIndex(worldToCellX(p.x), worldToCellY(p.y)) });
    });

    // Who is overlapping which still-powered enemy capital this tick → besieging[id] = set
    // of capital-owner ids. Drives both the siege drain and co-besieger immunity (two
    // players sieging the same capital don't fight each other while it has power).
    const cs2 = CONFIG.COMBAT_CONTACT_DIST * CONFIG.COMBAT_CONTACT_DIST;
    const S = CONFIG.GRID_CELL;
    const powered: { ownerId: number; x: number; y: number }[] = [];
    this.state.players.forEach((p) => {
      if (p.alive && p.capPower > 0) {
        powered.push({ ownerId: p.ownerId, x: (cellX(p.capCell) + 0.5) * S, y: (cellY(p.capCell) + 0.5) * S });
      }
    });
    const besieging = new Map<string, Set<number>>();
    for (const a of list) {
      for (const cap of powered) {
        if (cap.ownerId === a.ownerId) continue;
        const dx = a.p.x - cap.x;
        const dy = a.p.y - cap.y;
        if (dx * dx + dy * dy <= cs2) {
          let set = besieging.get(a.id);
          if (!set) { set = new Set(); besieging.set(a.id, set); }
          set.add(cap.ownerId);
        }
      }
    }
    const coSieging = (id1: string, id2: string): boolean => {
      const s1 = besieging.get(id1);
      const s2 = besieging.get(id2);
      if (!s1 || !s2) return false;
      for (const x of s1) if (s2.has(x)) return true;
      return false;
    };

    // Claim-line void: a body on another player's trail cancels that claim.
    const voided = new Set<string>();
    for (const a of list) {
      for (const [drawerId, trail] of this.trails) {
        if (drawerId !== a.id && !voided.has(drawerId) && trail.cells.has(a.cell)) {
          voided.add(drawerId);
        }
      }
    }
    for (const drawerId of voided) {
      this.trails.delete(drawerId);
      this.clients.find((c) => c.sessionId === drawerId)?.send(MSG.CLAIM_VOIDED);
    }

    // Body-to-body contact.
    const contact2 = CONFIG.COMBAT_CONTACT_DIST * CONFIG.COMBAT_CONTACT_DIST;
    const deaths = new Set<string>();
    const draining = new Set<string>();
    // Who to credit for each death, for the news feed: victim id → killer owner + kind.
    const killCredit = new Map<string, { ownerId: number; kind: ArenaEvent["kind"]; reward?: number }>();
    const drainFoe = new Map<string, number>(); // id → an opponent's ownerId they're draining with
    const foes = new Map<string, Set<string>>(); // id → everyone currently draining them (for fair capital credit)
    const addFoe = (id: string, foeId: string): void => {
      let s = foes.get(id);
      if (!s) { s = new Set(); foes.set(id, s); }
      s.add(foeId);
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        // Spawn-protected players are intangible in combat: they can't kill (their home
        // doesn't instakill a passer-by) and can't be killed/drained.
        if (a.p.immune || b.p.immune) continue;
        const dx = a.p.x - b.p.x;
        const dy = a.p.y - b.p.y;
        if (dx * dx + dy * dy > contact2) continue;
        // Allies of convenience: two players sieging the SAME powered capital can't hurt
        // each other until it falls (then normal skirmish resumes next tick).
        if (coSieging(a.id, b.id)) continue;
        const midOwner =
          this.grid.cells[cellIndex(worldToCellX((a.p.x + b.p.x) / 2), worldToCellY((a.p.y + b.p.y) / 2))];
        if (midOwner === a.ownerId) {
          deaths.add(b.id); // B intruded on A's home
          killCredit.set(b.id, { ownerId: a.ownerId, kind: "killHome", reward: b.p.army });
        } else if (midOwner === b.ownerId) {
          deaths.add(a.id); // A intruded on B's home
          killCredit.set(a.id, { ownerId: b.ownerId, kind: "killHome", reward: a.p.army });
        } else {
          draining.add(a.id); // wilderness / neutral / third-party land
          draining.add(b.id);
          drainFoe.set(a.id, b.ownerId);
          drainFoe.set(b.id, a.ownerId);
          addFoe(a.id, b.id); // track every foe so capital credit splits fairly
          addFoe(b.id, a.id);
        }
      }
    }

    // Record how many foes are draining each player (drives the client's ganged sword-spin effect).
    for (const a of list) a.p.attackers = foes.get(a.id)?.size ?? 0;

    // Apply wilderness drain by shedding frontier cells; zero army ⇒ death.
    const dropPerSec = CONFIG.DRAIN_RATE * dt;
    for (const a of list) {
      if (!draining.has(a.id) || deaths.has(a.id)) continue;
      const debt = (this.combatDebt.get(a.id) ?? 0) + dropPerSec;
      const n = Math.floor(debt);
      this.combatDebt.set(a.id, debt - n);
      if (n > 0) {
        this.grid.shed(a.ownerId, n, a.p.x, a.p.y);
        // The cells just taken off `a` become capital power for whoever is fighting a,
        // split evenly among them (accurate even in a multi-player brawl).
        const fs = foes.get(a.id);
        if (fs && fs.size > 0) {
          const share = n / fs.size;
          for (const fid of fs) this.addCapPower(fid, share);
        }
        a.p.army = this.grid.count(a.ownerId);
        if (a.p.army <= 0) {
          deaths.add(a.id);
          const foe = drainFoe.get(a.id);
          if (foe !== undefined) killCredit.set(a.id, { ownerId: foe, kind: "killWild" });
        }
      }
    }

    // Flag who's actively in wilderness combat this tick (drives the combat icon).
    for (const a of list) a.p.fighting = draining.has(a.id);

    for (const id of deaths) this.killPlayer(id, killCredit.get(id));

    // A home-soil instakill hands the attacker's points to the defender's capital (the
    // "points taken" all at once), just like cells taken in a wilderness skirmish.
    for (const cr of killCredit.values()) {
      if (cr.kind !== "killHome" || !cr.reward || cr.reward <= 0) continue;
      const defId = this.ownerToId.get(cr.ownerId);
      if (defId !== undefined) this.addCapPower(defId, cr.reward);
    }

    // Capital sieges: overlapping an enemy capital drains its power into yours, with NO
    // cost to either side's army. Uses the besieging set computed above; skips besiegers
    // who died this tick. The defender's own presence still instakills via the loop above.
    for (const [bid, caps] of besieging) {
      const bp = this.state.players.get(bid);
      if (!bp || !bp.alive) continue;
      for (const capOwner of caps) {
        const targetId = this.ownerToId.get(capOwner);
        if (targetId === undefined) continue;
        const avail = this.capFloat.get(targetId) ?? 0;
        if (avail <= 0) continue;
        const amt = Math.min(CONFIG.SIEGE_RATE * dt, avail);
        this.addCapPower(targetId, -amt);
        this.addCapPower(bid, amt);
      }
    }
  }

  /** Crumble rubble to neutral. Each cell dissolves the moment its own `due` passes — no shared
   *  throughput cap — so a cell's grey time is bounded (DWELL + WAVE) regardless of how much else
   *  is crumbling. That keeps small losses snappy AND lets several empires that fell on the same
   *  tick crumble simultaneously rather than queueing up behind one another. Order-independent, so
   *  cleared cells are swap-removed in place. */
  private decayStep(dt: number): void {
    this.simClock += dt;
    const q = this.decayQueue;
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i]!.due > this.simClock) continue;
      const idx = q[i]!.idx;
      if (this.grid.cells[idx] === DECAY_OWNER) this.grid.setOwner(idx, NEUTRAL);
      q[i] = q[q.length - 1]!;
      q.pop();
    }
  }

  /**
   * Add cells from the last trail point to the current one (rasterized, no gaps).
   * Returns true if the path crossed ITSELF — that closes a sever loop in the wild.
   */
  private extendTrail(id: string, curIdx: number): boolean {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = { cells: new Set<number>(), last: curIdx };
      trail.cells.add(curIdx);
      this.trails.set(id, trail);
      return false;
    }
    if (curIdx === trail.last) return false;
    let crossed = false;
    rasterLine(trail.last, curIdx, (idx) => {
      if (idx !== trail!.last && trail!.cells.has(idx)) crossed = true; // revisited earlier trail
      trail!.cells.add(idx);
    });
    trail.last = curIdx;
    if (trail.cells.size > CONFIG.TRAIL_MAX_CELLS) {
      this.trails.delete(id);
      return false;
    }
    return crossed;
  }

  private allocOwnerId(): number {
    return this.freeOwnerIds.pop() ?? this.nextOwnerId++;
  }

  /**
   * Find a spawn whose entire starter-territory disc sits on neutral wilderness, so a
   * new player never carves into an existing kingdom. Random attempts first (fast on a
   * sparse map), then a full scan from a random offset, then — only if the map is truly
   * packed — a plain random point as a last resort.
   */
  private findSpawn(r: number = CONFIG.START_TERRITORY_RADIUS): { x: number; y: number } {
    const m = CONFIG.SPAWN_MARGIN;
    const S = CONFIG.GRID_CELL;
    const center = (cx: number, cy: number): { x: number; y: number } => ({
      x: (cx + 0.5) * S,
      y: (cy + 0.5) * S,
    });

    for (let i = 0; i < CONFIG.SPAWN_TRIES; i++) {
      const x = m + Math.random() * (CONFIG.MAP_WIDTH - 2 * m);
      const y = m + Math.random() * (CONFIG.MAP_HEIGHT - 2 * m);
      const cx = worldToCellX(x);
      const cy = worldToCellY(y);
      if (this.grid.isDiscClear(cx, cy, r)) return center(cx, cy);
    }

    const start = Math.floor(Math.random() * GRID_SIZE);
    for (let k = 0; k < GRID_SIZE; k++) {
      const idx = (start + k) % GRID_SIZE;
      const cx = cellX(idx);
      const cy = cellY(idx);
      if (this.grid.isDiscClear(cx, cy, r)) return center(cx, cy);
    }

    return {
      x: m + Math.random() * (CONFIG.MAP_WIDTH - 2 * m),
      y: m + Math.random() * (CONFIG.MAP_HEIGHT - 2 * m),
    };
  }
}

/**
 * 4-connected line over cell indices; calls `visit` for each cell on the path. Unlike a
 * plain Bresenham line, this steps ONE axis at a time, so consecutive cells always share an
 * edge (never just a corner). That matters for the claim trail: two strokes that cross must
 * land on a shared cell, otherwise a self-cross — which is what triggers a sever loop — can
 * slip past at a half-cell offset and never register (game-spec §7 severing).
 */
function rasterLine(fromIdx: number, toIdx: number, visit: (idx: number) => void): void {
  let x0 = cellX(fromIdx);
  let y0 = cellY(fromIdx);
  const x1 = cellX(toIdx);
  const y1 = cellY(toIdx);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let ix = 0;
  let iy = 0;
  visit(cellIndex(x0, y0));
  while (ix < dx || iy < dy) {
    // Advance whichever axis is "less far along" — keeps the path next to the true line.
    if ((1 + 2 * ix) * dy < (1 + 2 * iy) * dx) {
      x0 += sx;
      ix++;
    } else {
      y0 += sy;
      iy++;
    }
    visit(cellIndex(x0, y0));
  }
}

// Offensive substrings (slurs / strong profanity), chosen to catch the real thing while
// avoiding false positives on ordinary names (e.g. "knight", "Dickson", "Cassidy"). Names
// are normalized — leetspeak folded, non-letters stripped — before checking, so "n1gg3r"
// and "n.i.g.g.a" are caught too.
const NAME_BLOCK = [
  "nigg", "niga", "nigr", "faggot", "fagot", "cunt", "kike", "chink", "retard", "rapist",
  "molest", "tranny", "beaner", "wetback", "gook", "kkk", "fuck", "phuck", "fuk", "shit",
  "pussy", "twat", "wank", "whore", "slut", "bitch", "asshole", "dyke", "spick", "jizz",
  "cumshot", "blowjob", "handjob", "negro",
];

/** Paint a bot's rolled cosmetics onto its spawned player (no-op for plain bots). */
function applyBotCosmetics(p: Player, c: BotCosmetics | null): void {
  if (!c) return;
  p.skinId = c.skinId;
  p.capSkin = c.capSkin;
  p.swordSkin = c.swordSkin;
  p.cloakSkin = c.cloakSkin;
  p.hatSkin = c.hatSkin;
  p.hairSkin = c.hairSkin;
  p.shirtSkin = c.shirtSkin;
}

/** Trim to a safe display name (protocol.md §4) and scrub slurs/profanity from user input. */
function sanitizeName(raw?: string): string {
  const cleaned = (raw ?? "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 16);
  if (!cleaned) return "guest";
  // Normalize for matching: lowercase, fold common leetspeak, drop everything but letters.
  const norm = cleaned
    .toLowerCase()
    .replace(/1/g, "i").replace(/3/g, "e").replace(/0/g, "o").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s").replace(/@/g, "a")
    .replace(/[^a-z]/g, "");
  if (NAME_BLOCK.some((b) => norm.includes(b))) {
    return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] ?? "guest"; // swap in a clean handle
  }
  return cleaned;
}
