import { Container, Graphics, Sprite } from "pixi.js";
import { CONFIG, GRID_COLS, GRID_ROWS, GRID_SIZE, cellX, cellY } from "@territory/shared";
import { makeCosmeticSprite } from "./cosmeticTexture";

const CHUNK = 16; // cells per chunk side
const CHUNKS_X = Math.ceil(GRID_COLS / CHUNK);
const CHUNKS_Y = Math.ceil(GRID_ROWS / CHUNK);

/** Per image-skin owner: one sprite of their art, masked to their cells (so it never tiles). */
type SkinOverlay = { container: Container; sprite: Sprite; mask: Graphics; url: string };

/**
 * Renders the territory grid as colored cells. Per architecture.md, only changed
 * regions are repainted: the grid is split into chunks, and a chunk is redrawn only
 * when one of its cells changes (or its owner's color first becomes known).
 *
 * Image/GIF-skin owners additionally get their land painted with their skin art. Rather than
 * tiling a texture per cell, we draw ONE sprite stretched to the owner's bounding box and mask it
 * with their exact cells — so you always see a single full picture cropped to the kingdom's shape.
 * A GIF skin uses a GifSprite here, so the whole territory animates. These overlays sit on top of
 * the flat-colour chunks (which still paint underneath as an instant fallback while art loads).
 */
export class TerritoryLayer {
  readonly view = new Container();
  private readonly grid = new Uint16Array(GRID_SIZE);
  private readonly chunks: Graphics[] = [];
  private readonly imageLayer = new Container(); // skin overlays, above the colour chunks
  private dirty = new Set<number>();
  private readonly colorOf: (owner: number) => string | null;
  private readonly ownerSkinUrl = new Map<number, string>(); // current skin url per owner ("" = none)
  private readonly overlays = new Map<number, SkinOverlay>();
  private overlayDirty = new Set<number>(); // owners whose mask/bbox needs rebuilding

  constructor(colorOf: (owner: number) => string | null) {
    this.colorOf = colorOf;
    for (let i = 0; i < CHUNKS_X * CHUNKS_Y; i++) {
      const g = new Graphics();
      this.chunks.push(g);
      this.view.addChild(g);
    }
    this.view.addChild(this.imageLayer);
  }

  /** Set (or clear with null/"") the image/GIF skin painted across an owner's territory. */
  setOwnerSkinUrl(owner: number, url: string | null): void {
    if (owner <= 0) return;
    const want = url ?? "";
    if ((this.ownerSkinUrl.get(owner) ?? "") === want) return;
    this.ownerSkinUrl.set(owner, want);
    if (!want) {
      this.removeOverlay(owner);
      return;
    }
    void makeCosmeticSprite(want).then((sprite) => {
      if ((this.ownerSkinUrl.get(owner) ?? "") !== want) {
        sprite.destroy(); // skin changed while the art loaded
        return;
      }
      this.removeOverlay(owner);
      const container = new Container();
      const mask = new Graphics();
      sprite.mask = mask;
      container.addChild(sprite, mask);
      this.imageLayer.addChild(container);
      this.overlays.set(owner, { container, sprite, mask, url: want });
      this.overlayDirty.add(owner); // size + mask it on the next redraw
    });
  }

  private removeOverlay(owner: number): void {
    const ov = this.overlays.get(owner);
    if (ov) {
      // destroy(false): GifSprite.destroy takes a boolean — never let it destroy the shared,
      // cached GifSource (other avatars/territories may still be using it). Detach first so the
      // container's cascading destroy doesn't hit it again.
      ov.sprite.removeFromParent();
      ov.sprite.destroy(false);
      ov.container.destroy({ children: true });
      this.overlays.delete(owner);
    }
    this.overlayDirty.delete(owner);
  }

  /** Resize each dirty owner's skin sprite to their bounding box and redraw its cell mask. */
  private rebuildOverlays(): void {
    const S = CONFIG.GRID_CELL;
    for (const owner of this.overlayDirty) {
      const ov = this.overlays.get(owner);
      if (!ov) continue; // art still loading
      ov.mask.clear();
      let x0 = 0;
      let y0 = 0;
      let x1 = 0;
      let y1 = 0;
      let found = false;
      for (let i = 0; i < GRID_SIZE; i++) {
        if (this.grid[i] !== owner) continue;
        const cx = cellX(i);
        const cy = cellY(i);
        if (!found) {
          x0 = x1 = cx;
          y0 = y1 = cy;
          found = true;
        } else {
          if (cx < x0) x0 = cx;
          else if (cx > x1) x1 = cx;
          if (cy < y0) y0 = cy;
          else if (cy > y1) y1 = cy;
        }
        ov.mask.rect(cx * S, cy * S, S, S);
      }
      if (!found) {
        // No land right now (dead / mid-respawn). Keep the overlay but hide it — so when this
        // owner id is reused (respawn reuses ids) and reclaims land, the SAME skin sprite snaps
        // back. Destroying it here is what made a respawned skin paint flat colour.
        ov.container.visible = false;
        continue;
      }
      ov.container.visible = true;
      ov.mask.fill(0xffffff);
      // One copy of the image stretched across the bounding box; the mask crops it to the cells.
      ov.sprite.position.set(x0 * S, y0 * S);
      ov.sprite.width = (x1 - x0 + 1) * S;
      ov.sprite.height = (y1 - y0 + 1) * S;
    }
    this.overlayDirty.clear();
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
    // Lay down all border segments; reused for each stroke pass below.
    const trace = (): void => {
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
    };
    // Two passes so the ring pops on BOTH the white day floor and the black night floor: a soft
    // wide glow underneath, then a crisp bright core on top.
    trace();
    g.stroke({ width: widthWorld * 3, color: colorHex, alpha: 0.32 });
    trace();
    g.stroke({ width: widthWorld * 1.4, color: colorHex, alpha: 1 });
  }

  /**
   * Black border around every OTHER player's land (all owners except `exceptOwner` and `decayOwner`).
   * One grid pass draws each owned cell's edges that face a different owner — so every rival kingdom
   * gets outlined. Drawn into a shared Graphics; pair with the local player's gold outline on top.
   */
  drawEnemyOutlines(
    exceptOwner: number,
    decayOwner: number,
    g: Graphics,
    colorHex: string,
    widthWorld: number,
  ): void {
    g.clear();
    const S = CONFIG.GRID_CELL;
    for (let i = 0; i < GRID_SIZE; i++) {
      const owner = this.grid[i]!;
      if (owner === 0 || owner === exceptOwner || owner === decayOwner) continue;
      const cx = cellX(i);
      const cy = cellY(i);
      const x = cx * S;
      const y = cy * S;
      if (cy === 0 || this.grid[i - GRID_COLS] !== owner) g.moveTo(x, y).lineTo(x + S, y);
      if (cy === GRID_ROWS - 1 || this.grid[i + GRID_COLS] !== owner) g.moveTo(x, y + S).lineTo(x + S, y + S);
      if (cx === 0 || this.grid[i - 1] !== owner) g.moveTo(x, y).lineTo(x, y + S);
      if (cx === GRID_COLS - 1 || this.grid[i + 1] !== owner) g.moveTo(x + S, y).lineTo(x + S, y + S);
    }
    g.stroke({ width: widthWorld, color: colorHex, alpha: 0.9 });
  }

  /**
   * Trace EVERY owner's border (all kingdoms) into `g` as a wide soft stroke — paired with an
   * additive blend + night-scaled alpha so territory edges radiate a little light at night.
   */
  drawBorderGlow(decayOwner: number, g: Graphics, colorHex: string): void {
    g.clear();
    const S = CONFIG.GRID_CELL;
    for (let i = 0; i < GRID_SIZE; i++) {
      const owner = this.grid[i]!;
      if (owner === 0 || owner === decayOwner) continue;
      const cx = cellX(i);
      const cy = cellY(i);
      const x = cx * S;
      const y = cy * S;
      if (cy === 0 || this.grid[i - GRID_COLS] !== owner) g.moveTo(x, y).lineTo(x + S, y);
      if (cy === GRID_ROWS - 1 || this.grid[i + GRID_COLS] !== owner) g.moveTo(x, y + S).lineTo(x + S, y + S);
      if (cx === 0 || this.grid[i - 1] !== owner) g.moveTo(x, y).lineTo(x, y + S);
      if (cx === GRID_COLS - 1 || this.grid[i + 1] !== owner) g.moveTo(x + S, y).lineTo(x + S, y + S);
    }
    g.stroke({ width: 12, color: colorHex, alpha: 0.85 }); // a touch wider so the land reads as lit
  }

  private chunkOf(idx: number): number {
    return ((cellY(idx) / CHUNK) | 0) * CHUNKS_X + ((cellX(idx) / CHUNK) | 0);
  }

  applySnapshot(grid: Uint16Array): void {
    this.grid.set(grid);
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i);
    for (const owner of this.overlays.keys()) this.overlayDirty.add(owner);
  }

  setCell(idx: number, owner: number): void {
    const prev = this.grid[idx]!;
    if (prev === owner) return;
    this.grid[idx] = owner;
    this.dirty.add(this.chunkOf(idx));
    // A skinned owner gaining or losing this cell changes their silhouette → rebuild their overlay.
    if (this.overlays.has(prev)) this.overlayDirty.add(prev);
    if (this.overlays.has(owner)) this.overlayDirty.add(owner);
  }

  /** Repaint dirty chunks and rebuild any skin overlays whose territory changed. */
  redraw(): void {
    if (this.overlayDirty.size > 0) this.rebuildOverlays();
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
