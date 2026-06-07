# Territory.io — Game Design Ruleset & Build Spec
*(working title — rename freely)*

> Context document for an AI coding agent. This describes a 2D, browser-based, join-anytime
> multiplayer territory game. Read the **Design Pillars** first — they explain *why* each rule
> exists. When a rule and a pillar seem to conflict, the pillar wins. Default numeric values are
> marked `(tunable)` and are starting guesses for playtesting, not final.

---

## 1. Elevator pitch

A real-time `.io` game where every player is an identical circle that steers around a large open
2D map. You claim territory by drawing loops; claimed land *is* your score *is* your army (one
number). You fight by bumping into people in the open wilderness, where the smaller army loses.
Your own claimed land is an instant-kill fortress. Grow too large and your kingdom decays faster
and faster, so you can never sit still — you must keep conquering. There are no rounds: join
anytime, respawn instantly on death, climb a live leaderboard.

---

## 2. Design pillars (intent — preserve these above all)

1. **2-second start.** Click → playing. No signup, no tutorial, no lobby.
2. **5-second comprehension.** The entire game is legible at a glance: a circle with a number,
   colored land, draw a loop to claim. All depth is emergent, never in the rules text.
3. **Score is exposure.** Being big must create vulnerability, not comfort. Every "bigger"
   advantage is paired with a "bigger" cost.
4. **Tiny punishment, instant retry.** Death costs only time. Respawn is immediate.
5. **David & Goliath.** A small skilled player must always have a path to bleed or topple a giant.
6. **Rise and fall in minutes.** No one can turtle to victory or snowball to own the map. The
   system must drag everyone back toward the middle.
7. **Self-healing world.** Dead/abandoned land returns to neutral so the map never locks up.

---

## 3. Core entities & authoritative state

The **server is authoritative** for all of the following. Clients render and predict only.

### Player avatar
- `id`, `skinId`, `color`
- `position` (x, y in world units), `velocity`
- `army` (integer — the unified score/size/strength number; see §5)
- `state`: `WILD` (outside own territory) or `HOME` (inside own territory)
- `drawing`: bool (is the claim line currently being drawn)
- `trail`: ordered list of points for the in-progress claim line (empty unless drawing)
- `alive`: bool

### Territory
- The map is a **grid of cells**. Each cell stores `owner` = playerId or `NEUTRAL`.
- A player's territory = the set of cells they own. **Must always be one connected component**
  (see §7, Contiguity).
- `army` is kept consistent with owned-cell count (see §5).

### World
- One large **bounded** 2D plane (walled edges for v1; not toroidal). Empty space = **wilderness**.
- Runs as independent **shards/instances**, each capped at a player count `(tunable: 60)`.

---

## 4. Movement (agar.io style)

- The cursor's **offset from the avatar/screen center** sets direction and speed: far = fast,
  near = slow, **dead center = stationary**, capped at a max speed.
- **Smaller army = faster.** Base max speed scales inversely with `army`. A small player can
  outrun a large one — this is the underdog's escape tool, so it must feel reliable.
  - Suggested formula: `maxSpeed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * (K / (K + army))`
    `(tunable: SPEED_MAX, SPEED_MIN, K)`.
- **There is no sprint.** The size–speed curve already provides escape; do not add a stamina/dash
  system (it was considered and cut to protect pillar #2).
- Movement speed is **the same whether or not you are drawing** a claim line `(default; tunable)`.

---

## 5. The unified quantity: score = area = army

- A single integer, `army`, is simultaneously the player's **score**, their **territory size**,
  and their **combat strength**.
- Fixed conversion: **1 army ≈ 1 owned cell** `(tunable: AREA_PER_ARMY = 1)`. Claiming N cells
  adds N army; losing N army removes N cells.
- This number is **printed in the center of the avatar circle** and is the single source of truth
  for strength, visible to all players (see §11).

---

## 6. Camera / zoom (location-based, NOT size-based)

- **The avatar is always the same fixed size on screen for everyone.** Players never grow a bigger
  body; growth shows only as territory + the center number.
- Zoom depends on **where you are**, not how big you are:
  - `HOME` (standing inside your own claimed territory): camera **zooms out** to a management/survey
    view scaled to fit your kingdom, clamped to a min zoom `(tunable: ZOOM_HOME_MIN = 0.4)`.
  - `WILD` (outside your territory): **standard shared zoom**, identical for every player
    `(tunable: ZOOM_WILD = 1.0)`.
- Transition smoothly when crossing your own border. Consequence by design: in the wild a giant
  and a nobody look and move identically — the wilderness is the great equalizer.

---

## 7. Claiming territory

### Drawing
- **Hold left mouse button to draw** a claim line, beginning when you leave your own territory.
- You must be **moving** to extend the line. Releasing left-click, dying, or dead-ending ends the
  attempt.
- Not drawing = **no trail**; you can move through the wild/enemy land freely (but you are still a
  body subject to combat — see §8).

### Capture (the one law)
> **You only ever GAIN land by closing a loop back into your own connected territory.**

- When the line returns to your own territory, **flood-fill the enclosed region**; every enclosed
  cell — neutral **or** enemy — becomes yours. Add the captured cell count to `army`.

### Drawing over enemy territory — two outcomes
1. **Loop closes back home → INHERIT.** All enclosed enemy cells become yours.
2. **Line does NOT close** (released early / killed / dead-ends in the open) → **no capture**.
   Every enemy cell the line passed through is **stripped to NEUTRAL**. If that strip disconnects
   part of the enemy kingdom, the orphaned piece **also becomes neutral** (see Severing).

### Contiguity (hard invariant)
- A player's territory must remain a **single connected component** at all times.
- Therefore you can only carve into an enemy you **already border** — there are no claims dropped
  inside the middle of someone's land. The map naturally forms front lines.
- **Severing:** if any operation (a capture loop, a slash, decay, or combat loss) leaves a player
  holding disconnected pieces, the component containing their **spawn/core cell** is kept; all
  other components are resolved as follows:
  - Severed by a **closed capture loop** of an attacker adjacent to it → **inherited by that
    attacker** (counts toward their army immediately).
  - Severed by a **non-looping slash**, by decay, or otherwise → **becomes NEUTRAL**, claimable
    by any adjacent player on a future loop.

### Claim-line collisions (non-lethal)
- If a player's **body** touches another player's **in-progress claim line** (before it's claimed),
  the **claim is voided** — the drawer must redo it. **No one dies.** This intentionally replaces
  the genre-standard "cross the trail = instant death."

---

## 8. Combat

### Wilderness — subtractive, rate-based
- Triggered by **body-to-body contact** between two avatars where the contacted ground is **not the
  defender's home** (i.e., out in neutral/wild or on a third party's land).
- While two bodies stay in contact, **both armies drain at the same absolute rate**
  `(tunable: DRAIN_RATE = 25 army/sec each)`.
- The **smaller army reaches zero first and dies** (pops); the larger survives reduced by however
  much drained. Example: 500 vs 50 held to depletion → `dead` vs `450`.
- Either player may **break contact at any time** (the smaller is faster, so it controls
  disengagement). Both keep their reduced values.
- **Equal armies** locked to depletion → **both die**.
- Army lost in combat **sheds the equivalent number of cells from the loser's frontier** back to
  neutral — specifically the cells **furthest from that player's current position / core**
  (most overextended edges first). This preserves contiguity automatically `(default; tunable)`.

### Home — instant elimination
- On a player's **own claimed land**, contact with the owner = **instant kill of the intruder**;
  the owner loses nothing. This is the **only binary-death rule** in the game. The interior of any
  kingdom is a death zone when its owner is near.

### Summary table
| Body A | Body B | Where | Result |
|---|---|---|---|
| any | any | wilderness / neutral | subtractive drain; smaller dies, larger reduced |
| intruder | land owner | on the owner's territory | intruder dies instantly, owner unharmed |
| any body | an in-progress claim line | anywhere | claim voided, redo; nobody dies |

---

## 9. Decay & the soft size ceiling

A single merged decay system does two jobs (anti-turtle + anti-snowball):

- Below a size **threshold** `(tunable: DECAY_THRESHOLD = 500)`: **no passive decay**. Small
  kingdoms are safe to hold.
- Above the threshold: the kingdom **passively shrinks**, and the rate **accelerates** the further
  above threshold you are.
  - Suggested: `decayPerSec = DECAY_C * max(0, army - DECAY_THRESHOLD) ^ DECAY_EXP`
    `(tunable: DECAY_C = 0.05, DECAY_EXP = 1.5)`.
- Decay **removes cells from the least-defended frontier first** — the edges furthest from the
  player's current avatar position. Being present at a border therefore protects it; neglected
  sprawl crumbles. (This merges the earlier "you can only defend where you stand" idea into one
  rule.)
- **Emergent results (intended):** every player has a natural max sustainable size where
  claim-rate = decay-rate; no one can own the whole map; swallowing a giant via inheritance is
  temporary unless actively defended ("the crown is heavy"); turtling a large kingdom is impossible.

---

## 10. Death & respawn

- A player dies when `army` hits 0 (combat) or by home instant-kill.
- **Respawn is instant**: a fresh avatar with starting army `(tunable: START_ARMY = 10)` and a
  small starting territory, placed at a safe open spawn point.
- On death, the dead player's territory **rapidly decays to neutral** `(tunable: fast decay rate)`,
  creating a scramble for neighbors and keeping the map self-healing.

---

## 11. Identity & rendering

> Visual/presentation specifics (start screen, random color palette, the circle's
> contrasting border, the day/night cycle, death → start screen) live in **`docs/ui-ux.md`**.
> This section covers the gameplay-facing identity rules only.

- **Avatar:** a fixed-size circle, same size for all, wearing the player's `skin`/`color`, with the
  **`army` number printed in its center**. This number is the only public tell of strength.
  - Abbreviate large numbers to stay legible inside the circle: `1.2k`, `18k`, `1.1m`
    `(tunable thresholds)`.
- **Territory:** rendered in the player's skin/color. Two players may share a skin (so land can
  look identical between players).
- **Private golden outline:** a gold border is drawn around **your own** claimed territory,
  **visible only to you** (client-side only — never sent as a public marker). It solves "which land
  is mine?" when skins collide, without broadcasting ownership to opponents.
  - The outline **tracks your borders live** as they grow, shrink, fray, sever, or decay, including
    briefly showing a piece that is about to be severed/neutralized.
- **Information split (by design):** strength is **public** (center number); territory ownership is
  **private** (your gold ring). Opponents must watch movement to learn whose kingdom is whose.

---

## 12. Meta: leaderboard, status, retention

- **Live leaderboard** ranked by current `army` (top N), always visible.
- Status in the game = being big; turtling a small safe blob is possible but irrelevant to ranking.
- Retention hooks (post-MVP): daily "biggest empire" board, unlockable skins/colors (rewarded-video
  friendly), seasonal map themes, personal-best stats.
- Monetization is **out of scope for the prototype**; build the game fun first.

---

## 13. Tuning knobs (single source for balance)

Expose all of these as a config object so they can be changed without touching logic.

| Knob | Default | Meaning |
|---|---|---|
| `AREA_PER_ARMY` | 1 | cells gained/lost per army point |
| `START_ARMY` | 10 | army on spawn |
| `SPEED_MAX` | high | max base speed (smallest player) |
| `SPEED_MIN` | ~50% of MAX | base speed floor (largest players) |
| `K` (speed curve) | tune | controls how fast speed falls off with size |
| `ZOOM_WILD` | 1.0 | shared zoom outside own territory |
| `ZOOM_HOME_MIN` | 0.4 | most zoomed-out the home view goes |
| `DRAIN_RATE` | 25 /s | per-side army drain during wilderness combat |
| `DECAY_THRESHOLD` | 500 | army size where passive decay begins |
| `DECAY_C` | 0.05 | decay coefficient |
| `DECAY_EXP` | 1.5 | decay acceleration exponent (>1 = accelerating) |
| `DEATH_DECAY_RATE` | fast | how quickly a dead player's land neutralizes |
| `TICK_RATE` | 20 Hz | server simulation rate |
| `PLAYERS_PER_SHARD` | 60 | cap before a new instance spins up |
| `MAP_SIZE` | e.g. 4000×4000 | world dimensions (bounded) |
| `GRID_CELL` | e.g. 16 | world units per territory cell |

---

## 14. Technical architecture notes

- **Authoritative server.** Validate movement, claim loops, combat, decay, and contiguity
  server-side. Never trust the client for captures or kills (anti-cheat).
- **State model:** a 2D ownership grid (`Uint32`/typed array of owner ids per cell) + a list of
  player structs. This is cheap to simulate and cheaper than a precise-physics shooter — lean into
  a **modest tick rate** (territory play isn't twitch-frame-sensitive).
- **Key algorithms to implement:**
  - *Loop capture:* point-in-polygon / flood-fill of the enclosed region when a trail rejoins owned
    cells.
  - *Contiguity & severing:* connected-components on the owner grid after any ownership change; keep
    the component with the spawn cell, resolve others per §7.
  - *Frontier shedding:* when army drops (combat/decay), remove cells ordered by distance from the
    player's avatar/core, outermost first, maintaining contiguity.
- **Networking:** WebSocket; server broadcasts deltas (changed cells + player states) per tick.
  Client interpolates positions and predicts own movement.
- **Client:** HTML5 Canvas or WebGL. Render: territory layer (colored cells) → avatars (circles +
  centered numbers) → local-only gold outline overlay → HUD (leaderboard, your number).
- **Self-healing:** a background pass decays dead/abandoned land to neutral.
- Designed to be **server-cost-friendly** (grid state, low tick) — this matters for an ad-funded
  `.io` game. Keep per-shard player counts bounded.

---

## 15. Suggested build order (MVP first, then layers)

**MVP (prove the core loop is fun):**
1. Bounded map, multiplayer connection, fixed-size avatar circles with centered numbers.
2. Agar-style movement with the size–speed curve.
3. Left-click draw + **loop capture on neutral land only**; army/score tied to owned cells.
4. Location-based zoom (home vs wild).
5. Instant respawn; dead land decays to neutral.
6. Live leaderboard.

**Layer 2 (the conflict):**
7. Carving into bordering enemies: loop = inherit, slash = neutralize.
8. Contiguity invariant + severing resolution.
9. Wilderness subtractive combat (numbers tick down live in the circle centers).
10. Home instant-kill; claim-line collision = void (non-lethal).

**Layer 3 (the balance + polish):**
11. Merged accelerating overgrowth decay + frontier shedding.
12. Skins, and the private gold outline.
13. Number abbreviation, camera smoothing, juice/feedback.
14. Retention meta (daily boards, unlockables).

---

## 16. Defaults for previously-open questions

So the implementation doesn't have to guess:
- **Drawing does not change movement speed** (tunable later).
- **Lost cells shed from the frontier furthest from the avatar/core**, outermost first.
- **Map is walled/bounded** (not toroidal) for v1.
- **No sprint / stamina system** at all.
- **Reinforcement = presence:** standing at a frontier protects it because decay and shedding both
  target the edges furthest from you; no separate regrowth mechanic for v1.
- **Gold outline is strictly client-side and private** to the owning player.
