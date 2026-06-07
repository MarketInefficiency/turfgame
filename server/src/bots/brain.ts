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
}
export interface BotOther {
  x: number;
  y: number;
  army: number;
  ownerId: number;
  capCell: number; // grid cell of their capital (to siege it)
  capPower: number; // their capital's power (>0 shields their land from looping)
  immune: boolean; // spawn-protected → can't be hurt and can't hurt us; ignore them
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

type Goal = "expand" | "carve" | "flee" | "hunt" | "gang" | "defend" | "siege" | "wander";
type Phase = "exit" | "arc" | "home" | "done";

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
const S_CELL = CONFIG.GRID_CELL;

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

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

  // --- rolled personality (varies per bot) ---
  private readonly aimNoise: number;
  private readonly turnRate: number;
  private readonly throttleLo: number;
  private readonly throttleHi: number;
  private readonly loopRLo: number;
  private readonly loopRHi: number;
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

  // last spot we stood on home — anchor we loop around / retreat to
  private homeX = 0;
  private homeY = 0;
  private haveHome = false;

  // loop (expand/carve) state
  private phase: Phase = "done";
  private phaseTimer = 0;
  private outAngle = 0;
  private turnSign = 1;
  private orbitR = 200;
  private cruise = 0.92;
  private swept = 0;
  private sweepTarget = Math.PI;
  private lastPhi = 0;

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
    // Roll a competent personality with spread, so the field feels like distinct people.
    this.aimNoise = 0.06 * rand(0.6, 1.4);
    this.turnRate = rand(7.5, 11);
    this.throttleLo = rand(0.88, 0.97);
    this.throttleHi = Math.min(1, this.throttleLo + rand(0.04, 0.12));
    this.loopRLo = rand(150, 300);
    this.loopRHi = this.loopRLo + rand(90, 240);
    this.aggression = rand(0.4, 0.85);
    this.caution = rand(0.55, 0.9);
    this.carveAppetite = rand(0.3, 0.7);
    this.mistakeChance = rand(0, 0.04);
    this.idleChance = rand(0.02, 0.06);
    this.vision = rand(650, 950);
    this.reactLo = rand(0.12, 0.2);
    this.reactHi = this.reactLo + rand(0.12, 0.28);
  }

  /** Reset volatile AI state on respawn (keeps the rolled personality). */
  reset(): void {
    this.goal = "wander";
    this.phase = "done";
    this.targetOwner = -1;
    this.decideAccum = 999;
    this.nextDecideAt = 0.2;
    this.idleTimer = 0;
    this.haveHome = false;
    this.swept = 0;
    this.siegeOwner = -1;
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
    const closingLoop = (this.goal === "expand" || this.goal === "carve") && this.phase === "home";
    if (!closingLoop) {
      const avoidR = CONFIG.COMBAT_CONTACT_DIST * 1.9;
      for (const o of world.others) {
        if (o.ownerId === self.ownerId || o.ownerId === this.targetOwner) continue;
        const dx = self.x - o.x;
        const dy = self.y - o.y;
        const d2 = dx * dx + dy * dy;
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
    for (const o of world.others) {
      if (o.ownerId === self.ownerId || o.immune) continue;
      if (o.capPower > 0) shielded.add(o.ownerId);
      const d = Math.hypot(o.x - self.x, o.y - self.y);
      if (d < intruderD && onLand(world.cells, o.x, o.y, self.ownerId)) { intruderD = d; intruder = o; }
      // Distance to THEIR capital (siege target), not their body.
      if (o.capPower > 0) {
        const capx = (cellX(o.capCell) + 0.5) * S_CELL;
        const capy = (cellY(o.capCell) + 0.5) * S_CELL;
        const cd = Math.hypot(capx - self.x, capy - self.y);
        if (cd < capD) { capD = cd; cap = o; }
      }
      if (d > this.vision) continue;
      if (o.army > self.army * 1.25) { if (d < threatD) { threatD = d; threat = o; } }
      else if (o.army < self.army * 0.7) { if (d < preyD) { preyD = d; prey = o; } }
      if (world.topIds.has(o.ownerId) && d < giantD) { giantD = d; giant = o; }
    }

    // 1) DEFEND: someone is on our turf (this includes a besieger overlapping our capital)
    //    — rush to tag them; home soil instakills intruders and hands us their points.
    if (intruder && intruderD < DEFEND_R) {
      this.goal = "defend";
      this.targetOwner = intruder.ownerId;
      return;
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
        return;
      }
    }

    // 3) FLEE: a bigger player is close — break off and hide in cover.
    if (threat && threatD < DANGER_R && Math.random() < this.caution) {
      this.goal = "flee";
      this.targetOwner = -1;
      this.fleeX = threat.x;
      this.fleeY = threat.y;
      return;
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
      return;
    }

    if (Math.random() < this.idleChance) this.idleTimer = rand(0.25, 0.8);

    // 6) Otherwise keep growing: CARVE an UN-shielded bordering rival, or EXPAND into
    //    neutral. (Carving a capital-shielded rival is blocked, so we skip those.)
    if (this.goal !== "expand" && this.goal !== "carve") {
      this.startClaim(world, threat, shielded);
    } else if (this.phase === "done") {
      this.startClaim(world, threat, shielded);
    } else if (Math.random() < this.mistakeChance) {
      this.startWander(world); // human fumble: drop the claim
    }
  }

  /** Begin a claim loop — carve a bordering rival once established, else expand into open ground. */
  private startClaim(world: BotWorld, threat: BotOther | null, shielded: Set<number>): void {
    this.targetOwner = -1;
    if (!this.haveHome) { this.startWander(world); return; }
    const self = world.self;
    // Only an established bot goes carving, and only at REAL adjacent enemy land whose owner
    // ISN'T shielded by a powered capital (those loops would be blocked) — otherwise loops
    // fail and growth stalls.
    let carve: Pt | null = null;
    if (self.army >= CARVE_MIN_ARMY && Math.random() < this.carveAppetite) {
      carve = findEnemyFrontier(world.cells, self.x, self.y, self.ownerId, shielded);
    }
    this.goal = carve ? "carve" : "expand";
    this.phase = "exit";
    this.phaseTimer = 0;
    this.turnSign = Math.random() < 0.5 ? 1 : -1;
    this.cruise = rand(this.throttleLo, this.throttleHi);
    this.swept = 0;
    this.sweepTarget = rand(0.55, 1.2) * Math.PI;
    if (carve) {
      // Aim the loop so its swept arc straddles the enemy frontier, sized to reach across
      // it — the enclosed region then inherits their cells.
      const ang = Math.atan2(carve.y - this.homeY, carve.x - this.homeX);
      const dist = Math.hypot(carve.x - this.homeX, carve.y - this.homeY);
      this.outAngle = ang - this.turnSign * this.sweepTarget * 0.5;
      this.orbitR = Math.max(this.loopRLo, Math.min(dist * 1.15, 560));
    } else {
      this.orbitR = rand(this.loopRLo, this.loopRHi);
      if (threat) {
        const away = Math.atan2(this.homeY - threat.y, this.homeX - threat.x);
        this.outAngle = away + (Math.random() - 0.5) * 1.2;
      } else {
        this.outAngle = Math.random() * TAU;
      }
    }
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
        // Stop defending once they've left our soil (or vanished) — back to claiming.
        if (!t || !onLand(world.cells, t.x, t.y, self.ownerId)) { this.goal = "expand"; this.phase = "done"; return this.computePlan(world, dt); }
        return { angle: Math.atan2(t.y - self.y, t.x - self.x), throttle: 1, drawing: false };
      }
      case "gang": {
        const t = world.others.find((o) => o.ownerId === this.targetOwner);
        // Break off if the giant died, dropped out of the top-3, or fled their own home.
        if (!t || !world.topIds.has(this.targetOwner) || onLand(world.cells, t.x, t.y, t.ownerId)) {
          this.goal = "expand"; this.phase = "done"; return this.computePlan(world, dt);
        }
        return { angle: Math.atan2(t.y - self.y, t.x - self.x), throttle: 1, drawing: false };
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
        const t = world.others.find((o) => o.ownerId === this.targetOwner);
        if (!t || t.army > self.army * 0.85 || onLand(world.cells, t.x, t.y, t.ownerId)) {
          this.goal = "expand"; this.phase = "done"; return this.computePlan(world, dt);
        }
        return { angle: Math.atan2(t.y - self.y, t.x - self.x), throttle: 1, drawing: false };
      }
      case "siege": {
        const t = world.others.find((o) => o.ownerId === this.siegeOwner);
        // Done once the capital is drained / gone — then go take that now-unshielded land.
        if (!t || t.capPower <= 0) { this.goal = "expand"; this.phase = "done"; return this.computePlan(world, dt); }
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
        return { angle: Math.atan2(capy - self.y, capx - self.x), throttle: this.throttleHi, drawing: false };
      }
      case "wander": {
        const dx = this.wanderX - self.x;
        const dy = this.wanderY - self.y;
        if (dx * dx + dy * dy < 60 * 60) this.startWander(world);
        return { angle: Math.atan2(dy, dx), throttle: this.throttleLo, drawing: false };
      }
      case "carve":
      case "expand":
      default:
        return this.loopPlan(world, dt);
    }
  }

  /** The claim maneuver: leave home, orbit it in a wavy loop, then cut back in to close. */
  private loopPlan(world: BotWorld, dt: number): { angle: number; throttle: number; drawing: boolean } {
    const self = world.self;
    this.phaseTimer += dt;
    const dx = self.x - this.homeX;
    const dy = self.y - this.homeY;
    const dist = Math.hypot(dx, dy) || 0.001;

    if (this.phase === "exit") {
      if (this.phaseTimer > 5) { this.startWander(world); return { angle: this.heading, throttle: 0.3, drawing: false }; }
      if (self.stateTag === "WILD" && dist >= this.orbitR * 0.8) {
        this.phase = "arc";
        this.phaseTimer = 0;
        this.swept = 0;
        this.orbitR = Math.max(this.orbitR, dist);
        this.lastPhi = Math.atan2(dy, dx);
      }
      return { angle: this.outAngle, throttle: this.cruise, drawing: true };
    }

    if (this.phase === "arc") {
      const phi = Math.atan2(dy, dx);
      this.swept += Math.abs(angDiff(this.lastPhi, phi));
      this.lastPhi = phi;
      const targetPhi = phi + this.turnSign * 0.6;
      const wob = Math.sin(this.swept * 2.3) * this.orbitR * 0.1; // hand-drawn waviness
      const rr = this.orbitR + wob;
      const tx = this.homeX + Math.cos(targetPhi) * rr;
      const ty = this.homeY + Math.sin(targetPhi) * rr;
      if (this.swept >= this.sweepTarget || this.phaseTimer > 9) { this.phase = "home"; this.phaseTimer = 0; }
      return { angle: Math.atan2(ty - self.y, tx - self.x), throttle: this.cruise, drawing: true };
    }

    if (this.phase === "home") {
      if (self.stateTag === "HOME") this.phase = "done";
      if (this.phaseTimer > 6) { this.phase = "done"; return { angle: this.heading, throttle: 0.3, drawing: false }; }
      return { angle: Math.atan2(this.homeY - self.y, this.homeX - self.x), throttle: this.throttleHi, drawing: true };
    }

    return { angle: this.heading, throttle: 0.25, drawing: false };
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
