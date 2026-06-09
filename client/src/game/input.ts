/**
 * Pointer input → aim vector + draw flag (controls in CLAUDE.md). The avatar is always
 * screen-centered, so the cursor's offset from screen center is the aim (direction +
 * magnitude → speed). Holding the LEFT mouse button sets `drawing` (the claim line).
 *
 * Two input schemes, picked by device. Both emit the SAME {aimX, aimY, drawing} packet, so
 * the shared sim and the authoritative server never change:
 *  - Desktop (mouse): cursor offset from screen center; left button = draw. (unchanged)
 *  - Touch (phone/tablet): left half of the screen is a floating joystick (steer); the right
 *    half is an invisible "hold to draw" zone. Tracked per finger so both work at once.
 */
import { CONFIG } from "@territory/shared";

export interface AimState {
  aimX: number;
  aimY: number;
  drawing: boolean;
}

export interface InputHandle {
  state: AimState;
  dispose(): void;
}

/**
 * True when the primary pointer is touch (phone/tablet) — selects the on-screen control scheme.
 * Uses the primary-pointer media query so touch laptops (primary = mouse) keep the mouse scheme.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
  return (navigator.maxTouchPoints ?? 0) > 0 && !window.matchMedia?.("(pointer: fine)")?.matches;
}

export function createInput(): InputHandle {
  const state: AimState = { aimX: 0, aimY: 0, drawing: false };
  return isTouchDevice() ? createTouchInput(state) : createMouseInput(state);
}

/** Desktop scheme — unchanged from the original mouse controls. */
function createMouseInput(state: AimState): InputHandle {
  const onMove = (e: PointerEvent): void => {
    state.aimX = e.clientX - window.innerWidth / 2;
    state.aimY = e.clientY - window.innerHeight / 2;
  };
  const onDown = (e: PointerEvent): void => {
    if (e.button === 0) state.drawing = true;
  };
  const onUp = (e: PointerEvent): void => {
    if (e.button === 0) state.drawing = false;
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);

  return {
    state,
    dispose(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    },
  };
}

/** Touch scheme — floating joystick on the left, invisible draw zone on the right. */
function createTouchInput(state: AimState): InputHandle {
  // A JOY_RADIUS thumb-drag should mean full speed; the sim's full-speed distance is larger,
  // so scale the offset up by this factor (direction is preserved, only magnitude is scaled).
  const scale = CONFIG.AIM_FULL_SPEED_DIST / CONFIG.JOY_RADIUS;

  let moveId: number | null = null; // finger steering (left half)
  let drawId: number | null = null; // finger drawing (right half)
  let ox = 0;
  let oy = 0; // joystick origin (where the steer finger first landed)

  // Visuals: a floating joystick ring + knob, and a soft dot where the draw finger rests.
  const stick = document.createElement("div");
  stick.className = "joystick";
  const knob = document.createElement("div");
  knob.className = "joystick-knob";
  stick.appendChild(knob);
  stick.style.display = "none";
  const drawDot = document.createElement("div");
  drawDot.className = "draw-dot";
  drawDot.style.display = "none";
  document.body.appendChild(stick);
  document.body.appendChild(drawDot);

  // Taps on real HUD controls (Leave, room code, donate link) must behave normally, not steer/draw.
  const isUi = (t: EventTarget | null): boolean =>
    t instanceof Element && t.closest("button, a, input, label, select, textarea") !== null;

  const updateJoystick = (x: number, y: number): void => {
    let dx = x - ox;
    let dy = y - oy;
    const d = Math.hypot(dx, dy);
    const r = CONFIG.JOY_RADIUS;
    if (d > r) {
      dx = (dx / d) * r;
      dy = (dy / d) * r; // clamp to the ring → max speed
    }
    state.aimX = dx * scale;
    state.aimY = dy * scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== "touch" || isUi(e.target)) return;
    // In portrait the rotate gate covers the screen — ignore touches so we don't steer/draw behind it.
    if (window.matchMedia("(orientation: portrait)").matches) return;
    if (e.clientX < window.innerWidth / 2) {
      if (moveId !== null) return; // already steering with another finger
      moveId = e.pointerId;
      ox = e.clientX;
      oy = e.clientY;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy}px`;
      stick.style.display = "block";
      knob.style.transform = "translate(0px, 0px)";
      state.aimX = 0;
      state.aimY = 0;
    } else {
      if (drawId !== null) return;
      drawId = e.pointerId;
      state.drawing = true;
      drawDot.style.left = `${e.clientX}px`;
      drawDot.style.top = `${e.clientY}px`;
      drawDot.style.display = "block";
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    if (e.pointerId === moveId) {
      updateJoystick(e.clientX, e.clientY);
    } else if (e.pointerId === drawId) {
      drawDot.style.left = `${e.clientX}px`;
      drawDot.style.top = `${e.clientY}px`;
    }
  };

  const endPointer = (id: number): void => {
    if (id === moveId) {
      moveId = null;
      state.aimX = 0;
      state.aimY = 0; // release = stop moving
      stick.style.display = "none";
    } else if (id === drawId) {
      drawId = null;
      state.drawing = false; // release = stop drawing
      drawDot.style.display = "none";
    }
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerType === "touch") endPointer(e.pointerId);
  };
  // A long-press while drawing must not pop the iOS/Android selection callout or context menu.
  const onCtx = (e: Event): void => e.preventDefault();

  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("contextmenu", onCtx);

  return {
    state,
    dispose(): void {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("contextmenu", onCtx);
      stick.remove();
      drawDot.remove();
    },
  };
}
