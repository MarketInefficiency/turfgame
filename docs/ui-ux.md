# UI / UX & Presentation Spec

Covers everything the player sees and interacts with outside the core simulation rules
(those live in `game-spec.md`). Default values are `(tunable)` starting guesses.

---

## 1. Start screen (entry)

- On page load, the start screen **fades in** (opacity 0 → 1, ~`500ms` ease, `(tunable)`).
- A **centered modal box** containing, top to bottom:
  1. Game title / logo (placeholder art is fine for now).
  2. **Name input** — a text field for the player's display name. Pre-filled from the last
     session if available (see §5). Reasonable max length (e.g., 16 chars) and basic sanitization.
  3. **Room selection** — three options:
     - **Join a specific room:** a field to enter a room ID/code → join that exact room.
     - **Join a random room:** matchmake into any room with open space (create one if none exist).
     - **Create a new room:** spin up a fresh room, join it, and surface its ID so it can be shared.
  4. **Play / Join button.**
- On successful join: start screen **fades out**, the game view **fades in**.
- Validation: require a non-empty name (fall back to a random guest name if empty). Show a friendly
  message if a specific room ID is invalid/full.
- Room flow maps directly to Colyseus matchmaking (see `protocol.md`): join-by-id, join-or-create
  (random), and create.

---

## 2. Skins (simple for v1)

- On join, the player is assigned a **single random color** used for BOTH the avatar circle and
  their claimed territory.
- **Banned colors: pure black and pure white — and near-black / near-white.** This is mandatory:
  the floor cycles from white (day) to black (night), so extreme-luminance skins would vanish.
- Generate from a curated mid-tone palette so colors pop on both white and black backgrounds.
  Suggested rule: HSL with **saturation 60–85%** and **lightness 45–62%** `(tunable)`, any hue.
  Reject anything outside that lightness band.
- The avatar's center **number text** must auto-contrast with the fill (pick near-black or
  near-white text based on the fill's luminance).
- Future (not now): selectable/unlockable skins, patterns. Keep the system a single `color` field
  for v1 so it's trivial to extend later.

---

## 3. The avatar

- A **circle of fixed on-screen size for every player** (size never represents army — the number does).
- Fill = the player's skin color.
- **A clear, contrasting border** around the circle so it never blends into the floor. Because the
  floor changes between day and night, the **border color flips with the day/night phase**: a dark
  outline during day (contrasts the white floor), a light outline at night (contrasts the black
  floor). Interpolate the border color alongside the cycle so it's always visible.
- The army **number is printed in the center** of the circle, abbreviated at scale (`1.2k`, `18k`).
- Only the owner sees the private **gold outline** around their *territory* (see game-spec §11) —
  that is separate from the avatar's border and is client-side only.

---

## 4. Floor & day/night cycle

### The floor
- The backdrop is a **grid**. By **day**: white background, **grey** grid lines.

### The cycle
- A **timed day/night cycle**, the same for everyone in a room (**room-synced**, server-authoritative
  timing — see `protocol.md`). The server owns the canonical phase; clients interpolate for smoothness.
- **Day → Night transition:** the background **slowly lerps white → black**, and the grid lines
  **slowly lerp grey → purple**. **Night → Day:** reverse back to white background / grey lines.
- Make the **full cycle length** and the **transition duration** tunable
  `(e.g., DAY_NIGHT_PERIOD = 5 min, TRANSITION = 30 s)`.
- Color targets `(tunable)`:
  - Day background `#FFFFFF`, day lines `#CCCCCC` (grey).
  - Night background `#000000`, night lines `~#8A4FFF` (purple).
- The cycle is purely cosmetic for v1 (no gameplay effect). It exists for atmosphere and is the
  reason black/white skins are banned.

---

## 5. Death → return to start screen

- When the local player dies (army hits 0, or killed on enemy home soil), the game view **fades out**
  and the **start screen fades back in**.
- The **name field is pre-filled** with the name the player last used. Persist the name **client-side
  in `localStorage`** (this is a real web app, not a sandboxed artifact, so `localStorage` is fine).
- Optionally also remember the last room choice for convenience, but at minimum remember the name.
- Re-joining uses the same flow as §1.

---

## 6. In-game HUD (from game-spec §12 — summarized)

- **Live leaderboard** (top N by army) visible on screen.
- The player's own army number is always legible (it's on their avatar; a corner readout is optional).
- Keep the HUD minimal and unobtrusive — protect the 5-second-comprehension pillar.

---

## 7. Transitions summary

| Trigger | Effect |
|---|---|
| Page load | Start screen fades in |
| Join success | Start screen fades out, game fades in |
| Day↔Night | Background and grid lines lerp between color sets; avatar borders flip |
| Local death | Game fades out, start screen fades in with name pre-filled |
