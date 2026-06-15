import "./styles.css";
import type { Room } from "colyseus.js";
import {
  MEDAL_PACKS,
  MEDAL_SVG,
  MSG,
  castleSvg,
  cloakSvg,
  hairSvg,
  hatSvg,
  packSavings,
  shirtSvg,
  swordSvg,
  MEMBER_SWORD_ID,
  type CosmeticType,
  type Died,
  type Eliminated,
  type LobbyState,
  type MatchEnd,
  type PrivateOptions,
} from "@territory/shared";
import * as catalog from "./net/catalog";
import type { ShopItem } from "./net/catalog";
import { createGame, type GameView } from "./game/game";
import { isTouchDevice } from "./game/input";
import { createPrivate, join, type JoinMode } from "./net/client";
import { SERVER_URL } from "./net/config";
import { accountsEnabled } from "./net/supabase";
import {
  buyCosmetic,
  deleteAccount,
  equipCosmetic,
  equippedId,
  isMember,
  initAccounts,
  onAccountChange,
  refreshAccount,
  resetPassword,
  signIn,
  signInWithProvider,
  signOut,
  signUp,
  startCheckout,
  type AccountState,
} from "./auth/account";
import { APP_STORE_URL, KOFI_URL, PLAY_STORE_URL } from "./links";
import { loadName, saveName } from "./storage";
import * as ads from "./ads";
import { runContext, stripeCheckoutAllowed } from "./platform";
import { isNative, nativePurchase, nativeRestore } from "./native";
import { initNativeShell } from "./nativeShell";

/**
 * M1 entry point: drive the start screen → join → game flow.
 * - Start screen fades in on load; name pre-filled from localStorage.
 * - Three room options map to Colyseus joinOrCreate / joinById / create.
 * - On join, fade out the start screen and fade in the game view + HUD.
 * - Leaving (or a disconnect) returns to the start screen with the name pre-filled.
 */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const startScreen = el("start-screen");
const nameInput = el<HTMLInputElement>("name-input");
const playBtn = el<HTMLButtonElement>("play-btn");
const joinCodeBtn = el<HTMLButtonElement>("join-code-btn");
const joincodeOverlay = el("joincode-overlay");
const joincodeClose = el<HTMLButtonElement>("joincode-close");
const joincodeInput = el<HTMLInputElement>("joincode-input");
const joincodeGo = el<HTMLButtonElement>("joincode-go");
const joincodeNote = el("joincode-note");
const formError = el("form-error");
const hud = el("game-hud");
const roomTag = el<HTMLButtonElement>("room-tag");
const leaveBtn = el<HTMLButtonElement>("leave-btn");
const hudLeft = el("hud-left");
const kofiHome = el<HTMLAnchorElement>("kofi-home");
const kofiGame = el<HTMLAnchorElement>("kofi-game");
const appStoreLink = el<HTMLAnchorElement>("appstore-link");
const playLink = el<HTMLAnchorElement>("play-link");
const accountChip = el<HTMLButtonElement>("account-chip");
const authOverlay = el("auth-overlay");
const authClose = el<HTMLButtonElement>("auth-close");
const authSignedout = el("auth-signedout");
const authSignedin = el("auth-signedin");
const authSignout = el<HTMLButtonElement>("auth-signout");
const authDelete = el<HTMLButtonElement>("auth-delete");
const authApple = el<HTMLButtonElement>("auth-apple");
const authGoogle = el<HTMLButtonElement>("auth-google");
const authEmail = el<HTMLInputElement>("auth-email");
const authPassword = el<HTMLInputElement>("auth-password");
const authPrimary = el<HTMLButtonElement>("auth-primary");
const authModeBtn = el<HTMLButtonElement>("auth-mode");
const authForgot = el<HTMLButtonElement>("auth-forgot");
const pwToggle = el<HTMLButtonElement>("pw-toggle");
const authTitle = el("auth-title");
const authSub = el("auth-sub");
const authMsg = el("auth-msg");
const shopChip = el<HTMLButtonElement>("shop-chip");
const shopOverlay = el("shop-overlay");
const shopClose = el<HTMLButtonElement>("shop-close");
const shopList = el("shop-list");
const shopNote = el("shop-note");
const shopPreview = el("shop-preview");
const tabShop = el<HTMLButtonElement>("tab-shop");
const tabOwned = el<HTMLButtonElement>("tab-owned");
const shopMedals = el("shop-medals");
const medalCount = el("medal-count");
const medalPlus = el<HTMLButtonElement>("medal-plus");
const homeTopleft = el("home-topleft");
const homeMedals = el("home-medals");
const homeMedalCount = el("home-medal-count");
const shopPremium = el<HTMLButtonElement>("shop-premium");
const shopRestore = el<HTMLButtonElement>("shop-restore");
const buyMedalsOverlay = el("buymedals-overlay");
const buyMedalsClose = el<HTMLButtonElement>("buymedals-close");
const packList = el("pack-list");
const buyMedalsNote = el("buymedals-note");
const openPremiumLink = el<HTMLButtonElement>("open-premium-link");
const premiumOverlay = el("premium-overlay");
const premiumClose = el<HTMLButtonElement>("premium-close");
const buyPremiumBtn = el<HTMLButtonElement>("buy-premium");
const buyAdfreeBtn = el<HTMLButtonElement>("buy-adfree");
const premiumNote = el("premium-note");
const premiumLegal = el("premium-legal");
const tagline = el("tagline");
const howto = el("howto");
const deathOverlay = el("death-overlay");
const deathCause = el("death-cause");
const deathPower = el("death-power");
const deathTime = el("death-time");
const deathBest = el("death-best");
const deathBestBadge = el("death-best-badge");
const deathReward = el("death-reward");
const deathMedals = el("death-medals");
const deathBalance = el("death-balance");
const deathGuest = el("death-guest");
const deathSignup = el<HTMLButtonElement>("death-signup");
const deathRespawn = el<HTMLButtonElement>("death-respawn");
const deathHome = el<HTMLButtonElement>("death-home");
const createPrivateBtn = el<HTMLButtonElement>("create-private-btn");
const privateOverlay = el("private-overlay");
const privateClose = el<HTMLButtonElement>("private-close");
const privatePlayers = el<HTMLInputElement>("private-players");
const playersMinus = el<HTMLButtonElement>("players-minus");
const playersPlus = el<HTMLButtonElement>("players-plus");
const privateLobbyTog = el<HTMLButtonElement>("private-lobby");
const privateDmTog = el<HTMLButtonElement>("private-deathmatch");
const privateCreate = el<HTMLButtonElement>("private-create");
const privateNote = el("private-note");
const lobbyOverlay = el("lobby-overlay");
const lobbyLeave = el<HTMLButtonElement>("lobby-leave");
const lobbyCode = el<HTMLButtonElement>("lobby-code");
const lobbyMeta = el("lobby-meta");
const lobbyList = el("lobby-list");
const lobbyStart = el<HTMLButtonElement>("lobby-start");
const lobbyReadyBtn = el<HTMLButtonElement>("lobby-ready");
const lobbyWait = el("lobby-wait");
const rankOverlay = el("rank-overlay");
const rankSub = el("rank-sub");
const rankList = el("rank-list");
const rankHome = el<HTMLButtonElement>("rank-home");
const spectateBanner = el("spectate-banner");
const spectateBar = el("spectate-bar");
const spectatePrev = el<HTMLButtonElement>("spectate-prev");
const spectateNext = el<HTMLButtonElement>("spectate-next");
const spectateNameEl = el("spectate-name");

// Shown when there's no previous run; replaced by the last score after a death.
const DEFAULT_TAGLINE = "Draw loops. Claim turf. Rule the map.";

// One sentence at a time on the home screen: how to play + the three ways to kill.
const HOWTO_LINES = [
  "Move with your mouse. Hold left click to draw a loop and grab whatever's inside it.",
  "Ram someone out in the open and you both lose army. The bigger one walks away.",
  "Step onto someone's turf while they're home and they drop you in one hit.",
  "Win fights and your capital banks power from the army you tear off people.",
  "Park on an enemy's capital to drain its power into yours, then take their land.",
  "Get bigger than everyone else and top the leaderboard.",
];

let game: GameView;
let currentRoom: Room | null = null;
let account: AccountState | null = null; // latest account state, for the shop + chip
// Shop "try before you buy": per-type id currently shown in the preview (overrides equipped).
const shopSel: Partial<Record<CosmeticType, string>> = {};
let shopTab: "shop" | "owned" = "shop"; // Shop = (rotating) store; Owned = everything you can equip

// Run context, so the death screen can show "survived" and "Play again" can rejoin the same arena.
let runStartedAt = 0;
let lastJoin: { mode: JoinMode; name: string; roomId: string } | null = null;
let respawning = false;
const BEST_POWER_KEY = "tg_best_power"; // personal best across all runs, on this device

// Private-arena create settings (the modal edits these in place).
const privateOpts: PrivateOptions = { maxPlayers: 8, lobby: true, deathmatch: false };
let lobbyReady = false; // local ready flag while waiting in a lobby (non-host)
let spectateTimer = 0; // keeps the spectated-player name fresh while watching

function setVisible(node: HTMLElement, visible: boolean): void {
  node.classList.toggle("hidden", !visible);
}

function friendlyError(err: unknown): string {
  // When Colyseus can't reach the server at all, it throws a raw XHR/WebSocket Event, which
  // stringifies to "[object ...Event]". Treat anything that isn't an Error/string as a
  // connection failure and name the endpoint we tried — the fastest way to spot a wrong URL.
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) {
    return `Couldn't reach the server (${SERVER_URL}). Make sure it's running and on the same network.`;
  }
  if (/not found|notfound|no rooms|seat/i.test(msg)) {
    return "That room wasn't found. Check the code, or join a random room.";
  }
  if (/locked|full/i.test(msg)) {
    return "That room is full. Try another code, or join a random room.";
  }
  return msg || "Couldn't join. Give it another go.";
}

function enterGame(room: Room, name: string): void {
  formError.textContent = "";
  roomTag.textContent = `room: ${room.roomId} ⧉`;
  setVisible(startScreen, false);
  setVisible(hud, true);
  setVisible(hudLeft, true);
  setVisible(kofiGame, true);
  game.enter(room, name);
  if (isTouchDevice()) showTouchHint();
}

/**
 * Touch only: flash the "Move / Hold to draw" hint over the arena, since the right-side draw
 * zone is invisible. Fades out after 5s or as soon as the player has placed both thumbs.
 */
function showTouchHint(): void {
  const hint = document.getElementById("touch-hint");
  if (!hint) return;
  setVisible(hint, true);
  let leftDown = false;
  let rightDown = false;
  let timer = 0;
  const done = (): void => {
    setVisible(hint, false);
    window.removeEventListener("pointerdown", onTouch);
    window.clearTimeout(timer);
  };
  const onTouch = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    if (e.clientX < window.innerWidth / 2) leftDown = true;
    else rightDown = true;
    if (leftDown && rightDown) done(); // thumbs are in place — they've got it
  };
  window.addEventListener("pointerdown", onTouch);
  timer = window.setTimeout(done, 5000);
}

function backToStart(message?: string): void {
  currentRoom = null;
  game.leave();
  // Show last run's score where the tagline normally sits (default text if never played).
  const score = game.lastScore();
  tagline.textContent = score > 0 ? `Last run you hit ${score.toLocaleString()} power` : DEFAULT_TAGLINE;
  setVisible(hud, false);
  setVisible(hudLeft, false);
  setVisible(kofiGame, false);
  setVisible(lobbyOverlay, false);
  setVisible(rankOverlay, false);
  setVisible(deathOverlay, false);
  setVisible(spectateBanner, false);
  stopSpectating();
  nameInput.value = loadName(); // pre-fill on return (ui-ux §5)
  formError.textContent = message ?? "";
  playBtn.disabled = false;
  playBtn.textContent = "Play";
  setVisible(startScreen, true);
}

function wireRoom(room: Room): void {
  // Death: let the crumble read for a beat, then raise the run-summary screen over the still-live
  // arena. The room stays joined (currentRoom keeps pointing at it) so "Play again" can drop the
  // player straight back in, and the world keeps moving behind the dimmed card.
  room.onMessage(MSG.DIED, (payload: Died | undefined) => {
    if (currentRoom !== room) return;
    window.setTimeout(() => {
      if (currentRoom !== room) return;
      showDeathScreen(payload);
    }, 650);
  });
  // Private-arena lobby roster (only arrives while waiting for the host).
  room.onMessage(MSG.LOBBY, (payload: LobbyState | undefined) => {
    if (currentRoom !== room) return;
    renderLobby(room, payload?.players ?? []);
  });
  // Death match: eliminated (no respawn) — spectate, starting on whoever knocked us out.
  room.onMessage(MSG.ELIMINATED, (payload: Eliminated | undefined) => {
    if (currentRoom !== room) return;
    setVisible(hud, false);
    spectateBanner.textContent = `Out in ${ordinal(payload?.place ?? 0)} place. Watching to the end.`;
    setVisible(spectateBanner, true);
    startSpectating(payload?.byId ?? null);
  });
  // Death match over: show the standings.
  room.onMessage(MSG.MATCH_END, (payload: MatchEnd | undefined) => {
    if (currentRoom !== room) return;
    stopSpectating();
    setVisible(spectateBanner, false);
    showRankings(payload);
  });
  // Watch the phase so a lobby flips into the arena when the host starts.
  room.onStateChange((state) => {
    if (currentRoom !== room) return;
    const phase = (state as { phase?: string } | undefined)?.phase;
    if (phase === "live" && !lobbyOverlay.classList.contains("hidden")) {
      setVisible(lobbyOverlay, false);
      runStartedAt = Date.now();
      enterGame(room, lastJoin?.name ?? loadName());
    }
  });
  // Fires only for unexpected drops: the Leave button nulls `currentRoom` before
  // calling room.leave(), so a user-initiated leave is already handled and skipped.
  room.onLeave(() => {
    if (currentRoom === room) {
      setVisible(deathOverlay, false);
      backToStart("Lost connection to the game.");
    }
  });
  room.onError((_code, message) => {
    if (currentRoom === room) backToStart(message ?? "Connection trouble, try again.");
  });
}

/** Spell out how the run ended, naming the rival when there was one. */
function deathCauseText(payload: Died | undefined): string {
  const cause = payload?.cause ?? "wiped";
  if (payload?.by) {
    if (cause === "home") return `${payload.by} crushed you on their own ground.`;
    if (cause === "wild") return `${payload.by} outfought you in the open.`;
    return `${payload.by} finished you off.`;
  }
  if (cause === "home") return "Crushed on enemy ground.";
  if (cause === "wild") return "Outfought in the open.";
  return "Your army ran dry.";
}

/** Tween a number from 0 to target into a node, prefixed with "+". */
function countUp(node: HTMLElement, target: number, ms = 800): void {
  if (target <= 0) {
    node.textContent = "+0";
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = `+${Math.round(target * eased).toLocaleString()}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Raise the run-summary screen: stats, the medal reward (or a guest nudge), and the two actions. */
function showDeathScreen(payload: Died | undefined): void {
  ads.noteGameOver(); // may queue an interstitial for the next "Play again"
  const peak = payload?.peak ?? game.lastScore();
  const seconds = runStartedAt ? Math.max(0, Math.round((Date.now() - runStartedAt) / 1000)) : 0;
  const prevBest = Number(localStorage.getItem(BEST_POWER_KEY) ?? 0);
  const best = Math.max(prevBest, peak);
  const isNewBest = peak > prevBest && peak > 0;
  if (isNewBest) {
    try {
      localStorage.setItem(BEST_POWER_KEY, String(best));
    } catch {
      /* storage may be unavailable; the best simply won't persist */
    }
  }

  deathCause.textContent = deathCauseText(payload);
  deathPower.textContent = peak.toLocaleString();
  deathTime.textContent = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  deathBest.textContent = best.toLocaleString();
  setVisible(deathBestBadge, isNewBest);

  const signedIn = Boolean(account?.signedIn);
  setVisible(deathReward, signedIn);
  setVisible(deathGuest, !signedIn);
  if (signedIn) {
    const earned = payload?.medals ?? 0;
    if (!deathMedals.previousElementSibling?.querySelector("svg")) {
      el("death-medal-ico").innerHTML = MEDAL_SVG;
    }
    countUp(deathMedals, earned);
    deathBalance.textContent = "";
    void refreshAccount().then(() => {
      const bal = account?.profile?.medals ?? 0;
      deathBalance.textContent = `Balance ${bal.toLocaleString()}`;
    });
  }

  setVisible(hud, false);
  setVisible(hudLeft, false);
  setVisible(deathOverlay, true);
  deathRespawn.focus();
}

/** Rejoin and drop straight back into the action, preferring the same arena. */
async function respawn(): Promise<void> {
  if (respawning || !lastJoin) return;
  respawning = true;
  setVisible(deathOverlay, false);
  const dead = currentRoom;
  currentRoom = null;
  if (dead) {
    try {
      await dead.leave();
    } catch {
      /* already gone */
    }
  }
  game.leave();
  await ads.showAdIfDue(); // an interstitial every few game-overs (skipped for members/ad-free)
  const { mode, name, roomId } = lastJoin;
  try {
    let room: Room;
    try {
      room = await join({ mode: "specific", name, roomId }); // same arena if it still has space
    } catch {
      room = await join({ mode: mode === "specific" ? "random" : mode, name, roomId });
    }
    lastJoin = { mode, name, roomId: room.roomId };
    currentRoom = room;
    runStartedAt = Date.now();
    wireRoom(room);
    enterGame(room, name);
  } catch (err) {
    backToStart(friendlyError(err));
  } finally {
    respawning = false;
  }
}

/** Leave the dead room and return to the start screen. */
function deathToHome(): void {
  setVisible(deathOverlay, false);
  const dead = currentRoom;
  currentRoom = null;
  if (dead) void dead.leave();
  backToStart();
}

function wireDeathScreen(): void {
  deathRespawn.addEventListener("click", () => void respawn());
  deathHome.addEventListener("click", deathToHome);
  deathSignup.addEventListener("click", () => {
    deathToHome();
    openAuth("Make a free account to keep your medals, best scores, and cosmetics.");
  });
}

// ----- Private arenas: create flow, lobby, and death-match standings -----

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** Copy text to the clipboard, with a fallback for non-secure contexts (e.g. a LAN IP in dev,
 *  where navigator.clipboard isn't available). */
function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}
function legacyCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* nothing more we can do */
  }
  document.body.removeChild(ta);
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** A non-empty player name, falling back to a random guest handle (mirrors handlePlay). */
function resolveName(): string {
  let name = nameInput.value.trim();
  if (!name) {
    name = `guest-${Math.floor(1000 + Math.random() * 9000)}`;
    nameInput.value = name;
  }
  return name;
}

/** Open the lobby and paint the current roster (the host sees Start, everyone else readies up). */
function showLobby(room: Room, _name: string): void {
  lobbyReady = false; // fresh lobby, not ready yet
  setVisible(startScreen, false);
  setVisible(privateOverlay, false);
  setVisible(lobbyOverlay, true);
  lobbyCode.textContent = room.roomId;
  renderLobby(room, []);
}

function updateReadyBtn(): void {
  lobbyReadyBtn.textContent = lobbyReady ? "Ready ✓" : "I'm ready";
  lobbyReadyBtn.classList.toggle("ready", lobbyReady);
}

function renderLobby(room: Room, players: LobbyState["players"]): void {
  const st = room.state as { phase?: string; maxPlayers?: number; deathmatch?: boolean; hostId?: string } | undefined;
  if (st?.phase !== "lobby") return;
  setVisible(startScreen, false);
  setVisible(privateOverlay, false);
  setVisible(lobbyOverlay, true);
  lobbyCode.textContent = room.roomId;
  const max = Number(st?.maxPlayers ?? 0) || players.length;
  lobbyMeta.textContent = `${players.length} of ${max} players · ${st?.deathmatch ? "Last one standing" : "Free for all"}`;
  lobbyList.innerHTML = players
    .map((p) => {
      const tag = p.host
        ? `<span class="lobby-host">Host</span>`
        : p.ready
          ? `<span class="lobby-ready-tag">Ready</span>`
          : `<span class="lobby-waiting-tag">Waiting</span>`;
      return (
        `<div class="lobby-row"><span class="lobby-dot" style="background:${p.color}"></span>` +
        `<span>${escapeHtml(p.name)}</span>${tag}</div>`
      );
    })
    .join("");
  const isHost = room.sessionId === st?.hostId;
  setVisible(lobbyStart, isHost);
  setVisible(lobbyReadyBtn, !isHost);
  setVisible(lobbyWait, !isHost);
  updateReadyBtn();
}

/** Show a finished death match's final standings, highlighting your row. */
function showRankings(payload: MatchEnd | undefined): void {
  const rankings = payload?.rankings ?? [];
  const myName = lastJoin?.name ?? loadName();
  rankSub.textContent = rankings[0] ? `${escapeHtml(rankings[0].name)} takes it.` : "Match over.";
  rankList.innerHTML = rankings
    .map((r) => {
      const you = r.name === myName ? " you" : "";
      const win = r.place === 1 ? " win" : "";
      return (
        `<div class="rank-row${you}${win}"><span class="rank-place">${r.place}</span>` +
        `<span class="rank-dot" style="background:${r.color}"></span>` +
        `<span class="rank-name">${escapeHtml(r.name)}</span>` +
        `<span class="rank-peak">${r.peak.toLocaleString()}</span></div>`
      );
    })
    .join("");
  setVisible(hud, false);
  setVisible(hudLeft, false);
  setVisible(deathOverlay, false);
  setVisible(rankOverlay, true);
}

/** Begin spectating after elimination: follow the killer first, then let the player cycle. */
function startSpectating(byId: string | null): void {
  game.spectate(byId);
  spectateNameEl.textContent = game.spectateName();
  setVisible(spectateBar, true);
  if (spectateTimer) clearInterval(spectateTimer);
  // The watched player can die/leave (camera auto-advances), so keep the label in sync.
  spectateTimer = window.setInterval(() => {
    spectateNameEl.textContent = game.spectateName();
  }, 800);
}

function stopSpectating(): void {
  setVisible(spectateBar, false);
  if (spectateTimer) {
    clearInterval(spectateTimer);
    spectateTimer = 0;
  }
}

/** Leave the current room (user-initiated) and return home. */
function leaveToHome(): void {
  const room = currentRoom;
  currentRoom = null;
  if (room) void room.leave();
  backToStart();
}

function setToggle(btn: HTMLButtonElement, on: boolean): void {
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-checked", String(on));
}

async function submitPrivate(): Promise<void> {
  privateNote.textContent = "";
  // Only members can host (the server checks this too). Anyone can join one with the code.
  if (!isMember(account?.profile)) {
    setVisible(privateOverlay, false);
    openPremium();
    premiumNote.textContent = "Only members can host a private arena. Anyone can join one with the code.";
    return;
  }
  setPlayers(Number(privatePlayers.value)); // clamp whatever's in the box right now
  const name = resolveName();
  saveName(name);
  privateCreate.disabled = true;
  privateCreate.textContent = "Creating…";
  try {
    const room = await createPrivate(name, privateOpts);
    lastJoin = { mode: "specific", name, roomId: room.roomId }; // continuous-mode respawn rejoins by code
    setVisible(privateOverlay, false);
    afterJoin(room, name);
  } catch (err) {
    privateNote.textContent = friendlyError(err);
  } finally {
    privateCreate.disabled = false;
    privateCreate.textContent = "Create arena";
  }
}

/** Clamp the player count to 2..50 and reflect it back into the stepper. */
function setPlayers(n: number): void {
  const clamped = Math.max(2, Math.min(50, Math.floor(Number.isFinite(n) ? n : privateOpts.maxPlayers)));
  privateOpts.maxPlayers = clamped;
  privatePlayers.value = String(clamped);
}

function wirePrivate(): void {
  createPrivateBtn.addEventListener("click", () => {
    privateNote.textContent = "";
    setPlayers(privateOpts.maxPlayers);
    setToggle(privateLobbyTog, privateOpts.lobby);
    setToggle(privateDmTog, privateOpts.deathmatch);
    setVisible(privateOverlay, true);
  });
  playersMinus.addEventListener("click", () => setPlayers(privateOpts.maxPlayers - 1));
  playersPlus.addEventListener("click", () => setPlayers(privateOpts.maxPlayers + 1));
  privatePlayers.addEventListener("input", () => {
    const digits = privatePlayers.value.replace(/[^0-9]/g, "");
    privatePlayers.value = digits; // keep it numeric while typing; clamp on blur
  });
  privatePlayers.addEventListener("blur", () => setPlayers(Number(privatePlayers.value)));
  privateClose.addEventListener("click", () => setVisible(privateOverlay, false));
  privateOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === privateOverlay) setVisible(privateOverlay, false);
  });
  privateLobbyTog.addEventListener("click", () => {
    privateOpts.lobby = !privateOpts.lobby;
    setToggle(privateLobbyTog, privateOpts.lobby);
  });
  privateDmTog.addEventListener("click", () => {
    privateOpts.deathmatch = !privateOpts.deathmatch;
    setToggle(privateDmTog, privateOpts.deathmatch);
  });
  privateCreate.addEventListener("click", () => void submitPrivate());
  wireOverlayKeyboard(privateOverlay, [privatePlayers]); // keep the player-count field above the keyboard

  lobbyStart.addEventListener("click", () => currentRoom?.send(MSG.START_GAME));
  lobbyReadyBtn.addEventListener("click", () => {
    lobbyReady = !lobbyReady;
    updateReadyBtn();
    currentRoom?.send(MSG.LOBBY_READY);
  });
  lobbyLeave.addEventListener("click", leaveToHome);
  spectatePrev.addEventListener("click", () => {
    game.spectateCycle(-1);
    spectateNameEl.textContent = game.spectateName();
  });
  spectateNext.addEventListener("click", () => {
    game.spectateCycle(1);
    spectateNameEl.textContent = game.spectateName();
  });
  lobbyCode.addEventListener("click", () => {
    const code = currentRoom?.roomId ?? lobbyCode.textContent ?? "";
    copyText(code);
    lobbyCode.textContent = "Copied!";
    window.setTimeout(() => {
      lobbyCode.textContent = currentRoom?.roomId ?? code;
    }, 1000);
  });
  rankHome.addEventListener("click", leaveToHome);
}

/**
 * Blur whatever text field is focused, closing the soft keyboard. Needed because in-app webviews
 * (e.g. the CrazyGames app) give no keyboard "Done" affordance, so the page must dismiss it.
 */
function dismissKeyboard(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) a.blur();
}

/** Play = drop straight into a random arena (the lowest-friction entry). */
async function handlePlay(): Promise<void> {
  formError.textContent = "";
  const name = resolveName();
  dismissKeyboard(); // drop the soft keyboard as we join (webviews won't do it on their own)
  playBtn.disabled = true;
  playBtn.textContent = "Joining…";
  try {
    const room = await join({ mode: "random", name });
    saveName(name);
    lastJoin = { mode: "random", name, roomId: room.roomId };
    afterJoin(room, name);
  } catch (err) {
    formError.textContent = friendlyError(err);
  } finally {
    playBtn.disabled = false;
    playBtn.textContent = "Play";
  }
}

/** Join a specific arena by the code typed in the join-with-a-code popup. */
async function handleJoinCode(): Promise<void> {
  const roomId = joincodeInput.value.trim();
  if (!roomId) {
    joincodeNote.textContent = "Enter a room code.";
    joincodeInput.focus();
    return;
  }
  const name = resolveName();
  dismissKeyboard();
  joincodeGo.disabled = true;
  joincodeGo.textContent = "Joining…";
  try {
    const room = await join({ mode: "specific", name, roomId });
    saveName(name);
    lastJoin = { mode: "specific", name, roomId: room.roomId };
    setVisible(joincodeOverlay, false);
    afterJoin(room, name);
  } catch (err) {
    joincodeNote.textContent = friendlyError(err);
  } finally {
    joincodeGo.disabled = false;
    joincodeGo.textContent = "Play";
  }
}

/** Settle a fresh room into the right screen: a private lobby waits, a finished match shows the
 *  ranking, anything else drops straight into the arena. */
function afterJoin(room: Room, name: string): void {
  currentRoom = room;
  runStartedAt = Date.now();
  setVisible(spectateBanner, false);
  wireRoom(room);
  const settle = (): void => {
    if (currentRoom !== room) return;
    const st = room.state as { phase?: string; deathmatch?: boolean } | undefined;
    if (st?.phase === "lobby") showLobby(room, name);
    else if (st?.phase === "ended") setVisible(rankOverlay, true); // MATCH_END fills it in
    else enterGame(room, name);
  };
  // The schema arrives a beat after join resolves; read it once it's there.
  if ((room.state as { phase?: string } | undefined)?.phase) settle();
  else room.onStateChange.once(settle);
}

/**
 * A store badge becomes a real link once its URL is configured (after the app is approved);
 * until then it stays in the "Coming soon" state with no destination.
 */
function wireStoreBadge(badge: HTMLAnchorElement, url: string): void {
  if (!url) return; // leave the .coming-soon state in place
  badge.href = url;
  badge.target = "_blank";
  badge.rel = "noopener noreferrer";
  badge.classList.remove("coming-soon");
}

function wireStartScreen(): void {
  nameInput.value = loadName();
  kofiHome.href = KOFI_URL;
  kofiGame.href = KOFI_URL;
  wireStoreBadge(appStoreLink, APP_STORE_URL);
  wireStoreBadge(playLink, PLAY_STORE_URL);

  playBtn.addEventListener("click", () => void handlePlay());

  // Join-with-a-code: opens a small popup with a code field + Play, the lowest-friction way in.
  joinCodeBtn.addEventListener("click", () => {
    joincodeNote.textContent = "";
    joincodeInput.value = "";
    setVisible(joincodeOverlay, true);
    joincodeInput.focus();
  });
  joincodeClose.addEventListener("click", () => setVisible(joincodeOverlay, false));
  joincodeOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === joincodeOverlay) setVisible(joincodeOverlay, false);
  });
  joincodeGo.addEventListener("click", () => void handleJoinCode());
  joincodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void handleJoinCode();
  });
  wireOverlayKeyboard(joincodeOverlay, [joincodeInput]);

  // Keyboard handling for in-app webviews (e.g. the CrazyGames app), which don't shift the page
  // when the soft keyboard opens and offer no way to dismiss it. All touch-only and desktop-safe:
  //  - focus: pin the form to the top (CSS .kb-open) so the field stays above the keyboard.
  //  - tap off the text fields: dismiss the keyboard.
  //  - focus leaving the fields for good: unpin and reset any residual scroll.
  for (const input of [nameInput]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void handlePlay();
    });
    input.addEventListener("focus", () => {
      startScreen.classList.add("kb-open");
      window.setTimeout(() => input.scrollIntoView({ block: "center" }), 50); // best-effort where the view does scroll
    });
  }
  startScreen.addEventListener("focusout", () => {
    // Defer a tick: if focus just hopped to the other field, stay pinned.
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a !== nameInput) {
        startScreen.classList.remove("kb-open");
        window.scrollTo(0, 0);
        startScreen.scrollTop = 0;
      }
    }, 0);
  });
  startScreen.addEventListener("pointerdown", (e) => {
    // Tapping a text field (or the name label) keeps the keyboard; tapping anything else drops it.
    if ((e.target as Element).closest('input[type="text"], .field')) return;
    dismissKeyboard();
  });
  leaveBtn.addEventListener("click", () => {
    const room = currentRoom;
    currentRoom = null; // mark as user-initiated so wireRoom's onLeave skips it
    void room?.leave();
    backToStart();
  });

  roomTag.addEventListener("click", () => void copyRoomCode());
}

function setAuthMsg(text: string, ok = false): void {
  authMsg.textContent = text;
  authMsg.classList.toggle("ok", ok);
}

/** Open the account dialog (sign-in mode), optionally with a message. Used by the chip + guest nudges. */
function openAuth(msg = ""): void {
  if (!account?.signedIn) setAuthMode("signin"); // signed-in opens straight to the Sign out view
  setAuthMsg(msg, false);
  setVisible(authOverlay, true);
}

/**
 * Track the visual viewport so dialogs sit above the soft keyboard. Our overlays are position:fixed,
 * which the browser does NOT shift up for the keyboard, so without this the keyboard overlaps the
 * field. We publish the visible height as --vvh (CSS sizes the kb-open overlay to it) and scroll the
 * focused field into view the instant the keyboard actually opens (the resize event), not on a guess.
 */
function wireSoftKeyboard(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = (): void => {
    document.documentElement.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) {
      window.setTimeout(() => a.scrollIntoView({ block: "center" }), 0);
    }
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

/**
 * Make an overlay's text fields behave in in-app webviews (CrazyGames, the future Capacitor
 * iOS/Android shells): pin the panel above the keyboard on focus, dismiss the keyboard on a tap
 * off the fields, and unpin when focus leaves. Same approach used on the start screen.
 */
function wireOverlayKeyboard(overlay: HTMLElement, inputs: HTMLInputElement[]): void {
  for (const input of inputs) {
    input.addEventListener("focus", () => {
      overlay.classList.add("kb-open");
      window.setTimeout(() => input.scrollIntoView({ block: "center" }), 50);
    });
  }
  overlay.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!inputs.includes(document.activeElement as HTMLInputElement)) overlay.classList.remove("kb-open");
    }, 0);
  });
  overlay.addEventListener("pointerdown", (e) => {
    const t = e.target as Element;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest(".field")) return;
    dismissKeyboard();
  });
}

let authMode: "signin" | "signup" = "signin";

function setAuthMode(mode: "signin" | "signup"): void {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Welcome back";
  authPrimary.textContent = signup ? "Create account" : "Sign in";
  authModeBtn.textContent = signup ? "Have an account? Sign in" : "Create account";
  setVisible(authForgot, !signup); // no "forgot password" while creating an account
  authPassword.setAttribute("autocomplete", signup ? "new-password" : "current-password");
  setAuthMsg("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function doAuth(): Promise<void> {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!EMAIL_RE.test(email)) {
    setAuthMsg("Enter a valid email address.");
    return;
  }
  if (password.length < 6) {
    setAuthMsg("Password must be at least 6 characters.");
    return;
  }
  const signup = authMode === "signup";
  setAuthMsg(signup ? "Creating account…" : "Signing in…");
  try {
    if (signup) {
      await signUp(email, password);
      setAuthMsg("You're in. If we email you a confirmation link, click it, then pick a username.", true);
    } else {
      await signIn(email, password);
      setAuthMsg("Signed in.", true);
    }
  } catch (err) {
    setAuthMsg(err instanceof Error ? err.message : "Couldn't sign in. Check your details.");
  }
}

/**
 * Account UI: the top-right chip opens a dialog for email sign-in and claiming a username. The
 * whole thing only appears when accounts are configured for the build (guest play is otherwise
 * untouched). A signed-in player's username is mirrored into the (read-only) name field and used
 * in-game; the server independently trusts the account name via onAuth.
 */
function wireAccount(): void {
  if (!accountsEnabled) return; // guest-only build → leave the chip hidden
  setVisible(accountChip, true);

  onAccountChange((s) => {
    account = s;
    homeMedalCount.textContent = (s.profile?.medals ?? 0).toLocaleString(); // 0 by default (incl. guests)
    accountChip.textContent = s.signedIn ? "Account" : "Sign in";
    // The account widget swaps the sign-in form for a Sign out button once you're signed in. The
    // in-game name is always typed on the start screen, so the name box stays editable either way.
    setVisible(authSignedout, !s.signedIn);
    setVisible(authSignedin, s.signedIn);
    if (s.signedIn) {
      authTitle.textContent = "Account";
      authSub.textContent = `Signed in as ${s.email ?? "your account"}.`;
    } else {
      setAuthMode(authMode); // restore the form's title, blurb, and button text
    }
    nameInput.readOnly = false;
    renderShop(); // owned/equipped may have changed
  });

  const closeAuth = (): void => {
    dismissKeyboard();
    authOverlay.classList.remove("kb-open");
    setVisible(authOverlay, false);
  };

  accountChip.addEventListener("click", () => openAuth());
  authClose.addEventListener("click", closeAuth);
  authOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === authOverlay) closeAuth(); // tap the backdrop to close
  });
  // Keyboard handling for the dialog's fields (touch / in-app webviews).
  wireOverlayKeyboard(authOverlay, [authEmail, authPassword]);
  for (const input of [authEmail, authPassword]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") authPrimary.click();
    });
  }
  setAuthMode("signin");
  authPrimary.addEventListener("click", () => {
    dismissKeyboard();
    void doAuth();
  });
  authModeBtn.addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
  authForgot.addEventListener("click", () => {
    const email = authEmail.value.trim();
    if (!EMAIL_RE.test(email)) {
      setAuthMsg("Enter your email above, then tap Forgot password.");
      authEmail.focus();
      return;
    }
    setAuthMsg("Sending reset email…");
    void resetPassword(email).then((err) =>
      setAuthMsg(err ?? "Sent. Check your email for the reset link.", !err),
    );
  });
  pwToggle.addEventListener("click", () => {
    const show = authPassword.type === "password";
    authPassword.type = show ? "text" : "password";
    pwToggle.textContent = show ? "Hide" : "Show";
  });
  authSignout.addEventListener("click", () => {
    void signOut();
    closeAuth();
  });
  authDelete.addEventListener("click", () => {
    // Two-step confirm so a tap can't nuke an account by accident.
    if (!confirm("Delete your account for good? Your profile and unlocked cosmetics will be removed. This can't be undone.")) {
      return;
    }
    setAuthMsg("Deleting your account…");
    void deleteAccount().then((err) => {
      if (err) {
        setAuthMsg(err);
      } else {
        setAuthMsg("");
        closeAuth();
      }
    });
  });
  // OAuth: on success the page redirects to the provider, so we only handle the error case.
  const oauth = (provider: "google" | "apple") => {
    setAuthMsg("Opening sign in…");
    void signInWithProvider(provider).then((err) => {
      if (err) setAuthMsg(err);
    });
  };
  authGoogle.addEventListener("click", () => oauth("google"));
  // Apple sign-in via Supabase OAuth. NOTE: the native Apple sheet plugin is Capacitor-7 only and
  // conflicts with Capacitor 8's SPM graph, so it's removed for now; a Cap-8-compatible native Apple
  // sign-in must be added back before App Store submission (guideline 4.8).
  authApple.addEventListener("click", () => oauth("apple"));
}

/** A medal cost chip: the custom medal icon + the number. */
function medalCost(n: number): string {
  return `<span class="cz-cost">${MEDAL_SVG}${n.toLocaleString()}</span>`;
}

const RAINBOW = "conic-gradient(from 0deg,#ff7a59,#f2b63c,#37c46e,#4aa3ff,#a96bff,#ff7a59)";

// The default combat blade (blade + crossguard + grip + pommel), recoloured — used for the
// recolourable swords, at short (current) or long (sword) length. Design swords use SWORD_SVGS.
function recolorSwordSvg(color: string, long = false): string {
  const guard = "#8a5a2a";
  const bl = long ? 24 : 16; // blade length
  const gy = 1 + bl; // crossguard top
  const sh = (1 + gy * 0.32).toFixed(1); // blade shoulders
  return (
    `<svg viewBox="0 0 24 ${gy + 11}" aria-hidden="true">` +
    `<polygon points="12,1 14.4,${sh} 13.6,${gy} 10.4,${gy} 9.6,${sh}" fill="${color}" stroke="#1a1a1a" stroke-width="0.9" stroke-linejoin="round"/>` +
    `<polygon points="6,${gy} 18,${gy} 16.6,${gy + 2.6} 7.4,${gy + 2.6}" fill="${guard}" stroke="#1a1a1a" stroke-width="0.9" stroke-linejoin="round"/>` +
    `<rect x="10.6" y="${gy + 2.6}" width="2.8" height="5.4" rx="1" fill="${guard}" stroke="#1a1a1a" stroke-width="0.9"/>` +
    `<polygon points="12,${gy + 7.6} 14,${gy + 9.6} 12,${gy + 11} 10,${gy + 9.6}" fill="${color}" stroke="#1a1a1a" stroke-width="0.9" stroke-linejoin="round"/></svg>`
  );
}

function cosmeticThumb(c: ShopItem): string {
  if (c.kind === "image" && c.imageUrl) {
    const cls = c.type === "skin" ? "cz-thumb cz-img cz-skin" : "cz-thumb cz-img";
    return `<span class="${cls}" style="background-image:url(${c.imageUrl})"></span>`;
  }
  if (c.type === "skin") return `<span class="cz-thumb cz-skin" style="background:${c.color || RAINBOW}"></span>`;
  if (c.type === "capital") return `<span class="cz-thumb cz-castle">${castleSvg(c.design ?? "default")}</span>`;
  if (c.type === "cloak") {
    const art = cloakSvg(c.design || c.id, c.color);
    return art ? `<span class="cz-thumb cz-cloak">${art}</span>` : `<span class="cz-thumb cz-cloak none">None</span>`;
  }
  if (c.type === "hat" || c.type === "hair" || c.type === "shirt") {
    const art = c.type === "hat" ? hatSvg(c.id) : c.type === "hair" ? hairSvg(c.id) : shirtSvg(c.id);
    return art ? `<span class="cz-thumb cz-cloak">${art}</span>` : `<span class="cz-thumb cz-cloak none">None</span>`;
  }
  return `<span class="cz-thumb cz-sword">${swordSvg(c.id) || recolorSwordSvg(c.color, c.design === "long")}</span>`;
}

/** The id shown in the preview for a slot: the previewed override, else equipped, else default.
 *  Equipped reads the account loadout when signed in, otherwise the guest's saved choice. */
function shownId(type: CosmeticType): string {
  return shopSel[type] ?? equippedId(type);
}

/** A composed figure mirroring the in-game look: avatar (skin + ring + number) swinging the sword,
 *  next to the castle. Reflects the previewed loadout so players can try items before buying. */
function renderShopPreview(): void {
  const skin = catalog.byId("skin", shownId("skin"));
  const avatarStyle =
    skin?.kind === "image" && skin.imageUrl
      ? `background-image:url(${skin.imageUrl});background-size:cover;background-position:center`
      : `background:${skin && skin.color ? skin.color : RAINBOW}`;

  const sword = catalog.byId("sword", shownId("sword"));
  const swordArt =
    sword?.kind === "image" && sword.imageUrl
      ? `<img src="${sword.imageUrl}" alt="" />`
      : swordSvg(sword?.id ?? "default") || recolorSwordSvg(sword?.color ?? "#ffcf3f", sword?.design === "long");
  // The swoosh trail mirrors the in-game effect: the sword's flare texture, or a colour streak.
  const slash = sword?.flareUrl
    ? `<span class="sp-slash tex" style="--slash-img:url(${sword.flareUrl})"></span>`
    : `<span class="sp-slash" style="--slash-color:${sword?.color || "#ffffff"}"></span>`;

  const cap = catalog.byId("capital", shownId("capital"));
  const castleArt =
    cap?.kind === "image" && cap.imageUrl ? `<img src="${cap.imageUrl}" alt="" />` : castleSvg(cap?.design ?? "default");

  const cloak = catalog.byId("cloak", shownId("cloak"));
  const cloakInner =
    cloak?.kind === "image" && cloak.imageUrl
      ? `<img src="${cloak.imageUrl}" alt="" />`
      : cloakSvg(cloak?.design || cloak?.id || "default", cloak?.color ?? "");
  // Wings sit behind the avatar; capes over the lower body (their art stays below the number).
  const cloakCls = (cloak?.id ?? "").startsWith("wings_") ? "sp-cloak wings" : "sp-cloak cape";
  const cloakArt = cloakInner ? `<span class="${cloakCls}">${cloakInner}</span>` : "";

  const hat = catalog.byId("hat", shownId("hat"));
  const hatArt = hat && hatSvg(hat.id) ? `<span class="sp-wear sp-hat">${hatSvg(hat.id)}</span>` : "";
  const hair = catalog.byId("hair", shownId("hair"));
  const hairArt = hair && hairSvg(hair.id) ? `<span class="sp-wear sp-hair">${hairSvg(hair.id)}</span>` : "";
  const shirt = catalog.byId("shirt", shownId("shirt"));
  const shirtArt = shirt && shirtSvg(shirt.id) ? `<span class="sp-wear sp-shirt">${shirtSvg(shirt.id)}</span>` : "";

  shopPreview.innerHTML =
    `<div class="sp-fig">` +
    cloakArt +
    shirtArt +
    slash +
    `<span class="sp-sword">${swordArt}</span>` +
    `<span class="sp-avatar" style="${avatarStyle}"><span class="sp-num">2.4k</span></span>` +
    hairArt +
    hatArt +
    `</div>` +
    `<span class="sp-castle">${castleArt}</span>`;
}

/** A short "3h 24m" style countdown to the next rotation. */
function rotationCountdown(): string {
  const left = catalog.rotationEndsAt() - Date.now();
  if (left <= 0) return "";
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Re-trigger the preview's pop animation (on equip or when previewing a new item). */
function pulsePreview(): void {
  shopPreview.classList.remove("pulse");
  void shopPreview.offsetWidth; // force reflow so the animation restarts
  shopPreview.classList.add("pulse");
}

/** (Re)draw the shop from the catalog against the player's owned/equipped cosmetics + medal balance. */
function renderShop(): void {
  renderShopPreview();
  medalCount.textContent = (account?.profile?.medals ?? 0).toLocaleString(); // 0 by default
  const owned = new Set(account?.profile?.owned ?? []);
  const member = isMember(account?.profile);
  if (shopTab === "owned") {
    shopNote.textContent = "Everything you can equip, even if it's rotated out of the shop.";
  } else {
    const cd = rotationCountdown();
    const base = account?.signedIn
      ? "Play to earn medals, or grab a pack."
      : "Try anything on. Make a free account to wear it and start earning medals.";
    shopNote.textContent = cd ? `${base} New shop in ${cd}.` : base;
  }
  tabShop.classList.toggle("active", shopTab === "shop");
  tabOwned.classList.toggle("active", shopTab === "owned");
  let html = "";
  for (const group of catalog.groups()) {
    const shown = shownId(group.type);
    // The members-only sword is equippable while you're a member: it shows in Owned (never the Shop).
    const memberSwordUsable = (c: ShopItem): boolean => c.id === MEMBER_SWORD_ID && member;
    // Owned tab: things you can equip. Shop tab: free/default + whatever's in today's rotation.
    const items =
      shopTab === "owned"
        ? group.items.filter((c) => catalog.canUse(group.type, c.id, owned) || memberSwordUsable(c))
        : group.items.filter((c) => catalog.inShop(c));
    if (items.length === 0) continue;
    html += `<div class="cz-group"><div class="cz-group-title">${group.label}</div><div class="cz-grid">`;
    for (const c of items) {
      const on = equippedId(group.type) === c.id;
      const sel = shown === c.id; // currently shown in the preview
      const usable = catalog.canUse(group.type, c.id, owned) || memberSwordUsable(c);
      const tier = catalog.rarityTier(c.rarity);
      // Cloaks cost medals like anything else, but only members may buy them.
      const memberLocked = group.type === "cloak" && !c.free && !owned.has(c.id) && !member;
      const badge = c.free
        ? ""
        : c.id === MEMBER_SWORD_ID
          ? `<span class="cz-badge member">Member</span>`
          : group.type === "cloak"
            ? owned.has(c.id)
              ? `<span class="cz-badge owned">Owned</span>`
              : `<span class="cz-badge member">Members</span>`
            : owned.has(c.id)
              ? `<span class="cz-badge owned">Owned</span>`
              : `<span class="cz-badge" style="background:${tier.color};color:#0c0f14">${tier.name}</span>`;
      let action: string;
      if (on) action = `<span class="cz-state equipped">Equipped</span>`;
      else if (usable) action = `<button class="cz-btn equip">Equip</button>`;
      else if (memberLocked) action = `<button class="cz-btn member">Members</button>`; // join to unlock buying
      else action = `<button class="cz-btn buy">${medalCost(c.medalCost)}</button>`;
      // The whole card is tap-to-preview (data-* drives it); the button equips or buys.
      html +=
        `<div class="cz-card${on ? " on" : ""}${sel ? " sel" : ""}" data-type="${group.type}" data-id="${c.id}">` +
        `${badge}${cosmeticThumb(c)}<span class="cz-name">${c.name}</span>${action}</div>`;
    }
    html += `</div></div>`;
  }
  shopList.innerHTML = html;
}

/** Shop dialog: browse cosmetics, equip what you own; premium designs are locked until purchases land. */
function wireShop(): void {
  if (!accountsEnabled) return; // guest-only build → leave the cluster hidden
  setVisible(homeTopleft, true);
  shopMedals.insertAdjacentHTML("afterbegin", `<span class="medal-ico">${MEDAL_SVG}</span>`);
  homeMedals.insertAdjacentHTML("afterbegin", `<span class="medal-ico">${MEDAL_SVG}</span>`);
  homeMedals.addEventListener("click", () => {
    if (account?.signedIn) openBuyMedals();
    else openAuth("Sign in to start earning medals."); // guests log in to collect medals
  });
  renderShop();
  shopChip.addEventListener("click", () => {
    for (const k of Object.keys(shopSel)) delete shopSel[k as CosmeticType]; // start from equipped
    shopTab = "shop";
    renderShop();
    setVisible(shopOverlay, true);
    void catalog.loadCatalog().then(renderShop); // pull the latest items + rotation
  });
  tabShop.addEventListener("click", () => {
    shopTab = "shop";
    renderShop();
  });
  tabOwned.addEventListener("click", () => {
    shopTab = "owned";
    renderShop();
  });
  shopClose.addEventListener("click", () => setVisible(shopOverlay, false));
  shopOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === shopOverlay) setVisible(shopOverlay, false); // tap the backdrop to close
  });
  medalPlus.addEventListener("click", openBuyMedals);
  shopPremium.addEventListener("click", openPremium);
  shopRestore.addEventListener("click", () => {
    shopNote.textContent = "Restoring…";
    void nativeRestore().then((r) => {
      shopNote.textContent = r.message;
      if (r.ok) void refreshAccount().then(renderShop);
    });
  });
  shopList.addEventListener("click", (e) => {
    const card = (e.target as Element).closest(".cz-card") as HTMLElement | null;
    if (!card) return;
    const type = card.dataset.type as CosmeticType;
    const id = card.dataset.id ?? "default";

    // Tapping anywhere on a card previews it on the figure (try before you buy).
    shopSel[type] = id;
    renderShop();
    pulsePreview();

    // The Equip button wears it; Members opens the membership card; Buy spends medals.
    const btn = (e.target as Element).closest("button.cz-btn");
    if (!btn) return;
    const signedIn = Boolean(account?.signedIn);
    if (btn.classList.contains("member")) {
      // Cloaks and wings come with membership. Pitch it whether they're a guest or just not a member.
      shopNote.textContent = "Cloaks and wings come with membership, which keeps the game running and pays for new features.";
      openPremium();
    } else if (btn.classList.contains("equip")) {
      // Cosmetics are tracked per account. Guests can preview anything, but wearing it needs a free
      // account so the item has somewhere to live.
      if (!signedIn) {
        setVisible(shopOverlay, false); // step aside so the sign-in card isn't stuck behind the shop
        openAuth("Make a free account to wear cosmetics and earn medals. It only takes a moment.");
        return;
      }
      void equipCosmetic(type, id).then((err) => {
        if (err) shopNote.textContent = err;
        else pulsePreview();
      });
    } else if (btn.classList.contains("buy")) {
      // Paid items need an account so medals and ownership have somewhere to live.
      if (!signedIn) {
        setVisible(shopOverlay, false);
        openAuth("Make a free account to start earning medals and collecting cosmetics.");
        return;
      }
      shopNote.textContent = "One sec…";
      void buyCosmetic(id).then((err) => {
        if (err) shopNote.textContent = err; // e.g. "not enough medals"
        else {
          shopNote.textContent = "Nice, it's yours. Hit Equip to wear it.";
          pulsePreview();
        }
      });
    }
  });
}

/** Render the medal packs (bigger = better value, with savings badges). */
function renderPacks(): void {
  const last = MEDAL_PACKS.length - 1;
  packList.innerHTML = MEDAL_PACKS.map((p, i) => {
    const save = packSavings(p);
    const badge =
      i === last
        ? `<span class="pack-badge best">Best value</span>`
        : save > 0
          ? `<span class="pack-badge">Save ${save}%</span>`
          : "";
    return (
      `<button class="pack" data-id="${p.id}">${badge}` +
      `<span class="pack-medals">${MEDAL_SVG}${p.medals.toLocaleString()}</span>` +
      `<span class="pack-price">$${p.priceUsd.toFixed(2)}</span></button>`
    );
  }).join("");
}

function openBuyMedals(): void {
  buyMedalsNote.textContent = "";
  renderPacks();
  setVisible(buyMedalsOverlay, true);
}

function openPremium(): void {
  premiumNote.textContent = "";
  // Don't let an existing member or ad-free buyer purchase again.
  const member = isMember(account?.profile);
  const adFree = Boolean(account?.profile?.adFree);
  buyPremiumBtn.disabled = member;
  buyPremiumBtn.textContent = member ? "You're a member" : "Become a Member";
  // Membership already includes ad-free, so block Remove Ads for members as well as past buyers.
  const noAds = member || adFree;
  buyAdfreeBtn.disabled = noAds;
  buyAdfreeBtn.textContent = noAds ? "Ads already removed" : "Remove Ads";
  setVisible(premiumLegal, isNative()); // auto-renew disclosure is required beside a store subscription
  setVisible(premiumOverlay, true);
}

/** Buy a product: store IAP on native, Stripe Checkout on the web; show errors in the given note. */
function checkout(product: string, note: HTMLElement): void {
  // A purchase must land on an account so it can be granted/restored. Send guests to sign up first
  // (close the sheets so the sign-in dialog isn't stuck behind them).
  const needAccount = (): boolean => {
    if (account?.signedIn) return false;
    setVisible(buyMedalsOverlay, false);
    setVisible(premiumOverlay, false);
    setVisible(shopOverlay, false);
    openAuth("Make a free account first so your purchase saves to it. It only takes a moment.");
    return true;
  };

  // Native: store in-app purchase (RevenueCat). Stripe is never used inside the app.
  if (isNative()) {
    if (needAccount()) return;
    note.textContent = "Opening store…";
    void nativePurchase(product).then((r) => {
      note.textContent = r.message;
      if (r.ok) void refreshAccount();
    });
    return;
  }
  // CrazyGames iframe: external checkout can't run, so point them to the site.
  if (!stripeCheckoutAllowed()) {
    note.textContent = "Head to turfgame.io to grab this one.";
    return;
  }
  // Web: Stripe Checkout.
  if (needAccount()) return;
  note.textContent = "Opening checkout…";
  void startCheckout(product).then((err) => {
    if (err) note.textContent = err; // on success the page redirects to Stripe
  });
}

/** Buy-Medals sheet + Membership screen — both go through Stripe Checkout on the web. */
function wireMonetization(): void {
  if (!accountsEnabled) return;
  buyMedalsClose.addEventListener("click", () => setVisible(buyMedalsOverlay, false));
  buyMedalsOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === buyMedalsOverlay) setVisible(buyMedalsOverlay, false);
  });
  packList.addEventListener("click", (e) => {
    const pack = (e.target as Element).closest(".pack") as HTMLElement | null;
    if (!pack?.dataset.id) return;
    checkout(pack.dataset.id, buyMedalsNote);
  });
  openPremiumLink.addEventListener("click", () => {
    setVisible(buyMedalsOverlay, false);
    openPremium();
  });
  premiumClose.addEventListener("click", () => setVisible(premiumOverlay, false));
  premiumOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === premiumOverlay) setVisible(premiumOverlay, false);
  });
  buyPremiumBtn.addEventListener("click", () => checkout("membership", premiumNote));
  buyAdfreeBtn.addEventListener("click", () => checkout("adfree", premiumNote));
}

/** After returning from Stripe, refresh the balance and confirm (the webhook credits server-side). */
function handlePurchaseReturn(): void {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("purchase");
  if (!result) return;
  history.replaceState(null, "", window.location.pathname); // clean the URL
  if (result === "success") {
    // The webhook is usually near-instant; give it a beat, then pull the new balance.
    window.setTimeout(() => void refreshAccount(), 1500);
  }
}

/** Copy the current room code to the clipboard, with a brief "Copied!" confirmation. */
async function copyRoomCode(): Promise<void> {
  const id = currentRoom?.roomId;
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = id;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* give up silently */
    }
    document.body.removeChild(ta);
  }
  roomTag.textContent = "Copied!";
  window.setTimeout(() => {
    if (currentRoom) roomTag.textContent = `room: ${currentRoom.roomId} ⧉`;
  }, 1000);
}

/** Cycle the tutorial lines on the home screen, one at a time, fading between them. */
function startHowtoCycle(): void {
  let i = 0;
  howto.textContent = HOWTO_LINES[i]!;
  window.setInterval(() => {
    howto.style.opacity = "0";
    window.setTimeout(() => {
      i = (i + 1) % HOWTO_LINES.length;
      howto.textContent = HOWTO_LINES[i]!;
      howto.style.opacity = "1";
    }, 800); // matches the .howto opacity transition
  }, 5200);
}

/**
 * Tailor the UI to where we're running. On the native iOS/Android app we hide things that don't
 * belong inside a store app (the external Ko-fi donation link and the App Store / Google Play
 * badges) and surface the store-required bits (Restore Purchases, subscription disclosure). One
 * build, behavior switched by context — never a separate mobile codebase.
 */
function applyRunContext(): void {
  const ctx = runContext();
  document.body.classList.add(`ctx-${ctx}`);
  if (isNative()) {
    // External payment/donation surfaces aren't allowed alongside store IAP.
    for (const elx of [kofiHome, kofiGame, appStoreLink, playLink]) setVisible(elx, false);
    setVisible(shopRestore, true); // IAP apps must offer Restore Purchases
  }
}

async function boot(): Promise<void> {
  if (isTouchDevice()) document.body.classList.add("touch"); // enables the touch-scoped CSS
  applyRunContext();
  void initNativeShell(); // native only: landscape lock, status bar, hide splash
  game = await createGame();
  await catalog.loadCatalog(); // DB cosmetics + today's rotation (falls back to built-ins if offline)
  wireStartScreen();
  wireAccount();
  wireShop();
  wireDeathScreen();
  wirePrivate();
  wireMonetization();
  wireSoftKeyboard(); // keep dialogs above the on-screen keyboard (mobile + webviews)
  // Ads: suppress for members and the ad-free purchase; the web SDK is chosen by build env.
  ads.setAdFreeCheck(() => Boolean(account?.profile?.adFree) || isMember(account?.profile));
  ads.initWebAds();
  handlePurchaseReturn(); // if we just came back from Stripe, refresh the balance
  void initAccounts(); // load any saved session (no-op when accounts aren't configured)
  startHowtoCycle();
  // Fade the start screen in after first paint (ui-ux §1).
  requestAnimationFrame(() => requestAnimationFrame(() => setVisible(startScreen, true)));
}

void boot();
