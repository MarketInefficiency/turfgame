# Network Protocol

Transport: **Colyseus** over WebSocket (uWebSockets.js transport). Default server port `2567`
(behind nginx/WSS in production — see deployment.md). The Colyseus client SDK (`colyseus.js`) is used
on the front end so both sides share message/state definitions.

---

## 1. Joining (the three start-screen options)

| Start-screen option | Colyseus call (conceptual) | Notes |
|---|---|---|
| Join specific room | `client.joinById(roomId, { name, ... })` | error if missing/full |
| Join random room | `client.joinOrCreate(ROOM_NAME, { name })` | matchmakes into any open room, else creates |
| Create new room | `client.create(ROOM_NAME, { name })` | returns a room whose id can be shared |

- Join options payload includes the player's `name`. The server assigns `color` on join
  (random, non-black/white — see ui-ux §2). Do not let the client choose color in v1.
- On join the server sends the player their id and a **full territory snapshot** (one-time), then
  switches to deltas.

---

## 2. Client → Server (inputs only; server is authoritative)

Send a compact **input packet per client tick** (or on change), e.g.:
```
INPUT {
  seq: number          // client sequence # for reconciliation
  aimX: number         // cursor offset from avatar, x  (direction + magnitude → speed)
  aimY: number         // cursor offset from avatar, y
  drawing: boolean     // true while LEFT mouse button is held (claiming)
}
```
- The server derives movement (speed capped by the size→speed curve) and extends/closes the claim
  trail from `drawing`. The client never asserts position, captures, kills, or army.
- Keep inputs small and frequent; rely on `seq` for client-side reconciliation.

---

## 3. Server → Client

### a) Colyseus schema state (auto delta-synced)
```
RoomState {
  dayNightPhase: number            // 0..1 canonical time-of-day
  players: Map<id, Player>
}
Player {
  id, name, color
  x, y
  army: number
  state: "HOME" | "WILD"
  drawing: boolean
  alive: boolean
  // trail points may live here if small, or in the grid channel
}
```
- Leaderboard can be derived client-side from `players` (sort by `army`) or sent as a small
  precomputed top-N field.

### b) Territory grid — custom binary message (hand-rolled deltas)
- `GRID_SNAPSHOT` (on join): compressed full grid of cell→owner.
- `GRID_DELTA` (per tick): only changed cells, compact binary, e.g. pairs of `[cellIndex, ownerId]`
  (consider run-length/region encoding for big captures/severs). Reserve `ownerId = 0` for NEUTRAL.

### c) Events (server → the affected client / room)
- `YOU_DIED` → trigger the death→start-screen flow (ui-ux §5).
- `CLAIM_VOIDED` → the local player's in-progress claim was invalidated (someone crossed the line).
- `CAPTURED` / `SEVERED` (optional) → for juice/feedback.

---

## 4. Authority & anti-cheat checklist
- Validate every claim loop server-side (geometry + contiguity) before applying.
- Resolve all combat and decay on the server; clients only render outcomes.
- Clamp/validate movement against the size→speed curve; ignore impossible inputs.
- Rate-limit inputs; treat the client purely as an input device + renderer.

---

## 5. Tick & bandwidth
- Server simulation tick: `TICK_RATE ~ 20 Hz` `(tunable)`.
- Broadcast deltas at tick rate; never resend unchanged grid cells or full state.
- Interpolate other players on the client between received states; predict only the local avatar.
