import "./styles.css";
import type { Room } from "colyseus.js";
import { MSG } from "@territory/shared";
import { createGame, type GameView } from "./game/game";
import { join, type JoinMode } from "./net/client";
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
  const msg = err instanceof Error ? err.message : String(err);
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
  // Death (army → 0, or debug self-destruct): return to the start screen, name kept.
  room.onMessage(MSG.DIED, () => {
    if (currentRoom !== room) return;
    currentRoom = null; // mark handled so onLeave below skips it
    void room.leave();
    backToStart("You got taken out. Jump back in!");
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
  for (const input of [nameInput, roomCode]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void handlePlay();
    });
  }
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
  game = await createGame();
  wireStartScreen();
  startHowtoCycle();
  // Fade the start screen in after first paint (ui-ux §1).
  requestAnimationFrame(() => requestAnimationFrame(() => setVisible(startScreen, true)));
}

void boot();
