import { Container, Graphics } from "pixi.js";
import { CONFIG, GRID_COLS, GRID_ROWS, GRID_SIZE, cellX, cellY } from "@territory/shared";

const CHUNK = 16; // cells per chunk side
const CHUNKS_X = Math.ceil(GRID_COLS / CHUNK);
const CHUNKS_Y = Math.ceil(GRID_ROWS / CHUNK);

/**
 * Renders the territory grid as colored cells. Per architecture.md, only changed
 * regions are repainted: the grid is split into chunks, and a chunk is redrawn only
 * when one of its cells changes (or its owner's color first becomes known).
 */
export class TerritoryLayer {
  readonly view = new Container();
  private readonly grid = new Uint16Array(GRID_SIZE);
  private readonly chunks: Graphics[] = [];
  private dirty = new Set<number>();
  private readonly colorOf: (owner: number) => string | null;

  constructor(colorOf: (owner: number) => string | null) {
    this.colorOf = colorOf;
    for (let i = 0; i < CHUNKS_X * CHUNKS_Y; i++) {
      const g = new Graphics();
      this.chunks.push(g);
      this.view.addChild(g);
    }
  }

  ownerAt(idx: number): number {
    return this.grid[idx] ?? 0;
  }

  /** World-space centroid of all cells owned by `owner`, or null if they hold none. */
  ownerCentroid(owner: number): { x: number; y: number } | null {
    if (owner <= 0) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (this.grid[i] === owner) {
        sx += cellX(i);
        sy += cellY(i);
        n++;
      }
    }
    if (n === 0) return null;
    const S = CONFIG.GRID_CELL;
    return { x: (sx / n + 0.5) * S, y: (sy / n + 0.5) * S };
  }

  /**
   * Trace a border around one owner's cells into `g` (game-spec §11 private gold ring).
   * Draws every cell edge that faces a non-owned cell. Client-side only — call with the
   * local player's owner id so the ring is visible to them alone.
   */
  drawOwnerOutline(owner: number, g: Graphics, colorHex: string, widthWorld: number): void {
    g.clear();
    if (owner <= 0) return;
    const S = CONFIG.GRID_CELL;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (this.grid[i] !== owner) continue;
      const cx = cellX(i);
      const cy = cellY(i);
      const x = cx * S;
      const y = cy * S;
      if (cy === 0 || this.grid[i - GRID_COLS] !== owner) g.moveTo(x, y).lineTo(x + S, y);
      if (cy === GRID_ROWS - 1 || this.grid[i + GRID_COLS] !== owner) g.moveTo(x, y + S).lineTo(x + S, y + S);
      if (cx === 0 || this.grid[i - 1] !== owner) g.moveTo(x, y).lineTo(x, y + S);
      if (cx === GRID_COLS - 1 || this.grid[i + 1] !== owner) g.moveTo(x + S, y).lineTo(x + S, y + S);
    }
    g.stroke({ width: widthWorld, color: colorHex, alpha: 0.95 });
  }

  private chunkOf(idx: number): number {
    return ((cellY(idx) / CHUNK) | 0) * CHUNKS_X + ((cellX(idx) / CHUNK) | 0);
  }

  applySnapshot(grid: Uint16Array): void {
    this.grid.set(grid);
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i);
  }

  setCell(idx: number, owner: number): void {
    if (this.grid[idx] === owner) return;
    this.grid[idx] = owner;
    this.dirty.add(this.chunkOf(idx));
  }

  /** Repaint dirty chunks. Chunks referencing a not-yet-known color stay dirty. */
  redraw(): void {
    if (this.dirty.size === 0) return;
    const S = CONFIG.GRID_CELL;
    const stillDirty = new Set<number>();

    for (const ch of this.dirty) {
      const g = this.chunks[ch]!;
      g.clear();
      const cx0 = (ch % CHUNKS_X) * CHUNK;
      const cy0 = ((ch / CHUNKS_X) | 0) * CHUNK;
      let pending = false;

      for (let dy = 0; dy < CHUNK; dy++) {
        const cy = cy0 + dy;
        if (cy >= GRID_ROWS) break;
        for (let dx = 0; dx < CHUNK; dx++) {
          const cx = cx0 + dx;
          if (cx >= GRID_COLS) break;
          const owner = this.grid[cy * GRID_COLS + cx]!;
          if (owner === 0) continue;
          const color = this.colorOf(owner);
          if (!color) {
            pending = true; // owner's color not synced yet; revisit next frame
            continue;
          }
          g.rect(cx * S, cy * S, S, S).fill(color);
        }
      }
      if (pending) stillDirty.add(ch);
    }

    this.dirty = stillDirty;
  }
}
