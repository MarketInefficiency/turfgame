# Territory.io (working title)

A browser-based, join-anytime `.io` game. Players steer an identical circle around an open 2D arena,
claim territory by drawing loops (the claimed land *is* your score *is* your army, shown as a number
in the center of your circle), fight in the wilderness, and climb a live leaderboard. No rounds —
join whenever, respawn instantly.

## Stack
- **Client:** TypeScript · Vite · PixiJS (WebGL 2D)
- **Server:** TypeScript · Node.js · Colyseus (authoritative) · uWebSockets.js transport
- **Shared:** a TypeScript package with the simulation + types (used by both client and server)
- **Hosting:** self-hosted on a Namecheap Ubuntu VPS (pm2 + nginx + WSS)

## Repo layout
```
/client   PixiJS + Vite front end
/server   Colyseus rooms + authoritative simulation
/shared   sim logic, wire types, tunables config
/docs     design + build documentation
CLAUDE.md the project constitution (read first)
```

## Requirements
- **Node 18–22** (the Colyseus `uWebSockets.js` transport only ships prebuilt binaries up to
  Node 22; Node 23/24 will fail at server boot — and `npm install` will refuse, by design, via
  `engine-strict`). A `.nvmrc` pins `22`. With nvm-windows: `nvm install 22 && nvm use 22`.

## Run locally
```bash
node -v               # must be 18–22 (run `nvm use 22` if not)
npm install
npm run dev          # server + client with hot reload on localhost (plain ws://, no TLS)
# open the printed local URL — open SEVERAL tabs/windows and "join random room"
# in each to play real multiplayer against yourself on one machine
```
Other scripts: `npm run build`, `npm run start`, `npm run typecheck`.

The same codebase runs in two modes, switched by config only: **local dev** (`ws://localhost`, no
nginx/TLS) and **production** on the VPS (`wss://<domain>` behind nginx). See `docs/deployment.md`.

## Documentation (start here)
- `CLAUDE.md` — project constitution / context for the AI coding agent.
- `docs/game-spec.md` — full gameplay ruleset (what & why).
- `docs/ui-ux.md` — start screen, skins, day/night cycle, death flow.
- `docs/architecture.md` — monorepo, authoritative model, rendering.
- `docs/protocol.md` — Colyseus rooms + messages + grid deltas.
- `docs/build-plan.md` — ordered milestone checklist (build in this order).
- `docs/deployment.md` — Namecheap VPS deployment runbook.

## Status
Pre-MVP. Follow `docs/build-plan.md` milestone by milestone.
