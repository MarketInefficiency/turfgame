import { CONFIG } from "../config.js";

/**
 * Shared movement simulation (architecture.md: "shared sim, not duplicated sim").
 * The server runs this for authority; the client runs the SAME function for local
 * prediction. It must stay pure and deterministic — no DOM, no Node APIs, no clocks.
 */

export interface MoveInput {
  /** Cursor offset from the avatar/screen center (screen px): direction + magnitude. */
  aimX: number;
  aimY: number;
}

/** Anything with a position and army can be moved (server schema Player or a client body). */
export interface MovableBody {
  x: number;
  y: number;
  army: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smaller army = faster (game-spec §4). maxSpeed falls off as army grows. */
export function maxSpeedForArmy(army: number): number {
  const { SPEED_MIN, SPEED_MAX, SPEED_K } = CONFIG;
  const a = Math.max(0, army);
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * (SPEED_K / (SPEED_K + a));
}

/** Map an aim-offset length (screen px) to a 0..1 throttle (deadzone → full). */
export function aimThrottle(len: number): number {
  const { AIM_DEADZONE, AIM_FULL_SPEED_DIST } = CONFIG;
  if (len <= AIM_DEADZONE) return 0;
  const t = (len - AIM_DEADZONE) / (AIM_FULL_SPEED_DIST - AIM_DEADZONE);
  return clamp(t, 0, 1);
}

/**
 * Advance a body by one step of `dt` seconds given its aim input. Direction is the
 * normalized aim vector (zoom-independent); magnitude throttles 0..1 of max speed.
 * Position is clamped to the bounded map.
 */
export function stepMovement(body: MovableBody, input: MoveInput, dt: number): void {
  const len = Math.hypot(input.aimX, input.aimY);
  const throttle = aimThrottle(len);
  if (throttle > 0 && len > 0) {
    const speed = maxSpeedForArmy(body.army) * throttle;
    body.x += (input.aimX / len) * speed * dt;
    body.y += (input.aimY / len) * speed * dt;
  }
  body.x = clamp(body.x, 0, CONFIG.MAP_WIDTH);
  body.y = clamp(body.y, 0, CONFIG.MAP_HEIGHT);
}
