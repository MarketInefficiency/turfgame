# CLAUDE.md — Territory.io (working title)

A 2D browser `.io` game: players join an open arena anytime, claim territory by drawing loops,
fight in the wild, and climb a live leaderboard. No rounds; instant respawn.

**Read the detailed docs before coding.** This file is the constitution; the docs are the law:
- @docs/game-spec.md — full gameplay ruleset (the *what* and *why*). Source of truth for mechanics.
- @docs/ui-ux.md — start screen, skins, day/night cycle, death flow, all presentation.
- @docs/architecture.md — monorepo layout, authoritative model, shared sim, rendering.
- @docs/protocol.md — Colyseus rooms + message/state schema + the custom grid-delta channel.
- @docs/build-plan.md — the milestone checklist. **Build in this order. One milestone per session.**
- @docs/deployment.md — deploying to the Namecheap Ubuntu VPS (pm2 + nginx + certbot).

## Tech stack (locked)
- **Client:** TypeScript + Vite + **PixiJS** (WebGL 2D renderer). Use the latest stable PixiJS;
  verify the current major version at install time (APIs differ across majors).
- **Server:** TypeScript + Node.js + **Colyseus** (authoritative framework) with the
  **uWebSockets.js transport** (`@colyseus/uwebsockets-transport`).
- **Shared:** a `/shared` TypeScript package holding the simulation + types, imported by BOTH
  client (for prediction) and server (for authority).
- **Monorepo:** npm workspaces — `/client`, `/server`, `/shared`.
- **Hosting:** self-hosted Node on a Namecheap Ubuntu VPS. See @docs/deployment.md.
- Scaffold the server from `npm create colyseus-app@latest` and adapt; don't hand-roll transport.

## Two environments (required from M0 — do not hard-code)
The project MUST support both of these from the very first milestone:
1. **Local development** — `npm run dev` brings the whole game up on `localhost`. I must be able to
   open **many browser windows/tabs** pointed at it and have them join the **same room** so I can
   play against myself and watch real multiplayer interactions live. Hot reload on client + server.
2. **Production** — the same codebase deployed to the Namecheap Ubuntu VPS (pm2 + nginx + WSS).

Make the environment a matter of **configuration, not code branches**:
- The client's server URL comes from an env var (e.g. `VITE_SERVER_URL`), defaulting to
  `ws://localhost:2567` in dev and set to `wss://<domain>/colyseus` for production. Never hard-code
  the URL in game logic.
- Server reads `PORT`/host and any secrets from env (`.env`, with a committed `.env.example`).
- Local dev must work with **no TLS and no nginx** (plain `ws://localhost`); production adds those.
- Same room/join code path in both — only the connection target differs.

Acceptance check for M2: with `npm run dev` running, opening 3–4 localhost tabs, entering a name, and
choosing "join random room" puts them all in one arena moving around together. If that doesn't work,
M2 isn't done.

## Repo structure
```
/client    PixiJS + Vite client (renders state, predicts movement)
/server    Colyseus rooms + authoritative simulation tick
/shared    sim logic + shared types + the single tunables config object
/docs      the documents imported above
```

## Commands (define these in package.json workspaces)
- `npm run dev` — run server + client with hot reload (concurrently).
- `npm run dev:server` / `npm run dev:client` — individually.
- `npm run build` — typecheck + build client (vite build) and server (tsc).
- `npm run start` — run the built server (used in production on the VPS).
- `npm run typecheck` / `npm run lint` — must pass before declaring a task done.

## Hard guardrails (never violate)
1. **Server is authoritative.** Never trust the client for captures, kills, positions, or army
   values. The client sends *inputs*; the server decides outcomes and broadcasts results.
2. **Shared sim, not duplicated sim.** Movement/claim/combat math lives in `/shared` and is run by
   the server for truth and the client for prediction. Do not fork the logic.
3. **One tunables object.** Every balance number (speeds, drain rate, decay, thresholds, day/night
   interval, etc.) lives in a single typed config in `/shared`. No magic numbers in logic.
4. **TypeScript strict.** `strict: true`, no `any` without justification, shared types across the wire.
5. **Modest tick.** This is a territory game, not a twitch FPS. Keep the server tick modest
   (~20 Hz default, tunable) and send deltas, not full state.
6. **Don't gold-plate.** Build the current milestone only. Get the core loop fun before adding combat
   and decay. Ask before introducing a dependency not named here.

## Controls (current)
- **Move:** agar.io style — cursor offset from the avatar sets direction and speed; centered =
  stationary; capped at a size-dependent max speed (smaller = faster).
- **Claim:** **hold the LEFT mouse button** to draw a claim line. Not holding = move freely, no trail.
- No sprint/stamina system (cut on purpose — the size–speed curve covers escape).

## Core gameplay invariants (summary — full detail in game-spec)
- **score = territory area = army**, one number, printed in the center of the avatar circle.
- **You only gain land by closing a draw-loop back into your own connected territory.** A non-closing
  slash strips the rival cells it crossed to neutral (no capture).
- **Territory must stay one connected mass** (contiguity). You can only carve into bordering rivals.
  A closed loop that severs a piece *inherits* it; a slash-sever frees it to neutral.
- **Combat:** in the wild, body contact drains both armies at an equal rate (smaller dies, larger
  reduced); on your OWN land, contact instantly kills the intruder (the only binary death).
  Touching an in-progress claim line just *voids the claim* — nobody dies.
- **Camera zoom is location-based:** zoom out inside your own territory (survey view); standard
  shared zoom in the wild. The avatar is the same fixed size for everyone.
- **Decay:** above a size threshold, kingdoms passively shrink, accelerating with size — a soft
  ceiling that forces continuous claiming and prevents turtling/snowballing.
- **Death:** army hits 0 → instant respawn small; dead land rapidly decays to neutral (self-healing).

## UI/presentation (summary — full detail in ui-ux)
- Start screen **fades in**: centered box with a **name input** and three room options —
  join a specific room, join a random room, or create a new room.
- On join: assign a **random skin color** (avatar circle + territory). **Black and white are
  banned** (plus near-black/near-white) so players stay visible across the day/night cycle.
- Avatar is a **circle with a clear contrasting border** so it never blends into the floor;
  the border color flips with day/night to stay visible on both.
- **Floor:** a grid — white background, grey lines by day. A **day/night cycle** on a timed interval
  (room-synced) slowly turns the background black and the lines purple at night, then back.
- **On death:** the start screen re-emerges with the **name pre-filled** from last time.
