import { CONFIG } from "./config.js";

/**
 * Territory grid geometry, shared by server (authority) and client (rendering/home
 * detection). The map is a grid of cells; each cell's owner is a numeric player id or
 * NEUTRAL (0). Ownership data itself travels on the custom binary channel, not here.
 */
export const GRID_COLS = Math.floor(CONFIG.MAP_WIDTH / CONFIG.GRID_CELL);
export const GRID_ROWS = Math.floor(CONFIG.MAP_HEIGHT / CONFIG.GRID_CELL);
export const GRID_SIZE = GRID_COLS * GRID_ROWS;

/** Owner id reserved for unclaimed cells. */
export const NEUTRAL = 0;

/**
 * Owner id for dead/abandoned land that is mid-decay (game-spec §10). Its former owner
 * is gone, so the client renders these cells in a neutral grey while they shrink away.
 */
export const DECAY_OWNER = 65535;

export function cellIndex(cx: number, cy: number): number {
  return cy * GRID_COLS + cx;
}

export function cellX(idx: number): number {
  return idx % GRID_COLS;
}

export function cellY(idx: number): number {
  return Math.floor(idx / GRID_COLS);
}

/** World coordinate → clamped cell column/row. */
export function worldToCellX(x: number): number {
  const c = Math.floor(x / CONFIG.GRID_CELL);
  return c < 0 ? 0 : c >= GRID_COLS ? GRID_COLS - 1 : c;
}

export function worldToCellY(y: number): number {
  const c = Math.floor(y / CONFIG.GRID_CELL);
  return c < 0 ? 0 : c >= GRID_ROWS ? GRID_ROWS - 1 : c;
}
