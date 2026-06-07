# Build Plan — milestone checklist

**Build top to bottom. One milestone per session.** Get the core loop *fun* before adding combat and
decay. Run `npm run typecheck` and play-test each milestone before moving on. Detailed rules:
`game-spec.md`; presentation: `ui-ux.md`; wire format: `protocol.md`.

## M0 — Scaffold
- [ ] npm-workspaces monorepo: `/client` (Vite + PixiJS + TS), `/server` (Colyseus + uWS + TS), `/shared` (TS).
- [ ] `npm create colyseus-app@latest` for the server base; wire the uWebSockets.js transport.
- [ ] Shared `config.ts` (all tunables) + shared wire types. `strict: true` everywhere.
- [ ] `dev`, `build`, `start`, `typecheck` scripts working.
- [ ] **Two environments wired from the start:** client server URL via `VITE_SERVER_URL`
      (defaults to `ws://localhost:2567`); server reads env (`.env` + committed `.env.example`).
      No hard-coded URLs/ports/schemes. Local dev needs no TLS/nginx.

## M1 — Start screen & rooms
- [ ] Start screen fades in: centered box, name input, three room options (specific / random / create).
- [ ] Name persisted in `localStorage`; pre-filled on return.
- [ ] Colyseus join flows: `joinById`, `joinOrCreate`, `create` (see protocol §1).
- [ ] On join: fade out start screen, fade in game.

## M2 — Move & see (core feel, neutral land only)
- [ ] Server room with authoritative tick; players map in schema.
- [ ] Random skin color on join (no black/white/near-extremes; ui-ux §2).
- [ ] Avatar = fixed-size circle + contrasting border + centered army number.
- [ ] agar-style movement via input packets; size→speed curve; client prediction from `/shared`.
- [ ] White grid floor with grey lines.
- [ ] **Left-mouse-hold to draw**; loop-capture on **neutral** land; army = owned cells.
- [ ] Location-based zoom (out at home, standard in wild).
- [ ] Grid delta channel (snapshot on join + per-tick deltas).
- [ ] **Acceptance gate:** with `npm run dev` running, open 3–4 localhost tabs, enter a name, pick
      "join random room" → all avatars share one arena and move together live. If not, M2 isn't done.

## M3 — Persistence of fun
- [ ] Instant respawn; on death the start screen returns with name pre-filled (ui-ux §5).
- [ ] Dead/abandoned land rapidly decays to neutral (self-healing).
- [ ] Live leaderboard (top N by army).

## M4 — Day/night
- [ ] Room-synced `dayNightPhase` advanced by the server.
- [ ] Floor bg lerps white→black, grid lines grey→purple at night (and back); tunable period/transition.
- [ ] Avatar border color flips with the cycle to stay visible.

## M5 — Conflict
- [ ] Carve into bordering rivals: loop closes home → **inherit**; non-closing slash → strip to **neutral**.
- [ ] Contiguity invariant + severing resolution (loop-sever inherits; slash-sever neutral).
- [ ] Wilderness subtractive combat (both numbers tick down live in the circle centers; smaller dies).
- [ ] Home = instant-kill of intruder. Crossing an in-progress claim line = **void claim, no death**.

## M6 — Balance & polish
- [ ] Merged accelerating overgrowth decay + frontier shedding (above threshold).
- [ ] Private owner-only gold territory outline.
- [ ] Number abbreviation, camera smoothing, capture/death feedback (juice).

## M7 — Ship
- [ ] Deploy to the Namecheap Ubuntu VPS (pm2 + nginx + WSS via certbot) — see `deployment.md`.
- [ ] Client points at the public `wss://` URL.

## Later (not now)
- Retention meta (daily biggest-empire board, unlockable skins via rewarded video).
- Horizontal scaling (multiple processes + Redis), Postgres for accounts/cosmetics.
- Monetization (ads/rewarded video).
