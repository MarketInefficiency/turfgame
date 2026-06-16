/**
 * The single source of truth for every balance and presentation constant.
 * Logic everywhere (server authority + client prediction + rendering) reads from
 * this object — there must be no magic numbers in logic. See game-spec.md §13 and
 * ui-ux.md §4. Values marked from the spec are starting guesses for playtesting.
 */
export const CONFIG = {
  // --- Core unified quantity (game-spec §5) ---
  AREA_PER_ARMY: 1, // owned cells gained/lost per army point
  START_ARMY: 10, // army on spawn

  // --- Movement & size→speed curve (game-spec §4) ---
  // maxSpeed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * (K / (K + army))
  SPEED_MAX: 320, // world units/sec for the smallest player
  SPEED_MIN: 160, // floor for the largest players
  SPEED_K: 800, // how fast speed falls off with size

  // --- Camera / zoom (game-spec §6) ---
  ZOOM_WILD: 1.5, // shared zoom outside own territory
  ZOOM_HOME_MIN: 0.7, // most zoomed-out the home survey view goes (half the zoom-out it used to)

  // --- Combat (game-spec §8) ---
  DRAIN_RATE: 25, // army/sec drained from each side in wilderness contact
  COMBAT_CONTACT_DIST: 44, // world-unit distance for body-to-body contact (~2× avatar radius)

  // --- Decay & soft ceiling (game-spec §9) ---
  DECAY_THRESHOLD: 5000, // army size where passive decay begins
  DECAY_C: 0.0002, // decay coefficient (gentle: big empires only bleed once very large)
  DECAY_EXP: 1.5, // decay acceleration exponent (>1 = accelerating)
  // Lost land (shed/sever/decay/death) turns to grey rubble, holds briefly so the crumble reads,
  // then dissolves to neutral. Each cell dissolves on its OWN clock (CRUMBLE_DWELL plus a per-cell
  // jitter up to CRUMBLE_WAVE) — there is no shared rate cap, so a patch disintegrates progressively
  // yet multiple empires that fall at the same instant crumble together instead of one after another.
  CRUMBLE_DWELL: 0.12, // seconds a rubble cell is guaranteed grey before it can dissolve
  CRUMBLE_WAVE: 0.35, // extra per-cell stagger so a patch crumbles progressively (max grey = DWELL + WAVE)
  CONTIG_SWEEP_SEC: 1.0, // how often the server re-asserts territory contiguity (seconds)

  // --- World & simulation (game-spec §3, §13) ---
  TICK_RATE: 20, // server simulation Hz
  PLAYERS_PER_SHARD: 50, // hard cap on players (humans + bots) per arena; new arena past this
  MAP_WIDTH: 4000, // world units (bounded, walled)
  MAP_HEIGHT: 4000,
  GRID_CELL: 16, // world units per territory cell

  // --- Day/night cycle (ui-ux.md §4) ---
  DAY_NIGHT_PERIOD: 300, // seconds for a full day↔night cycle
  // Quick fade so the floor spends as little time as possible at the washed-out gray midpoint
  // (white→black passes through gray); day holds bright white, night holds black, the gray is brief.
  DAY_NIGHT_TRANSITION: 10, // seconds of lerp between day and night
  DAY_BG: "#ffffff", // floor background by day
  NIGHT_BG: "#000000", // floor background by night
  DAY_LINES: "#cccccc", // grid lines by day (grey)
  NIGHT_LINES: "#8a4fff", // grid lines by night (purple)
  DAY_BORDER: "#1d2430", // avatar border by day (dark, contrasts white floor)
  NIGHT_BORDER: "#e8eaed", // avatar border by night (light, contrasts black floor)
  NIGHT_GLOW: "#ffe2a6", // warm light radiating from avatars/territory at night (additive)

  // --- Movement input & netcode (control feel; game-spec §4, architecture.md) ---
  AIM_DEADZONE: 6, // cursor offset (screen px) below which the avatar is stationary
  AIM_FULL_SPEED_DIST: 220, // cursor offset (screen px) at which max speed is reached
  // Touch only: thumb-drag radius (screen px) that maps to full speed. The on-screen joystick
  // scales this up to AIM_FULL_SPEED_DIST so a comfortable thumb reach = max speed, feeding the
  // exact same aim packet as the mouse (server/sim are unchanged).
  JOY_RADIUS: 70,
  INPUT_SEND_HZ: 20, // client input-packet rate
  INPUT_STALE_SEC: 0.5, // stop applying a stored input older than this (anti ghost-glide)
  PREDICT_CORRECT: 4, // how hard local prediction is pulled toward server truth (per sec)
  INTERP_RATE: 14, // how fast remote avatars interpolate toward their latest state (per sec)
  ZOOM_LERP: 5, // how fast the camera eases between wild/home zoom levels (per sec)

  // --- Spawning ---
  SPAWN_MARGIN: 200, // keep spawns this far from the map walls
  START_TERRITORY_RADIUS: 3, // starting territory = filled disc of this cell radius
  SPAWN_TRIES: 40, // random spawn attempts before scanning for any clear wilderness spot
  TRAIL_MAX_CELLS: 6000, // safety cap on an in-progress claim trail

  // --- Rendering (presentation constants; architecture.md) ---
  AVATAR_RADIUS: 22, // base on-screen avatar radius in px (never scales with army/zoom)
  // On-screen avatar size blends with the camera: full size in the wild, smaller in the zoomed-out
  // home survey view (so it doesn't dwarf your own territory).
  AVATAR_SCALE_WILD: 1.6,
  AVATAR_SCALE_HOME: 0.7,
  FLOOR_GRID_STEP: 64, // px between floor grid lines (visual; coarser than GRID_CELL)
  LEADERBOARD_SIZE: 10, // how many players the live leaderboard shows (top N by army)
  GOLD_OUTLINE: "#ffd24a", // private owner-only border around your own territory (game-spec §11)
  ENEMY_OUTLINE: "#101216", // black border drawn around every OTHER player's territory
  SWORD_COLOR: "#ffcf3f", // golden combat icon shown over players fighting in the wild
  CROWN_GOLD: "#ffd24a", // crown for the #1 player on the leaderboard
  CROWN_SILVER: "#cfd6dd", // crown for #2
  CROWN_BRONZE: "#d08a3e", // crown for #3

  // --- Foliage / concealment terrain ---
  FOLIAGE_DENSITY: 0.04, // target fraction of cells that are foliage (trees/mountains)
  FOLIAGE_CLUSTER_AVG: 5, // average cells per organic foliage clump
  FOLIAGE_TREE_RATIO: 0.6, // fraction of clumps that are trees (the rest are mountains)
  FOLIAGE_HIDE_ALPHA: 0.45, // opacity of YOUR OWN avatar while concealed (self-feedback)
  TREE_COLOR: "#2f8f3e", // tree canopy fill
  MOUNTAIN_COLOR: "#8a8f98", // mountain fill
  WILDERNESS_COLOR: "#2fbf5e", // zone banner color for neutral/wild ground

  // --- AI players (server-only bots that fill quiet arenas so it never feels empty) ---
  // Bots are real Player entities driven by synthetic inputs through the same sim as
  // humans, so they're indistinguishable on the wire. They're all SMART players (no
  // difficulty tiers); their behaviour/"feel" lives in server/src/bots/brain.ts. These
  // are the population-level knobs.
  // RANDOM-room (joinOrCreate) that creates a fresh arena: drop in this many bots that
  // ALREADY HAVE TURF, so it looks like an established game the player is joining into.
  BOT_COUNT_MIN: 10,
  BOT_COUNT_MAX: 25,
  BOT_ESTABLISHED_ARMY_MIN: 40, // smallest pre-grown kingdom (owned cells) for an established bot
  BOT_ESTABLISHED_ARMY_MAX: 380, // largest — grown as an organic blob, not a perfect circle
  // CREATE-room: trickle bots in (like players arriving) until the arena holds this many
  // total players, then stop; respawns keep it populated thereafter.
  BOT_CREATE_FILL_MIN: 15,
  BOT_CREATE_FILL_MAX: 20,
  BOT_CREATE_INTERVAL_MIN: 1.2, // seconds between trickle arrivals
  BOT_CREATE_INTERVAL_MAX: 3.5,
  BOT_RESPAWN_MIN: 1.5, // seconds a downed bot waits before "rejoining" (human-like)
  BOT_RESPAWN_MAX: 5.0,

  // --- Medals (soft currency) ---
  // Awarded on defeat = floor(peakPower / MEDAL_DEFEAT_DIVISOR). Lean: a big run nets only a
  // handful, so cosmetics are mostly a purchase (premium-forward). Server-authoritative.
  MEDAL_DEFEAT_DIVISOR: 500,

  // --- Spawn protection ---
  SPAWN_IMMUNITY_SEC: 3, // grace period after (re)spawn: can't kill or be killed (avatar blinks)

  // --- Capitals (power points) ---
  // Each spawn places a capital on the core cell. It gains power points equal to the cells
  // you take off opponents in wilderness skirmishes. While a capital has power its land
  // can't be looped/severed — attackers must drain it by overlapping it (a siege), which
  // transfers its points to the attacker's own capital.
  SIEGE_RATE: 45, // capital power drained per second while overlapping an enemy capital
  CAPITAL_COLOR: "#d7dde5", // stone fill of the castle icon
  CAPITAL_EDGE: "#262b33", // castle outline (kept dark for visibility on any territory)
  // Capital power above this threshold passively decays (accelerating), a soft ceiling.
  CAP_DECAY_THRESHOLD: 2000,
  CAP_DECAY_C: 0.003,
  CAP_DECAY_EXP: 1.3,
} as const;

export type Config = typeof CONFIG;
