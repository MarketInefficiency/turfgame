import { Application, Container, Graphics, type Ticker } from "pixi.js";
import type { Room } from "colyseus.js";
import {
  CONFIG,
  DECAY_OWNER,
  FOLIAGE_MOUNTAIN,
  FOLIAGE_NONE,
  FOLIAGE_TREE,
  GRID_SIZE,
  MSG,
  cellIndex,
  cellX,
  cellY,
  decodeFoliage,
  hexToNumber,
  lerpHex,
  nightFactor,
  stepMovement,
  vibrant,
  worldToCellX,
  worldToCellY,
  type ArenaEvent,
  type DeathCause,
  type InputPacket,
} from "@territory/shared";
import { Avatar, formatArmy } from "./avatar";
import { Capital } from "./capital";
import { TerritoryLayer } from "./territory";
import { createInput, type InputHandle } from "./input";
import * as shopCatalog from "../net/catalog";

/** Grey shown for dead/abandoned land while it decays away. */
const DECAY_COLOR = "#cdd2d8";

/** Minimal shape of a decoded schema Player (colyseus.js reflection). */
interface PlayerLike {
  id: string;
  name: string;
  color: string;
  ownerId: number;
  x: number;
  y: number;
  army: number;
  stateTag: string;
  drawing: boolean;
  alive: boolean;
  coverId: number;
  fighting: boolean;
  attackers: number;
  immune: boolean;
  skinId: string;
  capSkin: string;
  swordSkin: string;
  cloakSkin: string;
  hatSkin: string;
  hairSkin: string;
  shirtSkin: string;
  capCell: number;
  capPower: number;
  lastSeq: number;
}

export interface GameView {
  enter(room: Room, name: string): void;
  leave(): void;
  /** Largest army the local player reached last session (0 if they never played). */
  lastScore(): number;
  /** Flash a "Defeated…" banner at the top (cause + final power) before the start screen returns. */
  deathFlash(cause: DeathCause): void;
  /** Death-match spectate: start watching a player by sessionId (null → first alive). */
  spectate(id: string | null): void;
  /** Death-match spectate: step to the next/previous alive player. */
  spectateCycle(dir: 1 | -1): void;
  /** The name of the player currently being spectated (empty if none). */
  spectateName(): string;
}

/** A short-lived crumble effect spawned where an avatar died. */
interface DeathFx {
  view: Container;
  parts: { g: Graphics; vx: number; vy: number; vr: number }[];
  t: number;
  life: number;
}

export async function createGame(): Promise<GameView> {
  const app = new Application();
  await app.init({ background: "#ffffff", resizeTo: window, antialias: true });

  const mount = document.getElementById("app");
  if (!mount) throw new Error("missing #app mount node");
  mount.appendChild(app.canvas);

  // iOS/Android webviews don't always fire a clean 'resize' when the orientation lock rotates the
  // screen, leaving the canvas sized for the pre-rotation (portrait) width — half the arena blank.
  // Re-measure on orientation/viewport changes, plus a short burst after boot to catch the lock
  // settling. (resizeTo: window handles the steady state; this covers the rotation transient.)
  const resizeNow = (): void => app.resize();
  window.addEventListener("orientationchange", () => setTimeout(resizeNow, 150));
  window.visualViewport?.addEventListener("resize", resizeNow);
  for (const ms of [120, 350, 700, 1200]) setTimeout(resizeNow, ms);

  // ownerId → color, rebuilt each frame from the player map (drives territory paint).
  const colorByOwner = new Map<number, string>();

  // world (camera-transformed): floor → territory → claim line → avatars.
  const world = new Container();
  const floorGfx = buildFloor();
  world.addChild(floorGfx);
  const territory = new TerritoryLayer((owner) =>
    owner === DECAY_OWNER ? DECAY_COLOR : (colorByOwner.get(owner) ?? null),
  );
  world.addChild(territory.view);
  const territoryGlowGfx = new Graphics(); // additive halo around all territory edges at night
  territoryGlowGfx.blendMode = "add";
  world.addChild(territoryGlowGfx);
  const foliageGfx = new Graphics(); // static terrain (trees/mountains) — built once on join
  world.addChild(foliageGfx);
  const foliage = new Uint8Array(GRID_SIZE);
  const enemyOutlineGfx = new Graphics(); // black border around every other player's land
  world.addChild(enemyOutlineGfx);
  const goldGfx = new Graphics(); // private owner-only outline (local player's land), on top
  world.addChild(goldGfx);
  const trailGfx = new Graphics();
  world.addChild(trailGfx);
  const deathLayer = new Container(); // crumble effects when avatars die
  world.addChild(deathLayer);
  const capitalLayer = new Container(); // castles (drawn under avatars)
  world.addChild(capitalLayer);
  const avatarLayer = new Container();
  world.addChild(avatarLayer);
  app.stage.addChild(world);

  const avatars = new Map<string, Avatar>();
  const capitals = new Map<string, Capital>();
  const deaths: DeathFx[] = [];
  const local: { x: number; y: number; army: number; has: boolean } = {
    x: 0,
    y: 0,
    army: CONFIG.START_ARMY,
    has: false,
  };
  let zoom = CONFIG.ZOOM_WILD;
  // In-progress claim/sever line per player (reconstructed from synced position+drawing),
  // so everyone can see who is currently carving.
  const trails = new Map<string, { x: number; y: number }[]>();
  let goldDirty = false; // rebuild the private outline when the grid changes
  let goldOwner = -1; // owner the outline was last drawn for
  let prevArmy = 0; // for capture-pulse detection
  let peakArmy = 0; // largest army reached this session, shown as the score on the home screen
  let capturePulse = 0; // 0..1, decays — pops the local avatar on a capture
  let gridReady = false; // first grid snapshot applied (avoids a spawn "wilderness" flash)
  let lastZoneOwner = -1; // owner of the cell we were last in, for the zone banner
  let spectateId: string | null = null; // death-match: sessionId of the player we're watching
  let zoneAnim: Animation | null = null;
  // Intrusion alerts: per-other-player inside-my-territory state + a re-arm cooldown.
  const intruders = new Map<string, { inside: boolean; cooldown: number }>();
  let alertClock = 0;
  let alertAnim: Animation | null = null;
  let blinkPhase = 0; // drives the spawn-immunity avatar blink
  let lastLocalImmune = false; // tracks our own immunity for the on/off banner
  let siegeAlertAt = 0; // cooldown for the "capital under siege" warning
  // Home compass: cached territory centre + recompute throttle.
  const compassArrow = document.getElementById("compass-arrow") as HTMLElement | null;
  let homeCenter: { x: number; y: number } | null = null;
  let homeRecalc = 0;

  let room: Room | null = null;
  let input: InputHandle | null = null;
  let sendAccum = 0;
  let lbAccum = 0;
  let seq = 0;

  function players(): Map<string, PlayerLike> | null {
    return (room?.state?.players as Map<string, PlayerLike> | undefined) ?? null;
  }

  /** Next alive player to spectate after `current` (wraps; null if nobody is alive). */
  function nextSpectateId(current: string | null, dir = 1): string | null {
    const ids = [...(players()?.keys() ?? [])];
    if (ids.length === 0) return null;
    if (current === null) return ids[0]!;
    const i = ids.indexOf(current);
    if (i < 0) return ids[0]!;
    return ids[(i + dir + ids.length) % ids.length]!;
  }

  function onTick(ticker: Ticker): void {
    const map = players();
    if (!room || !map) return;
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const me = map.get(room.sessionId);

    // Refresh the owner→color table for territory painting (vivid fills pop on the bright floor).
    colorByOwner.clear();
    map.forEach((p) => colorByOwner.set(p.ownerId, vibrant(p.color)));

    // --- Local prediction + reconciliation (predict only our own avatar) ---
    if (me) {
      if (!local.has) {
        local.x = me.x;
        local.y = me.y;
        local.has = true;
        prevArmy = me.army;
      }
      local.army = me.army;
      if (me.army > peakArmy) peakArmy = me.army; // track the run's high-water mark
      if (me.army > prevArmy + 2) capturePulse = 1; // a capture just landed
      prevArmy = me.army;
      if (input) stepMovement(local, { aimX: input.state.aimX, aimY: input.state.aimY }, dt);
      const k = 1 - Math.exp(-CONFIG.PREDICT_CORRECT * dt);
      local.x += (me.x - local.x) * k;
      local.y += (me.y - local.y) * k;
    }
    capturePulse = Math.max(0, capturePulse - dt * 4);

    // --- Day/night: floor bg + grid lines + avatar borders interpolate by phase ---
    const nf = nightFactor((room.state?.dayNightPhase as number | undefined) ?? 0);
    app.renderer.background.color = hexToNumber(lerpHex(CONFIG.DAY_BG, CONFIG.NIGHT_BG, nf));
    floorGfx.tint = hexToNumber(lerpHex(CONFIG.DAY_LINES, CONFIG.NIGHT_LINES, nf));
    const borderTint = hexToNumber(lerpHex(CONFIG.DAY_BORDER, CONFIG.NIGHT_BORDER, nf));
    territoryGlowGfx.alpha = nf * 0.5; // territory edges radiate light only at night

    // --- Location-based zoom: survey view inside own land, standard in the wild ---
    const targetZoom = me?.stateTag === "HOME" ? CONFIG.ZOOM_HOME_MIN : CONFIG.ZOOM_WILD;
    zoom += (targetZoom - zoom) * (1 - Math.exp(-CONFIG.ZOOM_LERP * dt));

    // --- Camera centers the local avatar (or the spectated player when eliminated) ---
    let cx = local.has ? local.x : CONFIG.MAP_WIDTH / 2;
    let cy = local.has ? local.y : CONFIG.MAP_HEIGHT / 2;
    if (!me && spectateId) {
      if (!map.has(spectateId)) spectateId = nextSpectateId(spectateId); // target left/died → move on
      const av = spectateId ? avatars.get(spectateId) : undefined;
      if (av) {
        cx = av.renderX;
        cy = av.renderY;
      }
    }
    world.scale.set(zoom);
    world.position.set(app.screen.width / 2 - cx * zoom, app.screen.height / 2 - cy * zoom);
    const invZoom = 1 / zoom;
    // Avatar on-screen scale blends with the camera: full in the wild, smaller in the home survey
    // view. homeT is 1 at wild zoom, 0 at the most zoomed-out home view.
    const homeT = Math.max(
      0,
      Math.min(1, (zoom - CONFIG.ZOOM_HOME_MIN) / (CONFIG.ZOOM_WILD - CONFIG.ZOOM_HOME_MIN)),
    );
    const avScreen =
      CONFIG.AVATAR_SCALE_HOME + (CONFIG.AVATAR_SCALE_WILD - CONFIG.AVATAR_SCALE_HOME) * homeT;

    // --- Territory paint (only dirty chunks repaint) ---
    territory.redraw();

    // --- Private gold outline around our own land (rebuild only when it changed) ---
    const myOwner = me?.ownerId ?? -1;
    if (goldDirty || myOwner !== goldOwner) {
      territory.drawOwnerOutline(myOwner, goldGfx, CONFIG.GOLD_OUTLINE, 3);
      territory.drawEnemyOutlines(myOwner, DECAY_OWNER, enemyOutlineGfx, CONFIG.ENEMY_OUTLINE, 2);
      territory.drawBorderGlow(DECAY_OWNER, territoryGlowGfx, CONFIG.NIGHT_GLOW);
      goldDirty = false;
      goldOwner = myOwner;
    }

    // --- Zone banner: announce where we are when the underfoot owner changes ---
    if (gridReady && me && local.has) {
      const cell = territory.ownerAt(cellIndex(worldToCellX(local.x), worldToCellY(local.y)));
      const zone = cell === 0 || cell === DECAY_OWNER ? 0 : cell; // decaying land reads as wild
      if (zone !== lastZoneOwner) {
        lastZoneOwner = zone;
        if (zone === me.ownerId) showZoneBanner("Home", me.color);
        else if (zone === 0) showZoneBanner("Wilderness", CONFIG.WILDERNESS_COLOR);
        else {
          let owner: PlayerLike | undefined;
          map.forEach((pp) => {
            if (pp.ownerId === zone) owner = pp;
          });
          showZoneBanner(owner ? owner.name : "Wilderness", owner ? owner.color : CONFIG.WILDERNESS_COLOR);
        }
      }
    }

    // --- Intrusion alert: warn when another player steps onto your territory ---
    alertClock += dt;
    if (gridReady && me && me.ownerId > 0) {
      const meOwner = me.ownerId;
      map.forEach((p, id) => {
        if (id === room!.sessionId) return;
        const inside = territory.ownerAt(cellIndex(worldToCellX(p.x), worldToCellY(p.y))) === meOwner;
        let st = intruders.get(id);
        if (!st) {
          st = { inside: false, cooldown: 0 };
          intruders.set(id, st);
        }
        if (inside && !st.inside && alertClock >= st.cooldown) {
          showAlertBanner(`${p.name} entered your territory`, p.color);
          st.cooldown = alertClock + 4; // don't re-alert the same player for a few seconds
        }
        st.inside = inside;
      });
      for (const id of intruders.keys()) if (!map.get(id)) intruders.delete(id);
    }

    // --- Spawn immunity: tell the local player when their protection starts and ends ---
    if (me) {
      const im = Boolean(me.immune);
      if (im !== lastLocalImmune) {
        if (im) showAlertBanner("You're shielded for a few seconds", "#5bd6ff");
        else showAlertBanner("Shield's down, watch your back", "#ffb454");
        lastLocalImmune = im;
      }
    }

    // --- Capital under siege: warn the defender while an enemy drains it ---
    if (me && me.capPower > 0 && local.has) {
      const ccx = (cellX(me.capCell) + 0.5) * CONFIG.GRID_CELL;
      const ccy = (cellY(me.capCell) + 0.5) * CONFIG.GRID_CELL;
      const cr2 = CONFIG.COMBAT_CONTACT_DIST * CONFIG.COMBAT_CONTACT_DIST;
      let sieged = false;
      map.forEach((p, id) => {
        if (id === room!.sessionId || !p.alive) return;
        const dx = p.x - ccx;
        const dy = p.y - ccy;
        if (dx * dx + dy * dy <= cr2) sieged = true;
      });
      if (sieged && alertClock >= siegeAlertAt) {
        showAlertBanner("Your capital is under siege!", me.color);
        siegeAlertAt = alertClock + 5;
      }
    }

    // --- Home compass: rotate the triangle toward your territory's centre, live ---
    homeRecalc += dt;
    if (homeRecalc >= 0.4) {
      homeRecalc = 0;
      homeCenter = me ? territory.ownerCentroid(me.ownerId) : null;
    }
    if (compassArrow) {
      if (homeCenter && local.has) {
        const dx = homeCenter.x - local.x;
        const dy = homeCenter.y - local.y;
        if (dx * dx + dy * dy > 64) {
          const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0° = up
          compassArrow.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
          compassArrow.style.opacity = "1";
        } else {
          compassArrow.style.opacity = "0.3"; // you're at home
        }
      } else {
        compassArrow.style.opacity = "0.3";
      }
    }

    // --- Top-3 ranks (for crowns) ---
    const ranked: { id: string; army: number }[] = [];
    map.forEach((p, id) => {
      if (p.alive) ranked.push({ id, army: p.army });
    });
    ranked.sort((a, b) => b.army - a.army);
    const rankById = new Map<string, number>();
    for (let i = 0; i < Math.min(3, ranked.length); i++) rankById.set(ranked[i]!.id, i + 1);

    // --- Avatars: predict self, interpolate others ---
    const rk = 1 - Math.exp(-CONFIG.INTERP_RATE * dt);
    const localCover = me?.coverId ?? 0;
    blinkPhase += dt;
    const blinkOn = Math.sin(blinkPhase * 16) > -0.25; // ~2.5 Hz on/off for immune avatars
    map.forEach((p, id) => {
      const isLocal = id === room!.sessionId;
      // Concealment: while in a foliage patch you're invisible to others — EXCEPT players
      // sharing the same patch (same coverId). You always see yourself, faintly when hidden.
      const targetAlpha = isLocal
        ? p.coverId > 0
          ? CONFIG.FOLIAGE_HIDE_ALPHA
          : 1
        : p.coverId === 0 || p.coverId === localCover
          ? 1
          : 0;
      let a = avatars.get(id);
      if (!a) {
        a = new Avatar();
        a.renderX = p.x;
        a.renderY = p.y;
        a.view.alpha = targetAlpha; // appear at the right visibility, no flash
        avatars.set(id, a);
        avatarLayer.addChild(a.view);
      }
      a.setColor(vibrant(p.color)); // match the vivid territory fill
      const skinItem = shopCatalog.byId("skin", p.skinId ?? "default"); // image/GIF skin?
      const skinUrl = skinItem?.kind === "image" ? (skinItem.imageUrl ?? null) : null;
      a.setSkin(skinUrl); // wraps the avatar circle
      territory.setOwnerSkinUrl(p.ownerId, skinUrl); // paints their land with one masked copy of it
      const swordItem = shopCatalog.byId("sword", p.swordSkin ?? "default"); // design + color + flare
      // Procedural swords carry their length in `design` ("long"/"short"); design swords are long.
      a.setSword(p.swordSkin ?? "default", swordItem?.color || CONFIG.SWORD_COLOR, swordItem?.design === "long");
      a.setSwordFlare(swordItem?.flareUrl ?? null);
      a.setAttackers(p.attackers ?? 0);
      const cloakItem = shopCatalog.byId("cloak", p.cloakSkin ?? "default"); // design + recolour
      a.setCloak(cloakItem?.design || p.cloakSkin || "default", cloakItem?.color ?? "");
      a.setHair(p.hairSkin ?? "default");
      a.setHat(p.hatSkin ?? "default");
      a.setShirt(p.shirtSkin ?? "default");
      a.setArmy(p.army);
      a.setName(p.name);
      a.setBorderTint(borderTint);
      a.setDayNight(nf);
      a.setCrown(rankById.get(id) ?? 0);
      a.setFighting(p.fighting);
      a.tickFx(dt);
      if (p.immune) {
        // Blink while spawn-protected (visible to everyone) so it's clear they're untouchable.
        a.view.alpha = targetAlpha * (blinkOn ? 1 : 0.2);
      } else {
        a.view.alpha += (targetAlpha - a.view.alpha) * (1 - Math.exp(-12 * dt));
      }
      if (isLocal && local.has) {
        a.place(local.x, local.y, invZoom * avScreen * (1 + 0.3 * capturePulse)); // capture pop
      } else {
        a.renderX += (p.x - a.renderX) * rk;
        a.renderY += (p.y - a.renderY) * rk;
        a.place(a.renderX, a.renderY, invZoom * avScreen);
      }

      // Capital (castle): always-visible landmark on the player's capital cell.
      let cap = capitals.get(id);
      if (!cap) {
        cap = new Capital();
        capitals.set(id, cap);
        capitalLayer.addChild(cap.view);
      }
      cap.setColor(vibrant(p.color)); // match the vivid territory fill
      cap.setDesign(p.capSkin); // capital design cosmetic (same SVG the shop shows)
      cap.setPower(p.capPower);
      cap.place((cellX(p.capCell) + 0.5) * CONFIG.GRID_CELL, (cellY(p.capCell) + 0.5) * CONFIG.GRID_CELL);

      // In-progress claim/sever line — accumulate while drawing in the wild (everyone sees it).
      const drawing = isLocal ? Boolean(input?.state.drawing) : p.drawing;
      if (drawing && p.stateTag === "WILD") {
        const px = isLocal && local.has ? local.x : a.renderX;
        const py = isLocal && local.has ? local.y : a.renderY;
        let pts = trails.get(id);
        if (!pts) {
          pts = [];
          trails.set(id, pts);
        }
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(px - last.x, py - last.y) > 5) pts.push({ x: px, y: py });
        if (pts.length > 600) pts.shift();
      } else {
        trails.delete(id);
      }
    });
    for (const [id, a] of avatars) {
      if (!map.get(id)) {
        // Player gone (died/left) → crumble where they stood, unless they were hidden.
        if (a.view.alpha > 0.3) spawnDeath(a.view.x, a.view.y, a.fillColor);
        a.destroy();
        avatars.delete(id);
        trails.delete(id);
      }
    }
    for (const [id, cap] of capitals) {
      if (!map.get(id)) {
        cap.destroy();
        capitals.delete(id);
      }
    }
    updateDeaths(dt);

    // --- Draw every player's in-progress claim/sever line, in their colour ---
    trailGfx.clear();
    const trailW = 4 / zoom;
    for (const [id, pts] of trails) {
      const pl = map.get(id);
      if (!pl) {
        trails.delete(id); // player gone
        continue;
      }
      if (pts.length < 2) continue;
      trailGfx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) trailGfx.lineTo(pts[i]!.x, pts[i]!.y);
      trailGfx.stroke({ width: trailW, color: pl.color, alpha: 0.85, cap: "round", join: "round" });
    }

    // --- Live leaderboard + active-combat widget (throttled) ---
    lbAccum += ticker.deltaMS;
    if (lbAccum >= 150) {
      lbAccum = 0;
      updateLeaderboard(map);
      updateCombatWidget(map, me, rankById);
    }

    // --- Send input at a fixed rate ---
    sendAccum += ticker.deltaMS;
    if (input && sendAccum >= 1000 / CONFIG.INPUT_SEND_HZ) {
      sendAccum = 0;
      const packet: InputPacket = {
        seq: ++seq,
        aimX: input.state.aimX,
        aimY: input.state.aimY,
        drawing: input.state.drawing,
      };
      room.send(MSG.INPUT, packet);
    }
  }


  /** Rebuild the leaderboard DOM: top N by army, plus your own row if you're below it. */
  function updateLeaderboard(map: Map<string, PlayerLike>): void {
    const el = document.getElementById("leaderboard");
    if (!el || !room) return;
    const ranked: PlayerLike[] = [];
    map.forEach((p) => {
      if (p.alive) ranked.push(p);
    });
    ranked.sort((a, b) => b.army - a.army);

    const myId = room.sessionId;
    const row = (rank: number, p: PlayerLike): string =>
      `<div class="lb-row${p.id === myId ? " me" : ""}"><span class="lb-rank">${rank}</span>` +
      `<span class="lb-name">${escapeHtml(p.name)}</span>` +
      `<span class="lb-army">${formatArmy(p.army)}</span></div>`;

    // Phones (short, touch screens) only get room for a tiny board: top 4, then your own row.
    const phone = window.matchMedia("(max-height: 540px) and (pointer: coarse)").matches;
    const n = phone ? 4 : CONFIG.LEADERBOARD_SIZE;
    let html = ranked
      .slice(0, n)
      .map((p, i) => row(i + 1, p))
      .join("");

    // If the local player isn't in the top N, pin their rank to the bottom (the 5th slot on phones).
    const myIdx = ranked.findIndex((p) => p.id === myId);
    if (myIdx >= n) html += `<div class="lb-sep"></div>${row(myIdx + 1, ranked[myIdx]!)}`;

    el.innerHTML = html;
  }

  /** Fade a location label in, then drift it down and out (replaces any in-flight one). */
  function showZoneBanner(text: string, color: string): void {
    const el = document.getElementById("zone-banner");
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
    zoneAnim?.cancel();
    zoneAnim = el.animate(
      [
        { opacity: 0, transform: "translate(-50%, 8px)" },
        { opacity: 1, transform: "translate(-50%, 0px)", offset: 0.18 },
        { opacity: 1, transform: "translate(-50%, 0px)", offset: 0.62 },
        { opacity: 0, transform: "translate(-50%, 28px)" },
      ],
      { duration: 1900, easing: "ease-out", fill: "forwards" },
    );
  }

  /** Burst an avatar into tumbling, falling fragments where it died. */
  function spawnDeath(x: number, y: number, color: string): void {
    const view = new Container();
    view.position.set(x, y);
    const parts: DeathFx["parts"] = [];
    const count = 11;
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const sz = 4 + Math.random() * 5;
      g.rect(-sz / 2, -sz / 2, sz, sz).fill(color).stroke({ width: 1.4, color: "#1a1d22" });
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * CONFIG.AVATAR_RADIUS * 0.7;
      g.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad);
      g.rotation = Math.random() * Math.PI;
      view.addChild(g);
      parts.push({
        g,
        vx: Math.cos(ang) * (35 + Math.random() * 55) + (Math.random() - 0.5) * 40,
        vy: -(30 + Math.random() * 55), // pop up, then gravity drags it down
        vr: (Math.random() - 0.5) * 9,
      });
    }
    deathLayer.addChild(view);
    deaths.push({ view, parts, t: 0, life: 0.95 });
  }

  /** Advance crumble effects: gravity, tumble, fade; drop finished ones. */
  function updateDeaths(dt: number): void {
    const GRAVITY = 360;
    for (let i = deaths.length - 1; i >= 0; i--) {
      const fx = deaths[i]!;
      fx.t += dt;
      for (const p of fx.parts) {
        p.vy += GRAVITY * dt;
        p.g.x += p.vx * dt;
        p.g.y += p.vy * dt;
        p.g.rotation += p.vr * dt;
      }
      fx.view.alpha = Math.max(0, 1 - fx.t / fx.life);
      if (fx.t >= fx.life) {
        fx.view.destroy({ children: true });
        deaths.splice(i, 1);
      }
    }
  }

  /** Show the opponents the local player is actively battling (skin + crown + power). */
  function updateCombatWidget(
    map: Map<string, PlayerLike>,
    me: PlayerLike | undefined,
    rankById: Map<string, number>,
  ): void {
    const panel = document.getElementById("combat-panel");
    const list = document.getElementById("combat-list");
    if (!panel || !list || !room) return;
    if (!me || !local.has) {
      panel.classList.add("hidden");
      return;
    }
    // Wilderness foes you're trading blows with.
    const maxD2 = (CONFIG.COMBAT_CONTACT_DIST * 1.7) ** 2;
    const foes: PlayerLike[] = [];
    // Enemy capitals you're overlapping (sieging): show the castle and its remaining power.
    const sd2 = CONFIG.COMBAT_CONTACT_DIST ** 2;
    const sieges: PlayerLike[] = [];
    map.forEach((p, id) => {
      if (id === room!.sessionId || !p.alive) return;
      if (p.fighting) {
        const dx = p.x - local.x;
        const dy = p.y - local.y;
        if (dx * dx + dy * dy <= maxD2) foes.push(p);
      }
      if (p.capPower > 0) {
        const cx = (cellX(p.capCell) + 0.5) * CONFIG.GRID_CELL;
        const cy = (cellY(p.capCell) + 0.5) * CONFIG.GRID_CELL;
        const dx = cx - local.x;
        const dy = cy - local.y;
        if (dx * dx + dy * dy <= sd2) sieges.push(p);
      }
    });
    if (foes.length === 0 && sieges.length === 0) {
      panel.classList.add("hidden");
      return;
    }
    foes.sort((a, b) => b.army - a.army);
    panel.classList.remove("hidden");
    const skin = (p: PlayerLike): string => {
      const rank = rankById.get(p.id) ?? 0;
      const crown = rank >= 1 && rank <= 3 ? crownSvg(rank) : "";
      const item = shopCatalog.byId("skin", p.skinId ?? "default");
      // Image/GIF skins fill the dot with the art (GIFs animate as a CSS background); else flat colour.
      const dotStyle =
        item?.kind === "image" && item.imageUrl
          ? `background-image:url('${item.imageUrl}');background-size:cover;background-position:center`
          : `background:${p.color}`;
      return `<span class="combat-skin">${crown}<span class="combat-dot" style="${dotStyle}"></span></span>`;
    };
    const foeRows = foes.map((p) => `<div class="combat-row">${skin(p)}<span class="combat-power">${formatArmy(p.army)}</span></div>`);
    const siegeRows = sieges.map(
      (p) => `<div class="combat-row">${skin(p)}${castleSvg()}<span class="combat-power">${formatArmy(p.capPower)}</span></div>`,
    );
    list.innerHTML = siegeRows.concat(foeRows).join("");
  }

  /** Fade an intrusion alert in at the top, then drift it up and out (mirrors the zone banner). */
  function showAlertBanner(text: string, color: string): void {
    const el = document.getElementById("alert-banner");
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
    alertAnim?.cancel();
    alertAnim = el.animate(
      [
        { opacity: 0, transform: "translate(-50%, -8px)" },
        { opacity: 1, transform: "translate(-50%, 0px)", offset: 0.18 },
        { opacity: 1, transform: "translate(-50%, 0px)", offset: 0.62 },
        { opacity: 0, transform: "translate(-50%, -28px)" },
      ],
      { duration: 1900, easing: "ease-out", fill: "forwards" },
    );
  }

  app.ticker.add(onTick);

  function decodeSnapshot(bytes: Uint8Array): void {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Uint16Array(GRID_SIZE);
    let cell = 0;
    for (let o = 0; o + 4 <= bytes.byteLength; o += 4) {
      const owner = dv.getUint16(o, true);
      const count = dv.getUint16(o + 2, true);
      out.fill(owner, cell, cell + count);
      cell += count;
    }
    territory.applySnapshot(out);
    goldDirty = true;
    gridReady = true;
  }

  function decodeDelta(bytes: Uint8Array): void {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 0; o + 6 <= bytes.byteLength; o += 6) {
      territory.setCell(dv.getUint32(o, true), dv.getUint16(o + 4, true));
    }
    goldDirty = true;
  }

  /** Build the static foliage layer once: trees as canopies, mountains as peaks. */
  function buildFoliage(): void {
    foliageGfx.clear();
    const S = CONFIG.GRID_CELL;
    for (let i = 0; i < GRID_SIZE; i++) {
      const t = foliage[i];
      if (t === FOLIAGE_NONE) continue;
      const x = cellX(i) * S;
      const y = cellY(i) * S;
      if (t === FOLIAGE_TREE) {
        foliageGfx.circle(x + S / 2, y + S / 2, S * 0.42).fill(CONFIG.TREE_COLOR);
      } else if (t === FOLIAGE_MOUNTAIN) {
        foliageGfx
          .poly([x + S * 0.1, y + S * 0.85, x + S * 0.5, y + S * 0.12, x + S * 0.9, y + S * 0.85])
          .fill(CONFIG.MOUNTAIN_COLOR);
      }
    }
  }

  return {
    enter(r: Room): void {
      room = r;
      local.has = false;
      spectateId = null;
      sendAccum = 0;
      zoom = CONFIG.ZOOM_WILD;
      capturePulse = 0;
      peakArmy = 0; // fresh run → reset the score
      goldOwner = -1;
      goldGfx.clear();
      enemyOutlineGfx.clear();
      territoryGlowGfx.clear();
      gridReady = false;
      lastZoneOwner = -1;
      intruders.clear();
      alertClock = 0;
      lastLocalImmune = false; // re-arm the immunity banner for this session
      const evHost = document.getElementById("events");
      if (evHost) evHost.innerHTML = "";
      homeCenter = null;
      input = createInput();
      r.onMessage(MSG.FOLIAGE, (data: unknown) => {
        decodeFoliage(toBytes(data), foliage);
        buildFoliage();
      });
      r.onMessage(MSG.GRID_SNAPSHOT, (data: unknown) => decodeSnapshot(toBytes(data)));
      r.onMessage(MSG.GRID_DELTA, (data: unknown) => decodeDelta(toBytes(data)));
      r.onMessage(MSG.CLAIM_VOIDED, () => {
        trails.delete(r.sessionId); // someone crossed our claim line — drop it
        showAlertBanner("Your claim line was cut off!", "#ff7a59");
      });
      r.onMessage(MSG.EVENT, (ev: unknown) => pushEvent(ev as ArenaEvent));
      r.onMessage(MSG.CAP_BLOCKED, (m: unknown) => {
        const ctx = (m as { context?: string } | null)?.context;
        showAlertBanner(
          ctx === "sever" ? "Can't sever, drain their capital first" : "Can't claim, drain their capital first",
          "#ff7a59",
        );
      });
      r.send(MSG.READY); // ask for the snapshot now that handlers are registered
    },
    leave(): void {
      room = null;
      input?.dispose();
      input = null;
      for (const a of avatars.values()) a.destroy();
      avatars.clear();
      for (const cap of capitals.values()) cap.destroy();
      capitals.clear();
      for (const fx of deaths) fx.view.destroy({ children: true });
      deaths.length = 0;
      trails.clear();
      trailGfx.clear();
      goldGfx.clear();
      enemyOutlineGfx.clear();
      territoryGlowGfx.clear();
      foliageGfx.clear();
      foliage.fill(0);
      zoneAnim?.cancel();
      alertAnim?.cancel();
      intruders.clear();
      const zb = document.getElementById("zone-banner");
      if (zb) zb.textContent = "";
      const ab = document.getElementById("alert-banner");
      if (ab) ab.textContent = "";
      const ev = document.getElementById("events");
      if (ev) ev.innerHTML = "";
      territory.applySnapshot(new Uint16Array(GRID_SIZE));
      const lb = document.getElementById("leaderboard");
      if (lb) lb.innerHTML = "";
      document.getElementById("combat-panel")?.classList.add("hidden");
      app.renderer.background.color = hexToNumber(CONFIG.DAY_BG); // reset for start screen
      local.has = false;
      spectateId = null;
    },
    lastScore(): number {
      return peakArmy; // kept across leave() so the home screen can show the last run
    },
    spectate(id: string | null): void {
      spectateId = id && players()?.has(id) ? id : nextSpectateId(null);
    },
    spectateCycle(dir: 1 | -1): void {
      spectateId = nextSpectateId(spectateId, dir);
    },
    spectateName(): string {
      return (spectateId && players()?.get(spectateId)?.name) || "";
    },
    deathFlash(cause: DeathCause): void {
      const el = document.getElementById("alert-banner");
      if (!el) return;
      const reason =
        cause === "home"
          ? "Crushed on enemy ground."
          : cause === "wild"
            ? "Outfought in the open."
            : "Your army ran out.";
      el.textContent = `Defeated. ${reason} You peaked at ${peakArmy.toLocaleString()}.`;
      el.style.color = "#ff5a52";
      // Fade in and hold steady (no drift) — the start-screen fade right after covers its exit.
      alertAnim?.cancel();
      alertAnim = el.animate(
        [
          { opacity: 0, transform: "translate(-50%, -8px)" },
          { opacity: 1, transform: "translate(-50%, 0px)" },
        ],
        { duration: 220, easing: "ease-out", fill: "forwards" },
      );
    },
  };
}

/**
 * Inline crown SVG that mirrors the in-game avatar crown EXACTLY — same 5-point poly
 * proportions, three jewels, and the same fill/edge/jewel colours (see Avatar.setCrown).
 * Rank: 1 gold, 2 silver, 3 bronze.
 */
function crownSvg(rank: number): string {
  const col = rank === 1 ? CONFIG.CROWN_GOLD : rank === 2 ? CONFIG.CROWN_SILVER : CONFIG.CROWN_BRONZE;
  const edge = lerpHex(col, "#000000", 0.78);
  const jewel = lerpHex(col, "#ffffff", 0.55);
  // Same shape as the avatar (w = 20): peaks at -15/-19/-23, band at 0, jewels at -6/-9.
  return (
    `<svg class="combat-crown" viewBox="-23 -26 46 29" aria-hidden="true">` +
    `<path d="M-20 0 L-20 -15 L-15 -5 L-10 -19 L-5 -5 L0 -23 L5 -5 L10 -19 L15 -5 L20 -15 L20 0 Z" ` +
    `fill="${col}" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="-6" r="2.8" fill="${jewel}" stroke="${edge}" stroke-width="1"/>` +
    `<circle cx="-10" cy="-9" r="1.7" fill="${jewel}" stroke="${edge}" stroke-width="0.8"/>` +
    `<circle cx="10" cy="-9" r="1.7" fill="${jewel}" stroke="${edge}" stroke-width="0.8"/>` +
    `</svg>`
  );
}

/** Small crenellated castle glyph for the combat widget's siege rows. */
function castleSvg(): string {
  const f = CONFIG.CAPITAL_COLOR;
  const e = CONFIG.CAPITAL_EDGE;
  return (
    `<svg class="combat-castle" viewBox="0 0 24 20" aria-hidden="true">` +
    `<path d="M2 19 L2 9 L4 9 L4 6 L7 6 L7 9 L9 9 L9 4 L12 4 L12 6 L15 6 L15 9 L17 9 L17 6 L20 6 L20 9 L22 9 L22 19 Z" ` +
    `fill="${f}" stroke="${e}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<rect x="10" y="13" width="4" height="6" fill="${e}"/></svg>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

// --- Arena news feed (bottom-left) ---------------------------------------------------
// Lots of phrasings per event so the feed reads fresh. {a} = doer, {b} = victim.
const EVENT_PHRASES: Record<ArenaEvent["kind"], string[]> = {
  join: [
    "{a} arrived to dominate", "{a} entered the fray", "{a} joined the hunt", "{a} dropped in",
    "{a} showed up looking for turf", "{a} rolled onto the map", "{a} is hunting for land",
    "{a} wants a piece of the map", "{a} answered the call", "{a} is here to conquer",
    "{a} stormed in", "{a} touched down",
  ],
  killWild: [
    "{a} slew {b} in battle", "{a} pummeled {b}", "{a} ran {b} down", "{a} cut {b} down in the open",
    "{a} caught {b} slipping", "{a} bled {b} dry", "{a} crushed {b}", "{a} ended {b}'s run",
    "{a} hunted {b} down", "{a} put {b} in the dirt", "{a} caught {b} trying to escape",
    "{a} overran {b}",
  ],
  killHome: [
    "{a} defended their turf from {b}", "{a} crushed {b} on home soil", "{a} caught {b} trespassing",
    "{a} repelled {b}", "{b} fell storming {a}'s land", "{a} guarded the throne against {b}",
    "{a} taught {b} not to trespass",
  ],
  conquer: [
    "{a} swallowed {b}'s kingdom", "{a} wiped {b} off the map", "{a} conquered {b}",
    "{a} carved {b} out of the map", "{a} took everything {b} had", "{a} erased {b}'s empire",
  ],
};

function evName(act: { name: string; color: string }): string {
  return `<span class="ev-name" style="color:${act.color}">${escapeHtml(act.name)}</span>`;
}

/**
 * Add an event to the bottom-left feed: newest on top, names in their skin color, slide/
 * fade animations, a fade-out timer, and at most 5 rows (a new one evicts the oldest).
 */
function pushEvent(ev: ArenaEvent): void {
  const host = document.getElementById("events");
  if (!host) return;
  const choices = EVENT_PHRASES[ev.kind] ?? EVENT_PHRASES.join;
  const tmpl = choices[(Math.random() * choices.length) | 0]!;
  const html = tmpl.replace("{a}", evName(ev.a)).replace("{b}", ev.b ? evName(ev.b) : "someone");

  const row = document.createElement("div");
  row.className = "ev-row";
  row.innerHTML = html;
  host.prepend(row);
  row.animate(
    [
      { opacity: 0, maxHeight: "0px", transform: "translateX(-10px)" },
      { opacity: 1, maxHeight: "26px", transform: "none" },
    ],
    { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
  );
  while (host.children.length > 5) host.lastElementChild?.remove();

  window.setTimeout(() => {
    row
      .animate([{ opacity: 1, maxHeight: "26px" }, { opacity: 0, maxHeight: "0px" }], {
        duration: 500,
        easing: "ease-in",
      })
      .finished.then(() => row.remove())
      .catch(() => {
        /* row already gone */
      });
  }, 7000);
}

/** Normalize a Colyseus binary payload to a Uint8Array view. */
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * Static floor: grid lines + a wall around the bounded map, drawn white so the whole
 * thing can be tinted to the current day/night line color. The background itself is the
 * renderer clear color (set per frame), so no opaque floor rect is drawn here.
 */
function buildFloor(): Graphics {
  const g = new Graphics();
  const { MAP_WIDTH: W, MAP_HEIGHT: H, FLOOR_GRID_STEP: step } = CONFIG;

  for (let x = 0; x <= W; x += step) g.moveTo(x, 0).lineTo(x, H);
  for (let y = 0; y <= H; y += step) g.moveTo(0, y).lineTo(W, y);
  g.stroke({ width: 1, color: 0xffffff });
  g.rect(0, 0, W, H).stroke({ width: 4, color: 0xffffff });

  return g;
}
