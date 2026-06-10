import "./styles.css";
import type { Room } from "colyseus.js";
import { MSG, type Died } from "@territory/shared";
import { createGame, type GameView } from "./game/game";
import { isTouchDevice } from "./game/input";
import { join, type JoinMode } from "./net/client";
import { SERVER_URL } from "./net/config";
import { KOFI_URL } from "./links";
import { loadName, saveName } from "./storage";

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
const roomCode = el<HTMLInputElement>("room-code");
const playBtn = el<HTMLButtonElement>("play-btn");
const formError = el("form-error");
const hud = el("game-hud");
const roomTag = el<HTMLButtonElement>("room-tag");
const leaveBtn = el<HTMLButtonElement>("leave-btn");
const hudLeft = el("hud-left");
const kofiHome = el<HTMLAnchorElement>("kofi-home");
const kofiGame = el<HTMLAnchorElement>("kofi-game");
const tagline = el("tagline");
const howto = el("howto");

// Shown when there's no previous run; replaced by the last score after a death.
const DEFAULT_TAGLINE = "Draw loops. Claim turf. Rule the map.";

// How long the "Defeated…" banner holds over the arena before the start screen fades back in.
const DEFEAT_BANNER_MS = 1700;

// One sentence at a time on the home screen: how to play + the three ways to kill.
const HOWTO_LINES = [
  "Move with your mouse. Hold left click to draw a loop and claim the land inside it.",
  "Wilderness: ram a rival in the open and you both bleed army. The bigger one survives.",
  "Trespass: stand on someone's claimed turf and the owner drops you in one hit.",
  "Your capital banks power from every bit of army you strip off enemies in fights.",
  "Siege: overlap an enemy's capital to drain its power into yours, then take their land.",
  "Outgrow everyone and top the leaderboard.",
];

let game: GameView;
let currentRoom: Room | null = null;

function setVisible(node: HTMLElement, visible: boolean): void {
  node.classList.toggle("hidden", !visible);
}

function selectedMode(): JoinMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return (checked?.value as JoinMode) ?? "random";
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
  tagline.textContent = score > 0 ? `You obtained ${score.toLocaleString()} power` : DEFAULT_TAGLINE;
  setVisible(hud, false);
  setVisible(hudLeft, false);
  setVisible(kofiGame, false);
  nameInput.value = loadName(); // pre-fill on return (ui-ux §5)
  formError.textContent = message ?? "";
  playBtn.disabled = false;
  playBtn.textContent = "Play";
  setVisible(startScreen, true);
}

function wireRoom(room: Room): void {
  // Death: flash a "Defeated…" banner over the live arena (cause + final power), hold it just
  // long enough to read, then leave the room and fade back to the start screen.
  room.onMessage(MSG.DIED, (payload: Died | undefined) => {
    if (currentRoom !== room) return;
    currentRoom = null; // mark handled so onLeave below skips it (room stays live behind the banner)
    game.deathFlash(payload?.cause ?? "wiped");
    window.setTimeout(() => {
      void room.leave();
      backToStart();
    }, DEFEAT_BANNER_MS);
  });
  // Fires only for unexpected drops: the Leave button nulls `currentRoom` before
  // calling room.leave(), so a user-initiated leave is already handled and skipped.
  room.onLeave(() => {
    if (currentRoom === room) backToStart("Lost connection to the game.");
  });
  room.onError((_code, message) => {
    if (currentRoom === room) backToStart(message ?? "Connection trouble, try again.");
  });
}

/**
 * Blur whatever text field is focused, closing the soft keyboard. Needed because in-app webviews
 * (e.g. the CrazyGames app) give no keyboard "Done" affordance, so the page must dismiss it.
 */
function dismissKeyboard(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) a.blur();
}

async function handlePlay(): Promise<void> {
  formError.textContent = "";

  let name = nameInput.value.trim();
  if (!name) {
    // Fall back to a random guest name (ui-ux §1).
    name = `guest-${Math.floor(1000 + Math.random() * 9000)}`;
    nameInput.value = name;
  }

  const mode = selectedMode();
  const roomId = roomCode.value.trim();
  if (mode === "specific" && !roomId) {
    formError.textContent = "Enter a room code to join a specific room.";
    roomCode.focus();
    return;
  }

  dismissKeyboard(); // drop the soft keyboard as we join (webviews won't do it on their own)
  playBtn.disabled = true;
  playBtn.textContent = "Joining…";
  try {
    const room = await join({ mode, name, roomId });
    saveName(name);
    currentRoom = room;
    wireRoom(room);
    enterGame(room, name);
  } catch (err) {
    formError.textContent = friendlyError(err);
    playBtn.disabled = false;
    playBtn.textContent = "Play";
  }
}

function wireStartScreen(): void {
  nameInput.value = loadName();
  kofiHome.href = KOFI_URL;
  kofiGame.href = KOFI_URL;

  // The room-code field is only relevant to "join a specific room".
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.addEventListener("change", () => {
      const specific = selectedMode() === "specific";
      roomCode.disabled = !specific;
      if (specific) roomCode.focus();
    });
  }

  playBtn.addEventListener("click", () => void handlePlay());

  // Keyboard handling for in-app webviews (e.g. the CrazyGames app), which don't shift the page
  // when the soft keyboard opens and offer no way to dismiss it. All touch-only and desktop-safe:
  //  - focus: pin the form to the top (CSS .kb-open) so the field stays above the keyboard.
  //  - tap off the text fields: dismiss the keyboard.
  //  - focus leaving the fields for good: unpin and reset any residual scroll.
  for (const input of [nameInput, roomCode]) {
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
      if (a !== nameInput && a !== roomCode) {
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

async function boot(): Promise<void> {
  if (isTouchDevice()) document.body.classList.add("touch"); // enables the touch-scoped CSS
  game = await createGame();
  wireStartScreen();
  startHowtoCycle();
  // Fade the start screen in after first paint (ui-ux §1).
  requestAnimationFrame(() => requestAnimationFrame(() => setVisible(startScreen, true)));
}

void boot();
