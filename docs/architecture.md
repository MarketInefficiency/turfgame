# Architecture

## Environments (dev vs production — config, not branches)
Two run modes share one codebase; only configuration differs.

- **Local development (`npm run dev`):** server + client run on `localhost` with hot reload. Client
  connects to `ws://localhost:2567` (plain WebSocket, no TLS, no nginx). Opening multiple browser
  tabs/windows lets several players join the **same room** for real multiplayer testing on one machine.
- **Production (VPS):** same build deployed behind nginx with WSS; client connects to
  `wss://<domain>/colyseus`. See `deployment.md`.

Implementation rules:
- Client server URL = `import.meta.env.VITE_SERVER_URL` (Vite env), defaulting to `ws://localhost:2567`.
- Server host/port and secrets come from env (`.env` + committed `.env.example`).
- The room join/matchmaking code path is identical in both; only the connection target changes.
- Never hard-code a server URL, port, or `ws/wss` scheme inside game logic.

## Monorepo (npm workspaces)
```
/client    PixiJS + Vite + TypeScript — renders state, predicts local movement, UI
/server    Colyseus + uWebSockets.js + Node + TypeScript — authoritative rooms & tick
/shared    TypeScript — simulation logic, wire types, the single tunables config
```
- `/shared` is imported by both `/client` and `/server`. It must have **no DOM and no Node-only
  APIs** so it runs in both environments.

## Authority model
- **Clients send inputs; the server decides everything.** Per tick the client sends its desired aim
  vector and whether it's drawing; the server runs the simulation, resolves movement, claims,
  combat, decay, and broadcasts results. Never trust client-reported position, captures, or army.
- **Client-side prediction:** the client runs the *same* `/shared` movement code locally so the
  avatar feels responsive, then reconciles against authoritative server state (snap/lerp on
  mismatch). Other players are interpolated between received states.

## Rooms = shards/arenas (Colyseus)
- Each Colyseus **room instance is one arena** with a player cap `(PLAYERS_PER_SHARD ~ 60, tunable)`.
- Matchmaking covers the three entry options: **join by id**, **join-or-create** (random), **create**.
- Reconnection support is available from Colyseus; wire a short reconnection window so brief drops
  don't lose the player.
- For v1, many rooms run inside a single Node process on the VPS (Colyseus rooms are in-process).
  Horizontal scaling (multiple processes) comes later via Redis presence — out of scope for MVP.

## State model & sync
Two channels, both over the Colyseus connection:
1. **Player/room state — Colyseus schema (auto delta-synced):**
   - players map: `{ id, name, color, x, y, army, state(HOME|WILD), drawing, alive }`
   - room fields: `dayNightPhase` (0..1), leaderboard snapshot (or derive client-side).
   - The in-progress claim `trail` may live here or in the grid channel; keep it small.
2. **Territory ownership grid — custom binary deltas (hand-rolled):**
   - The map is a grid; each cell's owner is a player id or NEUTRAL.
   - Each tick, send only **changed cells** as a compact binary payload (e.g., arrays of
     `[cellIndex, ownerId]`, optionally run-length/region-encoded). Do **not** sync the whole grid.
   - On join, send a one-time full snapshot (compressed), then deltas thereafter.

## Core server algorithms (implement in `/shared` where possible)
- **Movement:** speed from cursor offset, capped by a size→speed curve (smaller = faster).
- **Loop capture:** when a claim trail rejoins owned cells, flood-fill the enclosed region; enclosed
  neutral + enemy cells become the claimer's. Non-closing trail → strip crossed enemy cells to neutral.
- **Contiguity & severing:** connected-components on the owner grid after any change; keep the
  component containing the player's spawn cell; resolve others (loop-severed → inherited by adjacent
  cutter; slash/decay-severed → neutral).
- **Combat:** wild = subtractive drain at `DRAIN_RATE` for both bodies in contact (smaller dies);
  home = instant kill of intruder. Claim-line contact = void claim, no death.
- **Frontier shedding:** when army drops (combat/decay), remove cells furthest from the avatar/core
  first, preserving contiguity.
- **Decay:** above `DECAY_THRESHOLD`, shrink at an accelerating rate; eat least-defended frontier.

## Rendering (client, PixiJS)
- **Floor:** a grid drawn with day/night colors interpolated from `dayNightPhase`.
- **Territory:** render owned cells efficiently — draw into a `RenderTexture` / tiled chunks and
  update only **dirty regions** (cells that changed this frame); never repaint the whole map per frame.
- **Avatars:** circle (Graphics or Sprite) + contrasting border (color flips with day/night) +
  centered number (use `BitmapText` for performance with many avatars).
- **Owner-only gold outline:** trace the local player's territory border, client-side only.
- **Camera:** location-based zoom — zoom out (clamped) while inside own territory, standard shared
  zoom in the wild; smooth the transition on border crossings.

## Day/night sync
- Server advances `dayNightPhase` on the room clock and includes it in room state.
- Clients read the phase and interpolate all day/night-dependent colors (floor bg, grid lines,
  avatar borders) so every client in a room is visually in sync.

## Config / tunables
- One typed config object in `/shared` holds every balance and presentation constant
  (speeds, drain, decay, thresholds, zoom clamps, tick rate, day/night period & transition, palette
  bounds). Logic reads from it; no magic numbers elsewhere.
