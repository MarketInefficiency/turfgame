/**
 * Pointer input → aim vector + draw flag (controls in CLAUDE.md). The avatar is always
 * screen-centered, so the cursor's offset from screen center is the aim (direction +
 * magnitude → speed). Holding the LEFT mouse button sets `drawing` (claim line; the
 * actual claiming lands in M2 pass (b)).
 */
export interface AimState {
  aimX: number;
  aimY: number;
  drawing: boolean;
}

export interface InputHandle {
  state: AimState;
  dispose(): void;
}

export function createInput(): InputHandle {
  const state: AimState = { aimX: 0, aimY: 0, drawing: false };

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
