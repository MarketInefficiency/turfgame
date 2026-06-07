import { CONFIG } from "./config.js";

/**
 * Room-synced day/night timing (ui-ux.md §4, architecture.md). The server owns the
 * canonical phase; clients read it and derive colors. Both use these pure functions so
 * everyone in a room is visually in sync.
 */

/** Canonical 0..1 time-of-day from elapsed room seconds. */
export function dayNightPhase(elapsedSec: number): number {
  return (elapsedSec % CONFIG.DAY_NIGHT_PERIOD) / CONFIG.DAY_NIGHT_PERIOD;
}

/**
 * 0 (full day) … 1 (full night) from a 0..1 phase. A trapezoid — day hold, smooth
 * ramp to night over DAY_NIGHT_TRANSITION, night hold, ramp back — eased with smoothstep.
 */
export function nightFactor(phase: number): number {
  const tr = CONFIG.DAY_NIGHT_TRANSITION / CONFIG.DAY_NIGHT_PERIOD;
  const hold = (1 - 2 * tr) / 2;
  const a = hold;
  const b = a + tr;
  const c = b + hold;

  let nf: number;
  if (phase < a) nf = 0;
  else if (phase < b) nf = (phase - a) / tr;
  else if (phase < c) nf = 1;
  else nf = 1 - (phase - c) / tr;

  return nf * nf * (3 - 2 * nf); // smoothstep
}
