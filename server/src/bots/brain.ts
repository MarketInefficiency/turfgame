import { CONFIG, DECAY_OWNER, NEUTRAL, cellIndex, cellX, cellY, worldToCellX, worldToCellY } from "@territory/shared";

/**
 * AI player "brain". One per bot. It outputs a synthetic input packet each tick
 * (aim vector + drawing flag) that the room feeds through the SAME authoritative sim as
 * a human's mouse — so bots are indistinguishable on the wire.
 *
 * There are no difficulty tiers any more: every bot is a SMART player. They all:
 *  - claim neutral land with clean, hand-drawn-looking loops;
 *  - CARVE into bordering rivals (loops aimed across the enemy frontier inherit their land);
 *  - DEFEND their turf — rush to tag intruders, abusing the home-soil instakill;
 *  - GANG UP: converge on the current top-3 players when a pile-on is forming;
 *  - HUNT clearly weaker players, but never into the safety of an enemy's home;
 *  - FLEE bigger players, ducking into foliage cover to break the chase.
 * Per-bot personalities (aggression, caution, carve appetite, loop size, reflexes) are
 * rolled so no two play alike, but all are competent. These are AI-feel parameters, not
 * game balance — balance stays in shared CONFIG.
 */

export interface BotSelf {
  x: number;
  y: number;
  army: number;
  ownerId: number;
  stateTag: string; // "HOME" | "WILD"
  capPower: number; // our capital's power points
  coverId: number; // foliage patch we're standing in (0 = open ground)
}
export interface BotOther {
  x: number;
  y: number;
  army: number;
  ownerId: number;
  capCell: number; // grid cell of their capital (to siege it)
  capPower: number; // their capital's power (>0 shields their land from looping)
  immune: boolean; // spawn-protected → can't be hurt and can't hurt us; ignore them
  coverId: number; // foliage patch they're hiding in (0 = open). Conceals them like it does for humans.
}
export interface Pt {
  x: number;
  y: number;
}
export interface BotWorld {
  self: BotSelf;
  others: BotOther[];
  cells: Uint16Array; // grid ownership (for intruder / enemy-land detection)
  topIds: Set<number>; // ownerIds of the current top-3 players (gang targets)
  coverPts: Pt[]; // centroids of foliage patches (places to hide)
}
export interface BotInput {
  aimX: number;
  aimY: number;
  drawing: boolean;
}

type Goal = "expand" | "carve" | "sever" | "flee" | "hunt" | "gang" | "defend" | "siege" | "wander";
type Tactic = "loop" | "box" | "lobe" | "fringe";

const TAU = Math.PI * 2;
// Acting distances are ABSOLUTE world units, NOT scaled to a bot's (large) vision —
// vision only decides what they NOTICE; these decide when they ACT.
const DANGER_R = 300; // flee a bigger player once this close
const HUNT_R = 470; // start chasing weaker prey within this range
const GANG_R = 640; // join a dogpile on a top-3 player within this range
const CARVE_R = 520; // look this far for a rival's frontier to carve into
const CARVE_MIN_ARMY = 120; // only carve once established — small bots grow on neutral first
const DEFEND_R = 760; // rush home to tag an intruder within this range
const COVER_R = 850; // look this far for foliage to hide in while fleeing
const SIEGE_R = 680; // go drain a powered enemy capital within this range
const SIEGE_MIN_ARMY = 80; // only established bots bother sieging (a trek that can get them killed)
const ALARM_R = 270; // on enemy soil with its owner this close → bail (their land instakills us)
const NOTICE_R = CONFIG.COMBAT_CONTACT_DIST * 2; // a player hidden in foliage is only "felt" this close
const SOIL_LOOKAHEAD = CONFIG.COMBAT_CONTACT_DIST * 2; // peek this far ahead to avoid stepping onto lethal enemy soil
const GUARD_R = 240; // an enemy body this close to a frontier means it's defended — don't attack it
const S_CELL = CONFIG.GRID_CELL;

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Broad play-style. Biases the rolled params so the field feels like different people. */
export type Archetype = "raider" | "turtle" | "balanced" | "explorer";

/** A rolled cosmetic loadout for a "looks like a real player" bot (set by the room). */
export interface BotCosmetics {
  skinId: string;
  capSkin: string;
  swordSkin: string;
  cloakSkin: string;
  hatSkin: string;
  hairSkin: string;
  shirtSkin: string;
}

function angDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class BotBrain {
  // --- identity / lifecycle (owned by the room) ---
  readonly id: string;
  readonly name: string;
  readonly color: string;
  dead = false;
  respawnIn = 0;
  /** Rolled cosmetic loadout, or null for a plain bot. Applied by the room on every (re)spawn. */
  cosmetics: BotCosmetics | null = null;
  readonly archetype: Archetype;

  // --- rolled personality (varies per bot) ---
  private readonly aimNoise: number;
  private readonly turnRate: number;
  private readonly throttleLo: number;
  private readonly throttleHi: number;
  private readonly aggression: number;
  private readonly caution: number;
  private readonly carveAppetite: number;
  private readonly mistakeChance: number;
  private readonly idleChance: number;
  private readonly vision: number;
  private readonly reactLo: number;
  private readonly reactHi: number;

  // --- runtime AI state ---
  private heading = Math.random() * TAU;
  private goal: Goal = "wander";
  private targetOwner = -1; // who we're deliberately moving to CONTACT (skip avoidance vs them)
  private decideAccum = 999; // force a decision on the first think()
  private nextDecideAt = 0.2;
  private idleTimer = 0;
  private throttleBias = Math.random() * TAU;
  // Commitment timers — humans don't re-target or peel off every blink. These keep a chase/defense
  // going for a beat so the bot reads as a person sticking with a plan, not a state machine flipping.
  private commitTimer = 0; // keep hunting/ganging the same target while > 0
  private pursueTimer = 0; // keep chasing a fled intruder a little past our border while > 0

  // last spot we stood on home — anchor we loop around / retreat to
  private homeX = 0;
  private homeY = 0;
  private haveHome = false;

  // Claim state — a claim is a WAYPOINT PATH the bot draws through, then closes back into home.
  // Different tactics generate differently-shaped paths, so claims no longer share one silhouette.
  private turnSign = 1;
  private cruise = 0.92;
  private path: Pt[] = [];
  private pathIdx = 0;
  private claimActive = false;
  private closing = false; // past the last waypoint, cutting back into home to seal the loop
  private claimTimer = 0; // abort safety so a stuck claim doesn't hang forever
  private severing = false; // this "claim" is a sabotage ring drawn over enemy land, not a capture
  private closeX = 0; // interior point we cut back to so the loop reliably re-enters our own land
  private closeY = 0;

  // transient targets
  private fleeX = 0;
  private fleeY = 0;
  private wanderX = 0;
  private wanderY = 0;
  private siegeOwner = -1; // capital owner we're draining

  constructor(id: string, name: string, color: string) {
    this.id = id;
    this.name = name;
    this.color = color;
    // Pick a broad play-style first, then roll a competent personality biased by it. Two bots of
    // the same archetype still differ; two of different archetypes feel like different people.
    const r = Math.random();
    this.archetype = r < 0.28 ? "raider" : r < 0.56 ? "turtle" : r < 0.8 ? "balanced" : "explorer";
    const A = this.archetype;
    // Per-archetype multipliers (aggression, caution, carve appetite, restlessness). Claim SIZE is
    // handled in startClaim now, kept modest for reliability.
    const aggMul = A === "raider" ? 1.4 : A === "turtle" ? 0.6 : A === "explorer" ? 0.95 : 1;
    const cauMul = A === "turtle" ? 1.2 : A === "raider" ? 0.75 : 1;
    const carveMul = A === "raider" ? 1.5 : A === "turtle" ? 0.45 : A === "explorer" ? 0.8 : 1;
    const idleMul = A === "explorer" ? 1.8 : A === "turtle" ? 1.2 : 1;

    this.aimNoise = 0.06 * rand(0.6, 1.4);
    this.turnRate = rand(7.5, 11);
    this.throttleLo = rand(0.86, 0.97);
    this.throttleHi = Math.min(1, this.throttleLo + rand(0.04, 0.12));
    this.aggression = clamp(rand(0.4, 0.85) * aggMul, 0.2, 0.96);
    this.caution = clamp(rand(0.55, 0.9) * cauMul, 0.3, 0.96);
    this.carveAppetite = clamp(rand(0.3, 0.7) * carveMul, 0.08, 0.92);
    this.mistakeChance = rand(0, 0.04);
    this.idleChance = clamp(rand(0.02, 0.06) * idleMul, 0.01, 0.14);
    this.vision = rand(650, 950);
    this.reactLo = rand(0.12, 0.22);
    this.reactHi = this.reactLo + rand(0.12, 0.3);
  }

  /** Reset volatile AI state on respawn (keeps the rolled personality). */
  reset(): void {
    this.goal = "wander";
    this.claimActive = false;
    this.closing = false;
    this.severing = false;
    this.path = [];
    this.pathIdx = 0;
    this.targetOwner = -1;
    this.decideAccum = 999;
    this.nextDecideAt = 0.2;
    this.idleTimer = 0;
    this.haveHome = false;
    this.siegeOwner = -1;
    this.commitTimer = 0;
    this.pursueTimer = 0;
  }

  /** One tick of thinking → a synthetic input packet. */
  think(world: BotWorld, dt: number): BotInput {
    const self = world.self;
    if (self.stateTag === "HOME") {
      this.homeX = self.x;
      this.homeY = self.y;
      this.haveHome = true;
    }

    this.decideAccum += dt;
    if (this.decideAccum >= this.nextDecideAt) {
      this.decideAccum = 0;
      this.nextDecideAt = rand(this.reactLo, this.reactHi);
      this.decide(world);
    }
    if (this.idleTimer > 0) this.idleTimer -= dt;

    const plan = this.computePlan(world, dt);

    // Collision avoidance: nudge around other bodies we're NOT deliberately contacting
    // (bumping anyone in the wild drains both armies). Skipped while closing a loop on our
    // own safe soil, and skipped vs. the one player we're chasing to hit.
    let dirx = Math.cos(plan.angle);
    let diry = Math.sin(plan.angle);
    const closingLoop = (this.goal === "expand" || this.goal === "carve") && this.closing;
    if (!closingLoop) {
      const avoidR = CONFIG.COMBAT_CONTACT_DIST * 1.9;
      for (const o of world.others) {
        if (o.ownerId === self.ownerId || o.ownerId === this.targetOwner) continue;
        const dx = self.x - o.x;
        const dy = self.y - o.y;
        const d2 = dx * dx + dy * dy;
        // Don't steer around a body we can't see (hidden in foliage) — that swerve would reveal we
        // secretly know they're there. We'll just bump them, which is how cover is supposed to work.
        if (o.coverId > 0 && o.coverId !== self.coverId) continue;
        if (d2 > 1 && d2 < avoidR * avoidR) {
          const d = Math.sqrt(d2);
          const w = (avoidR - d) / avoidR;
          dirx += (dx / d) * w * 1.3;
          diry += (dy / d) * w * 1.3;
        }
      }
    }
    const desired = Math.atan2(diry, dirx);

    // Ease the heading toward the desired angle (no instant snaps), then jitter it.
    const maxStep = this.turnRate * dt;
    this.heading += Math.max(-maxStep, Math.min(maxStep, angDiff(this.heading, desired)));
    this.heading += (Math.random() - 0.5) * this.aimNoise;

    // Humans don't hold a perfectly constant speed — wobble the throttle a touch.
    this.throttleBias += dt * 1.7;
    let throttle = plan.throttle * (0.9 + 0.1 * Math.sin(this.throttleBias));
    if (this.idleTimer > 0) throttle *= 0.12;

    const len = throttle <= 0 ? 0 : CONFIG.AIM_DEADZONE + 2 + throttle * (CONFIG.AIM_FULL_SPEED_DIST - CONFIG.AIM_DEADZONE);
    return { aimX: Math.cos(this.heading) * len, aimY: Math.sin(this.heading) * len, drawing: plan.drawing };
  }

  /**
   * Can this bot perceive `o`? Mirrors the human concealment rule: a player tucked into a foliage
   * patch is invisible to anyone not in that same patch — until they're close enough to bump into.
   * Bots used to see straight through cover, which is the cheat that gave them away.
   */
  private canSee(self: BotSelf, o: BotOther, d: number): boolean {
    if (o.coverId > 0 && o.coverId !== self.coverId && d > NOTICE_R) return false;
    return true;
  }

  /** Owner of the cell a short step ahead along `ang` — used to avoid blundering onto lethal soil. */
  private cellAhead(cells: Uint16Array, x: number, y: number, ang: number): number {
    return cells[cellIndex(worldToCellX(x + Math.cos(ang) * SOIL_LOOKAHEAD), worldToCellY(y + Math.sin(ang) * SOIL_LOOKAHEAD))] ?? NEUTRAL;
  }

  /** Re-evaluate the high-level goal (runs only every reaction window). */
  private decide(world: BotWorld): void {
    const self = world.self;

    // Scan once. Spawn-protected players are ignored entirely (can't be hurt and can't
    // hurt us). Also track who is shielding land with a powered capital, and the nearest
    // powered enemy capital we could go drain.
    let intruder: BotOther | null = null, intruderD = Infinity;
    let threat: BotOther | null = null, threatD = Infinity;
    let prey: BotOther | null = null, preyD = Infinity;
    let giant: BotOther | null = null, giantD = Infinity;
    let cap: BotOther | null = null, capD = Infinity;
    const shielded = new Set<number>(); // owners whose land can't be looped (capital has power)
    // Whose home soil are we standing on right now? (NEUTRAL/our own/decay → none.) If it's a rival's
    // and they're near, their land instakills us, so we need to bolt.
    const groundOwner = world.cells[cellIndex(worldToCellX(self.x), worldToCellY(self.y))];
    const onEnemySoil = groundOwner !== undefined && groundOwner !== NEUTRAL && groundOwner !== DECAY_OWNER && groundOwner !== self.ownerId;
    let soilOwner: BotOther | null = null, soilOwnerD = Infinity;
    for (const o of world.others) {
      if (o.ownerId === self.ownerId || o.immune) continue;
      if (o.capPower > 0) shielded.add(o.ownerId);
      const d = Math.hypot(o.x - self.x, o.y - self.y);
      const seen = this.canSee(self, o, d); // hidden-in-foliage players are invisible past bump range
      if (onEnemySoil && o.ownerId === groundOwner && seen && d < soilOwnerD) { soilOwnerD = d; soilOwner = o; }
      if (seen && d < intruderD && onLand(world.cells, o.x, o.y, self.ownerId)) { intruderD = d; intruder = o; }
      // Distance to THEIR capital (siege target), not their body — a castle isn't concealed by trees.
      if (o.capPower > 0) {
        const capx = (cellX(o.capCell) + 0.5) * S_CELL;
        const capy = (cellY(o.capCell) + 0.5) * S_CELL;
        const cd = Math.hypot(capx - self.x, capy - self.y);
        if (cd < capD) { capD = cd; cap = o; }
      }
      if (!seen || d > this.vision) continue;
      if (o.army > self.army * 1.25) { if (d < threatD) { threatD = d; threat = o; } }
      else if (o.army < self.army * 0.7) { if (d < preyD) { preyD = d; prey = o; } }
      if (world.topIds.has(o.ownerId) && d < giantD) { giantD = d; giant = o; }
    }

    // 1) DEFEND: someone is on our turf (this includes a besieger overlapping our capital)
    //    — rush to tag them; home soil instakills intruders and hands us their points.
    if (intruder && intruderD < DEFEND_R) {
      this.goal = "defend";
      this.targetOwner = intruder.ownerId;
      this.pursueTimer = rand(0.7, 1.6); // and hound them a beat past the border if they bolt
      return;
    }

    // 1a) ALARM: we're caught on a rival's home soil and its owner is bearing down on us. Their land
    //     is an instant-kill zone, so a real player drops everything and sprints off it — no matter
    //     how big we are. (When the owner is far, carving their unguarded frontier is still fine.)
    if (onEnemySoil && soilOwner && soilOwnerD < ALARM_R) {
      this.goal = "flee";
      this.targetOwner = -1;
      this.fleeX = soilOwner.x;
      this.fleeY = soilOwner.y;
      return;
    }

    // 1b) STICK WITH A CHASE. Re-picking a target every reaction window is the clearest bot tell,
    //     so while a hunt/gang commitment is live and its target still exists, keep going.
    if ((this.goal === "hunt" || this.goal === "gang") && this.commitTimer > 0) {
      const t = world.others.find((o) => o.ownerId === this.targetOwner && !o.immune);
      if (t) return;
    }

    // 2) GANG: pile onto a nearby top-3 player when a fight is already brewing around them.
    if (giant && giantD < GANG_R && self.army >= 60) {
      let allies = 0;
      for (const o of world.others) {
        if (o.ownerId === giant.ownerId || o.ownerId === self.ownerId || o.immune) continue;
        if (Math.hypot(o.x - giant.x, o.y - giant.y) < GANG_R * 0.6) allies++;
      }
      if (allies >= 1 || self.army > giant.army * 0.5) {
        this.goal = "gang";
        this.targetOwner = giant.ownerId;
        this.commitTimer = rand(1.5, 3);
        return;
      }
    }

    // 3) FLEE: a bigger player is close. A FAR bigger one (could erase us in one contact) we always
    //    run from — that's just survival; a marginally bigger one we dodge only per our caution.
    if (threat && threatD < DANGER_R) {
      const lethal = threat.army > self.army * 1.6; // would clearly win a drain and we'd pop
      if (lethal || Math.random() < this.caution) {
        this.goal = "flee";
        this.targetOwner = -1;
        this.fleeX = threat.x;
        this.fleeY = threat.y;
        return;
      }
    }

    // 4) SIEGE: drain a nearby powered enemy capital — it farms power into ours AND strips
    //    the shield off their land so we can carve it afterward. Established bots only.
    if (cap && capD < SIEGE_R && self.army >= SIEGE_MIN_ARMY && Math.random() < 0.6 + this.aggression * 0.4) {
      this.goal = "siege";
      this.siegeOwner = cap.ownerId;
      this.targetOwner = -1;
      return;
    }

    // 5) HUNT: pick off a clearly weaker player in the open (never into their own home).
    if (prey && preyD < HUNT_R && Math.random() < this.aggression && !onLand(world.cells, prey.x, prey.y, prey.ownerId)) {
      this.goal = "hunt";
      this.targetOwner = prey.ownerId;
      this.commitTimer = rand(1.2, 2.6);
      return;
    }

    if (Math.random() < this.idleChance) this.idleTimer = rand(0.25, 0.8);

    // 6) Otherwise keep growing. A claim only works when it starts from our own soil, so if we're
    //    out in the wild (just finished a chase, say) we walk home first, THEN draw — exactly the
    //    rhythm a person plays with. Once home we either capture (loop home) or, now and then,
    //    sabotage a leading rival by severing a chunk of their land.
    const claiming = this.goal === "expand" || this.goal === "carve" || this.goal === "sever";
    const needNewClaim = !claiming || !this.claimActive;
    if (needNewClaim) {
      if (self.stateTag !== "HOME" && this.haveHome) { this.headHome(); return; }
      this.startClaim(world, threat, shielded);
    } else if (Math.random() < this.mistakeChance) {
      this.startWander(world); // human fumble: drop the claim
    }
  }

  /** Walk back onto our own soil (no drawing) so the next claim can start from home. */
  private headHome(): void {
    this.goal = "wander";
    this.targetOwner = -1;
    this.claimActive = false;
    this.wanderX = this.homeX;
    this.wanderY = this.homeY;
  }

  /**
   * Begin a claim. Usually a capture loop (expand into neutral, or carve a bordering rival), but a
   * confident bot will sometimes SABOTAGE a leader instead — drawing a self-closing ring over a
   * chunk of their land to sever it to neutral. Reliability is the priority: shapes are sized so the
   * loop always re-enters our own soil, because a claim that lands every time beats a flashy one
   * that whiffs.
   */
  private startClaim(world: BotWorld, threat: BotOther | null, shielded: Set<number>): void {
    this.targetOwner = -1;
    if (!this.haveHome) { this.startWander(world); return; }
    const self = world.self;

    // Established bots eye a REAL, un-shielded rival frontier to attack (shielded loops just fail).
    let carve: Pt | null = null;
    let carveOwner = NEUTRAL;
    if (self.army >= CARVE_MIN_ARMY && Math.random() < this.carveAppetite) {
      carve = findEnemyFrontier(world.cells, self.x, self.y, self.ownerId, shielded);
      if (carve) {
        carveOwner = world.cells[cellIndex(worldToCellX(carve.x), worldToCellY(carve.y))] ?? NEUTRAL;
        // Don't attack a frontier its owner is sitting on — drawing into their soil beside them is
        // death. Leave a guarded border alone and just expand into open ground instead.
        const guarded = world.others.some(
          (o) => o.ownerId === carveOwner && !o.immune && Math.hypot(o.x - carve!.x, o.y - carve!.y) < GUARD_R,
        );
        if (guarded) { carve = null; carveOwner = NEUTRAL; }
      }
    }

    this.turnSign = Math.random() < 0.5 ? 1 : -1;
    this.cruise = rand(this.throttleLo, this.throttleHi);
    this.severing = false;
    this.closing = false;
    this.pathIdx = 0;

    const ax = self.stateTag === "HOME" ? self.x : this.homeX;
    const ay = self.stateTag === "HOME" ? self.y : this.homeY;

    // SABOTAGE: if the carve target is a leader and we're a sizable, aggressive sort, occasionally
    // sever a piece of them instead of taking it — denying a frontrunner land is its own win.
    if (carve && self.army >= 220 && this.archetype !== "turtle") {
      const isLeader = world.topIds.has(carveOwner);
      if ((isLeader && Math.random() < 0.35 + this.aggression * 0.25) || Math.random() < 0.06) {
        this.goal = "sever";
        this.severing = true;
        const out = Math.atan2(carve.y - ay, carve.x - ax);
        const ringR = rand(95, 165);
        // Center the ring a little INTO their land so it encloses real cells of theirs.
        const cx = carve.x + Math.cos(out) * ringR * 0.7;
        const cy = carve.y + Math.sin(out) * ringR * 0.7;
        this.path = this.buildSeverRing(cx, cy, ringR);
        this.claimActive = true;
        this.claimTimer = 7 + (ringR * TAU) / 60;
        return;
      }
    }

    // CAPTURE: modest, reliable reach. Grows a little with the empire and play style, hard-capped.
    const styleMul = this.archetype === "raider" ? 1.2 : this.archetype === "turtle" ? 0.82 : 1;
    const sizeBoost = 1 + Math.min(0.55, self.army / 1600);
    let out: number;
    let R: number;
    if (carve) {
      out = Math.atan2(carve.y - ay, carve.x - ax);
      const dist = Math.hypot(carve.x - ax, carve.y - ay);
      R = clamp(dist + rand(50, 130), 150, 380); // reach across the frontier so enclosed cells flip
      this.goal = "carve";
    } else {
      // Competent expansion: head where there's the most open neutral ground (jittered so the whole
      // field doesn't beeline the same way), but veer away from a nearby bigger player.
      out = this.bestOutDir(world.cells, ax, ay, self.ownerId);
      if (threat) out = Math.atan2(ay - threat.y, ax - threat.x) + (Math.random() - 0.5) * 1.0;
      R = clamp(rand(150, 300) * styleMul * sizeBoost, 130, 360);
      this.goal = "expand";
    }

    // The point we cut back to: just INSIDE our border from the anchor, so the return leg is
    // guaranteed to cross into our own land and seal the loop.
    this.closeX = clamp(ax - Math.cos(out) * 40, 36, CONFIG.MAP_WIDTH - 36);
    this.closeY = clamp(ay - Math.sin(out) * 40, 36, CONFIG.MAP_HEIGHT - 36);

    this.path = this.buildClaimPath(this.pickTactic(carve != null), ax, ay, out, R);
    this.claimActive = true;
    this.claimTimer = 6 + R / 45 + this.path.length * 1.1; // generous so it rarely times out
  }

  /** Choose a claim shape, weighted by play style. Carves favor shapes that punch across a border. */
  private pickTactic(carving: boolean): Tactic {
    const A = this.archetype;
    const pool: Tactic[] = carving
      ? ["lobe", "box", "loop"]
      : A === "turtle"
        ? ["loop", "fringe", "fringe", "box"]
        : A === "raider"
          ? ["box", "lobe", "lobe", "loop"]
          : A === "explorer"
            ? ["lobe", "fringe", "loop", "box"]
            : ["loop", "box", "lobe", "fringe"];
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  /**
   * Waypoints for a capture loop. Every traversal point stays well OUT in the wild (outward offset
   * never drops near the border) so the bot can't accidentally re-enter home and close an empty
   * loop mid-draw — that was the old bug. Only the deliberate return leg cuts back in. Each shape
   * encloses area differently (rectangle, long lobe, wide crescent, rounded cap) so claims don't
   * share one silhouette. `out` is outward; `perp` runs along the border.
   */
  private buildClaimPath(t: Tactic, ax: number, ay: number, out: number, R: number): Pt[] {
    const perp = out + (Math.PI / 2) * this.turnSign;
    const co = Math.cos(out), so = Math.sin(out), cp = Math.cos(perp), sp = Math.sin(perp);
    const at = (o: number, p: number): Pt => ({
      x: clamp(ax + co * o + cp * p, 36, CONFIG.MAP_WIDTH - 36),
      y: clamp(ay + so * o + sp * p, 36, CONFIG.MAP_HEIGHT - 36),
    });
    const j = () => (Math.random() - 0.5) * R * 0.1; // gentle per-point jitter, not ruler-straight legs
    const pts: Pt[] = [];
    if (t === "box") {
      const D = R, W = R * rand(0.5, 0.95);
      pts.push(at(D + j(), j()), at(D + j(), W + j()), at(D * 0.55 + j(), W + j()));
    } else if (t === "lobe") {
      const D = R * rand(1.1, 1.45), W = R * rand(0.5, 0.8);
      pts.push(at(D * 0.6, W * 0.2 + j()), at(D + j(), W * 0.5 + j()), at(D + j(), W + j()), at(D * 0.6 + j(), W + j()));
    } else if (t === "fringe") {
      const D = R * rand(0.7, 0.95), W = R * rand(1.1, 1.6); // wide, shallow strip along the border
      pts.push(at(D + j(), W * 0.33), at(D + j(), W * 0.66), at(D * 0.6 + j(), W + j()));
    } else {
      // rounded cap: sweep laterally from one side to the other, bulging out, staying in the wild
      const D = R, W = R * rand(0.7, 1.0);
      const steps = 5 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= steps; i++) {
        const ang = Math.PI * (i / (steps + 1));
        pts.push(at((0.5 + 0.5 * Math.sin(ang)) * D, Math.cos(ang) * W));
      }
    }
    return pts;
  }

  /**
   * Waypoints for a sabotage ring: a full circle (and a hair more, to guarantee the trail crosses
   * itself) drawn over a rival's land. When the trail self-closes the server severs the enclosed
   * cells to neutral — and any piece that orphans goes neutral too. A clean way to gut a leader.
   */
  private buildSeverRing(cx: number, cy: number, rr: number): Pt[] {
    const start = Math.random() * TAU;
    const steps = 11;
    const pts: Pt[] = [];
    for (let i = 1; i <= steps + 2; i++) {
      const a = start + this.turnSign * TAU * (i / steps);
      pts.push({
        x: clamp(cx + Math.cos(a) * rr, 36, CONFIG.MAP_WIDTH - 36),
        y: clamp(cy + Math.sin(a) * rr, 36, CONFIG.MAP_HEIGHT - 36),
      });
    }
    return pts;
  }

  /**
   * Pick the most promising outward heading for an expand claim: the direction with the most open
   * neutral ground ahead (a little enemy land is a bonus, walls are penalized), with jitter so a
   * crowd of bots doesn't all beeline the same way.
   */
  private bestOutDir(cells: Uint16Array, x: number, y: number, ownerId: number): number {
    let best = Math.random() * TAU, bestScore = -Infinity;
    const base = Math.random() * TAU;
    for (let k = 0; k < 8; k++) {
      const a = base + (k / 8) * TAU;
      const cos = Math.cos(a), sin = Math.sin(a);
      let neutral = 0, enemy = 0, blocked = false;
      for (let r = 50; r <= 460; r += 45) {
        const o = cells[cellIndex(worldToCellX(x + cos * r), worldToCellY(y + sin * r))];
        if (o === undefined) { blocked = true; break; }
        if (o === NEUTRAL) neutral++;
        else if (o !== ownerId && o !== DECAY_OWNER) enemy++;
      }
      const score = neutral * 1.5 + enemy * 0.4 - (blocked ? 6 : 0) + rand(0, 2.2);
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  private startWander(world: BotWorld): void {
    this.goal = "wander";
    this.targetOwner = -1;
    const self = world.self;
    const a = Math.random() * TAU;
    const r = rand(300, 900);
    this.wanderX = Math.max(40, Math.min(CONFIG.MAP_WIDTH - 40, self.x + Math.cos(a) * r));
    this.wanderY = Math.max(40, Math.min(CONFIG.MAP_HEIGHT - 40, self.y + Math.sin(a) * r));
  }

  private computePlan(world: BotWorld, dt: number): { angle: number; throttle: number; drawing: boolean } {
    const self = world.self;
    switch (this.goal) {
      case "defend": {
        const t = world.others.find((o) => o.ownerId === this.targetOwner);
        if (!t) { this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt); }
        if (onLand(world.cells, t.x, t.y, self.ownerId)) {
          this.pursueTimer = rand(0.7, 1.6); // still trespassing — keep the commitment topped up
          return { angle: Math.atan2(t.y - self.y, t.x - self.x), throttle: 1, drawing: false };
        }
        // They bolted off our soil. Don't snap away instantly (the classic bot tell). If we clearly
        // outgun them and they're close, hound them in the open to bump-kill — the real way to finish
        // a kill. Otherwise chase a short beat, then drift back to growing.
        const td = Math.hypot(t.x - self.x, t.y - self.y);
        if (self.army > t.army * 1.15 && td < HUNT_R) {
          this.goal = "hunt"; this.targetOwner = t.ownerId; this.commitTimer = rand(1.2, 2.6);
          return this.computePlan(world, dt);
        }
        this.pursueTimer -= dt;
        if (this.pursueTimer > 0) return { angle: Math.atan2(t.y - self.y, t.x - self.x), throttle: 0.85, drawing: false };
        this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt);
      }
      case "gang": {
        this.commitTimer -= dt;
        const t = world.others.find((o) => o.ownerId === this.targetOwner);
        // Break off if the giant died, dropped out of the top-3, or fled their own home.
        if (!t || !world.topIds.has(this.targetOwner) || onLand(world.cells, t.x, t.y, t.ownerId)) {
          this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt);
        }
        const ang = Math.atan2(t.y - self.y, t.x - self.x);
        // Don't pile in over their home border — that's an instant-kill floor. Wait for them in the open.
        if (this.cellAhead(world.cells, self.x, self.y, ang) === t.ownerId) {
          this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt);
        }
        return { angle: ang, throttle: 1, drawing: false };
      }
      case "flee": {
        // Prefer retreating to nearby home (safe — our soil instakills the chaser, and we
        // resume claiming straight after). If home is far, duck into the nearest foliage to
        // hide. Never run straight into the threat.
        const away = Math.atan2(self.y - this.fleeY, self.x - this.fleeX);
        const homeD = this.haveHome ? Math.hypot(this.homeX - self.x, this.homeY - self.y) : Infinity;
        let tx = self.x + Math.cos(away) * 200;
        let ty = self.y + Math.sin(away) * 200;
        if (homeD < 500) {
          tx = this.homeX; ty = this.homeY;
        } else {
          const cover = nearestCover(self.x, self.y, world.coverPts, COVER_R);
          if (cover) { tx = cover.x; ty = cover.y; }
          else if (this.haveHome) { tx = this.homeX; ty = this.homeY; }
        }
        const toT = Math.atan2(ty - self.y, tx - self.x);
        const toThreat = Math.atan2(this.fleeY - self.y, this.fleeX - self.x);
        const ang = Math.abs(angDiff(toT, toThreat)) < 0.85 ? away : toT;
        return { angle: ang, throttle: 1, drawing: false };
      }
      case "hunt": {
        this.commitTimer -= dt;
        const t = world.others.find((o) => o.ownerId === this.targetOwner);
        // Give up only when the target is gone, reaches its own safe soil, or our commitment runs
        // out AND it's no longer worth it — not the instant its army ratio twitches.
        if (!t || onLand(world.cells, t.x, t.y, t.ownerId) || (this.commitTimer <= 0 && t.army > self.army * 0.85)) {
          this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt);
        }
        const ang = Math.atan2(t.y - self.y, t.x - self.x);
        // CRITICAL: never follow prey onto their own land — the owner instakills intruders there, so
        // chasing in is suicide. The moment pressing forward would step onto their soil, peel off and
        // let them go (or wait at the edge). This is the single biggest "they walk in and die" fix.
        if (this.cellAhead(world.cells, self.x, self.y, ang) === t.ownerId) {
          this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt);
        }
        return { angle: ang, throttle: 1, drawing: false };
      }
      case "siege": {
        const t = world.others.find((o) => o.ownerId === this.siegeOwner);
        // Done once the capital is drained / gone — then go take that now-unshielded land.
        if (!t || t.capPower <= 0) { this.goal = "expand"; this.claimActive = false; return this.computePlan(world, dt); }
        const capx = (cellX(t.capCell) + 0.5) * S_CELL;
        const capy = (cellY(t.capCell) + 0.5) * S_CELL;
        // If the owner is sitting on their capital defending it, don't suicide — back off.
        const ownerGuard = Math.hypot(t.x - capx, t.y - capy) < CONFIG.COMBAT_CONTACT_DIST * 1.8;
        if (ownerGuard) {
          this.goal = "flee";
          this.fleeX = t.x;
          this.fleeY = t.y;
          return this.computePlan(world, dt);
        }
        // Drain by STANDING on the capital, the way a person does — no robotic back-and-forth. Ease
        // in while approaching, then basically hold still (a faint, occasional micro-nudge only).
        const cd = Math.hypot(capx - self.x, capy - self.y);
        if (cd <= CONFIG.COMBAT_CONTACT_DIST * 0.6) {
          const micro = Math.max(0, Math.sin(this.throttleBias * 0.6) * 0.06); // mostly 0, the odd tiny drift
          return { angle: Math.atan2(capy - self.y, capx - self.x), throttle: micro, drawing: false };
        }
        const approach = cd < CONFIG.COMBAT_CONTACT_DIST * 1.4 ? 0.3 : this.throttleHi;
        return { angle: Math.atan2(capy - self.y, capx - self.x), throttle: approach, drawing: false };
      }
      case "wander": {
        const dx = this.wanderX - self.x;
        const dy = this.wanderY - self.y;
        if (dx * dx + dy * dy < 60 * 60) this.startWander(world);
        return { angle: Math.atan2(dy, dx), throttle: this.throttleLo, drawing: false };
      }
      case "carve":
      case "expand":
      case "sever":
      default:
        return this.claimPlan(world, dt);
    }
  }

  /**
   * Draw the current claim: steer through each waypoint, then (for a capture) cut back into our own
   * land to seal the loop. For a sabotage ring there's no home leg — the server severs the moment
   * the trail self-crosses, so once the ring is traced we're done. A hard timer aborts a stuck
   * attempt cleanly rather than dying mid-draw. Heading easing in think() rounds the corners so even
   * the boxy shapes read as hand-drawn.
   */
  private claimPlan(world: BotWorld, dt: number): { angle: number; throttle: number; drawing: boolean } {
    const self = world.self;
    if (!this.claimActive) {
      // Brief gap between attempts (reads as a human pausing to plan); decide() starts the next soon.
      return { angle: this.heading, throttle: 0.35, drawing: false };
    }
    this.claimTimer -= dt;
    if (this.claimTimer <= 0) {
      this.claimActive = false;
      this.startWander(world);
      return { angle: this.heading, throttle: 0.4, drawing: false };
    }

    if (!this.closing) {
      const wp = this.path[this.pathIdx];
      if (!wp) {
        this.closing = true;
      } else {
        const dx = wp.x - self.x;
        const dy = wp.y - self.y;
        if (dx * dx + dy * dy < 55 * 55) {
          this.pathIdx++;
          if (this.pathIdx >= this.path.length) this.closing = true;
        } else {
          return { angle: Math.atan2(dy, dx), throttle: this.cruise, drawing: true };
        }
      }
    }

    // Sabotage ring fully traced — the sever already fired when the trail self-crossed. Done.
    if (this.severing) {
      this.claimActive = false;
      return { angle: this.heading, throttle: 0.5, drawing: false };
    }

    // Capture: cut back toward the point just inside our border; the loop seals the instant we
    // re-enter our own soil.
    if (self.stateTag === "HOME") {
      this.claimActive = false;
      return { angle: this.heading, throttle: 0.5, drawing: false };
    }
    return { angle: Math.atan2(this.closeY - self.y, this.closeX - self.x), throttle: this.throttleHi, drawing: true };
  }
}

/** Is (x,y) standing on `ownerId`'s claimed territory? */
function onLand(cells: Uint16Array, x: number, y: number, ownerId: number): boolean {
  return cells[cellIndex(worldToCellX(x), worldToCellY(y))] === ownerId;
}

/**
 * Find the nearest CARVEABLE enemy-owned cell around (x,y) — a real frontier worth carving,
 * skipping owners shielded by a powered capital (looping them is blocked). Returns the
 * closest such enemy land (a world point), or null if there's nothing worth carving nearby.
 */
function findEnemyFrontier(cells: Uint16Array, x: number, y: number, ownerId: number, shielded: Set<number>): Pt | null {
  let best: Pt | null = null;
  let bestR = Infinity;
  for (let a = 0; a < TAU; a += Math.PI / 8) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let r = 60; r <= CARVE_R; r += 48) {
      const px = x + cos * r;
      const py = y + sin * r;
      const o = cells[cellIndex(worldToCellX(px), worldToCellY(py))];
      if (o === undefined) break;
      if (o !== NEUTRAL && o !== ownerId && o !== DECAY_OWNER) {
        if (!shielded.has(o) && r < bestR) { bestR = r; best = { x: px, y: py }; }
        break; // nearest enemy cell in this direction (shielded ones just block the ray)
      }
    }
  }
  return best;
}

/** Nearest foliage-patch centroid within `maxR`, or null. */
function nearestCover(x: number, y: number, pts: Pt[], maxR: number): Pt | null {
  let best: Pt | null = null;
  let bd = maxR * maxR;
  for (const p of pts) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}
