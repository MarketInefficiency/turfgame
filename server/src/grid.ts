import {
  CONFIG,
  DECAY_OWNER,
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  NEUTRAL,
  cellIndex,
  cellX,
  cellY,
} from "@territory/shared";

/**
 * Authoritative territory grid (architecture.md "state model"). Owner per cell is a
 * numeric player id or NEUTRAL. Changes accumulate in a dirty set and are flushed as
 * compact binary deltas each tick; a one-time RLE snapshot is sent on join.
 *
 * A closed loop INHERITS enclosed enemy cells; a non-closing slash STRIPS the enemy
 * cells it crossed to neutral. `enforceContiguity` keeps each kingdom one connected
 * mass, resolving severed pieces (loop-sever → inherited by the cutter; otherwise neutral).
 */
export class ServerGrid {
  readonly cells = new Uint16Array(GRID_SIZE);
  private readonly counts = new Map<number, number>();
  private readonly dirty = new Set<number>();
  /** Each owner's spawn/core cell — the component kept when contiguity is enforced. */
  private readonly cores = new Map<number, number>();
  /** Cells that just turned to decaying rubble this tick; the room drains these for the crumble. */
  private freshDecay: number[] = [];

  count(owner: number): number {
    return this.counts.get(owner) ?? 0;
  }

  setCore(owner: number, idx: number): void {
    this.cores.set(owner, idx);
  }

  setOwner(idx: number, owner: number): void {
    const prev = this.cells[idx]!;
    if (prev === owner) return;
    this.cells[idx] = owner;
    if (prev !== NEUTRAL) this.counts.set(prev, (this.counts.get(prev) ?? 1) - 1);
    if (owner !== NEUTRAL) this.counts.set(owner, (this.counts.get(owner) ?? 0) + 1);
    this.dirty.add(idx);
    // Any cell that becomes rubble (a player loses it to neutral via shed/sever/decay/death)
    // is recorded so it crumbles away rather than vanishing. Cells captured INTO a player go
    // straight to that owner here and are never recorded.
    if (owner === DECAY_OWNER) this.freshDecay.push(idx);
  }

  /** Take (and clear) the cells that just turned to rubble, for the room's decay queue. */
  takeFreshDecay(): number[] {
    if (this.freshDecay.length === 0) return [];
    const out = this.freshDecay;
    this.freshDecay = [];
    return out;
  }

  /**
   * Grow an ORGANIC, irregular blob of `targetCells` owned cells outward from (cx,cy),
   * bounded within `maxRadius` and only over neutral ground. Used to give "established"
   * bots believable, played-in territory instead of a tell-tale perfect circle. Growth is
   * Eden-style accretion biased toward cells nestled into the blob (keeps it a rounded
   * mass) with occasional random picks (bumps, bays) so the outline looks hand-grown.
   */
  seedBlob(owner: number, cx: number, cy: number, maxRadius: number, targetCells: number): void {
    if (cx < 0 || cy < 0 || cx >= GRID_COLS || cy >= GRID_ROWS) return;
    const r2 = maxRadius * maxRadius;
    const inBounds = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2;
    const ownedNbrs = (idx: number): number => {
      const x = cellX(idx);
      const y = cellY(idx);
      let c = 0;
      if (x + 1 < GRID_COLS && this.cells[idx + 1] === owner) c++;
      if (x - 1 >= 0 && this.cells[idx - 1] === owner) c++;
      if (y + 1 < GRID_ROWS && this.cells[idx + GRID_COLS] === owner) c++;
      if (y - 1 >= 0 && this.cells[idx - GRID_COLS] === owner) c++;
      return c;
    };
    const frontier = new Set<number>();
    const pushNbrs = (x: number, y: number): void => {
      const add = (nx: number, ny: number): void => {
        if (!inBounds(nx, ny)) return;
        const i = cellIndex(nx, ny);
        if (this.cells[i] === NEUTRAL) frontier.add(i);
      };
      add(x + 1, y);
      add(x - 1, y);
      add(x, y + 1);
      add(x, y - 1);
    };

    this.setOwner(cellIndex(cx, cy), owner);
    let count = 1;
    pushNbrs(cx, cy);
    while (count < targetCells && frontier.size > 0) {
      const arr = [...frontier];
      let chosen: number;
      if (Math.random() < 0.12) {
        chosen = arr[(Math.random() * arr.length) | 0]!; // random protrusion / inlet
      } else {
        const weights = new Array<number>(arr.length);
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const w = Math.pow(ownedNbrs(arr[i]!), 2.5) + 0.2; // favour filling bays → rounded
          weights[i] = w;
          sum += w;
        }
        let r = Math.random() * sum;
        let k = 0;
        while (k < arr.length - 1 && (r -= weights[k]!) > 0) k++;
        chosen = arr[k]!;
      }
      frontier.delete(chosen);
      if (this.cells[chosen] !== NEUTRAL) continue;
      this.setOwner(chosen, owner);
      count++;
      pushNbrs(cellX(chosen), cellY(chosen));
    }
  }

  /** Seed a small filled disc of starting territory around a cell. */
  seedDisc(owner: number, cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) continue;
        this.setOwner(cellIndex(x, y), owner);
      }
    }
  }

  /**
   * Shed `n` of an owner's cells back to neutral, removing those FURTHEST from
   * (fromX, fromY) first — the overextended frontier (game-spec §8 combat loss / §9
   * decay). Returns the number actually removed. (Strict contiguity preservation comes
   * with severing in M5 pass (b); this furthest-first pass is the approximation.)
   */
  shed(owner: number, n: number, fromX: number, fromY: number): number {
    if (n <= 0) return 0;
    const k = this.count(owner);
    if (k === 0) return 0;
    if (n >= k) {
      for (let i = 0; i < GRID_SIZE; i++) if (this.cells[i] === owner) this.setOwner(i, DECAY_OWNER);
      return k;
    }
    const core = this.cores.get(owner) ?? -1; // never shed the capital cell — it holds the castle
    const S = CONFIG.GRID_CELL;
    const d2 = (idx: number): number => {
      const dx = cellX(idx) * S + S / 2 - fromX;
      const dy = cellY(idx) * S + S / 2 - fromY;
      return dx * dx + dy * dy;
    };
    // Peel cells furthest from the avatar, but only spanning-tree LEAVES so the kingdom NEVER
    // splits. Removing arbitrary furthest cells could isolate the protected core into a tiny
    // cluster; the contiguity sweep then reaps the whole disconnected bulk in one jump — the
    // "300 → 0 instant death" seen in a wild skirmish. Leaves can be removed safely in any subset.
    let removed = 0;
    let guard = 0;
    while (removed < n && guard++ < GRID_SIZE) {
      const leaves = this.spanningTreeLeaves(owner, core);
      if (leaves.length === 0) break;
      leaves.sort((a, b) => d2(b) - d2(a)); // furthest first
      const take = Math.min(n - removed, leaves.length);
      for (let i = 0; i < take; i++) {
        this.setOwner(leaves[i]!, DECAY_OWNER); // crumble, don't vanish
        removed++;
      }
    }
    return removed;
  }

  /**
   * Leaves of a spanning tree of `owner`'s cells rooted at the core (4-connectivity). Removing any
   * subset of these can never disconnect the rest, so shedding them keeps the kingdom contiguous.
   */
  private spanningTreeLeaves(owner: number, core: number): number[] {
    let start = core >= 0 && this.cells[core] === owner ? core : -1;
    if (start < 0) {
      for (let i = 0; i < GRID_SIZE; i++) {
        if (this.cells[i] === owner) {
          start = i;
          break;
        }
      }
    }
    if (start < 0) return [];
    const parent = new Map<number, number>();
    parent.set(start, -1);
    const queue = [start];
    const hasChild = new Set<number>();
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi]!;
      for (const ni of this.neighbors(c)) {
        if (this.cells[ni] === owner && !parent.has(ni)) {
          parent.set(ni, c);
          hasChild.add(c);
          queue.push(ni);
        }
      }
    }
    const leaves: number[] = [];
    for (const c of queue) if (c !== core && !hasChild.has(c)) leaves.push(c);
    return leaves;
  }

  /**
   * True only if every cell of a disc (same shape `seedDisc` fills) is in-bounds AND
   * neutral — i.e. a starter territory placed here would sit entirely on former
   * wilderness, overlapping no existing kingdom (or decaying land).
   */
  isDiscClear(cx: number, cy: number, radius: number): boolean {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) return false;
        if (this.cells[cellIndex(x, y)] !== NEUTRAL) return false;
      }
    }
    return true;
  }

  /** Reassign every cell owned by `from` to `to`; returns the changed cell indices. */
  recolor(from: number, to: number): number[] {
    const changed: number[] = [];
    if (this.count(from) === 0) return changed;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (this.cells[i] === from) {
        this.setOwner(i, to);
        changed.push(i);
      }
    }
    return changed;
  }

  /**
   * Close a claim loop. The trail + the owner's existing territory must form a CLOSED
   * loop that actually ENCLOSES an area — only then does anything change hands: the
   * enclosed region (neutral + enemy alike) AND the trail become the owner's. A trail
   * that encloses nothing (a bare line / dangling stroke) claims NOTHING. Returns the
   * set of other players whose cells were taken (for contiguity + army updates).
   */
  capture(
    owner: number,
    trail: Set<number>,
    protectedCaps?: Map<number, number>,
  ): { victims: Set<number>; blocked: Set<number> } {
    const affected = new Set<number>();
    const blocked = new Set<number>();
    if (trail.size === 0) return { victims: affected, blocked };

    // 1) Bounding box over the owner's cells AND the trail.
    let minX = GRID_COLS;
    let minY = GRID_ROWS;
    let maxX = -1;
    let maxY = -1;
    const expand = (x: number, y: number): void => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (let i = 0; i < GRID_SIZE; i++) if (this.cells[i] === owner) expand(cellX(i), cellY(i));
    for (const idx of trail) expand(cellX(idx), cellY(idx));
    if (maxX < 0) return { victims: affected, blocked };

    // Expand by one so the "outside" can wrap around, then clamp.
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(GRID_COLS - 1, maxX + 1);
    maxY = Math.min(GRID_ROWS - 1, maxY + 1);
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // 2) Flood-fill from the box border. Walls = the owner's land + the trail; the trail
    //    is NOT claimed yet, so an open/dangling stroke lets the outside flood right in.
    const isWall = (gi: number): boolean => this.cells[gi] === owner || trail.has(gi);
    const visited = new Uint8Array(bw * bh);
    const stack: number[] = [];
    const push = (lx: number, ly: number): void => {
      if (lx < 0 || ly < 0 || lx >= bw || ly >= bh) return;
      const li = ly * bw + lx;
      if (visited[li]) return;
      if (isWall(cellIndex(minX + lx, minY + ly))) return;
      visited[li] = 1;
      stack.push(li);
    };
    for (let lx = 0; lx < bw; lx++) {
      push(lx, 0);
      push(lx, bh - 1);
    }
    for (let ly = 0; ly < bh; ly++) {
      push(0, ly);
      push(bw - 1, ly);
    }
    while (stack.length > 0) {
      const li = stack.pop()!;
      const lx = li % bw;
      const ly = (li / bw) | 0;
      push(lx + 1, ly);
      push(lx - 1, ly);
      push(lx, ly + 1);
      push(lx, ly - 1);
    }

    // 3) Enclosed interior = in-box cells the outside couldn't reach and aren't walls.
    const interior: number[] = [];
    for (let ly = 0; ly < bh; ly++) {
      for (let lx = 0; lx < bw; lx++) {
        if (visited[ly * bw + lx]) continue;
        const gi = cellIndex(minX + lx, minY + ly);
        if (isWall(gi)) continue;
        interior.push(gi);
      }
    }

    // 4) Require a genuine enclosure — no enclosed area means it wasn't a loop AROUND
    //    anything, so nothing is claimed (no bare-line claim, no line-sever).
    if (interior.length === 0) return { victims: affected, blocked };

    // Any enclosed capital that still holds power shields its WHOLE owner's cells from this
    // loop — you can't take a kingdom while its capital stands. Other owners/neutral proceed.
    if (protectedCaps) {
      for (const idx of interior) {
        const o = protectedCaps.get(idx);
        if (o !== undefined && o !== owner) blocked.add(o);
      }
      for (const idx of trail) {
        const o = protectedCaps.get(idx);
        if (o !== undefined && o !== owner) blocked.add(o);
      }
    }

    const claim = (idx: number): void => {
      const prev = this.cells[idx]!;
      if (prev === owner) return;
      if (prev !== NEUTRAL && prev !== DECAY_OWNER) {
        if (blocked.has(prev)) return; // shielded by a powered capital
        affected.add(prev);
      }
      this.setOwner(idx, owner);
    };
    for (const idx of interior) claim(idx); // the enclosed region
    for (const idx of trail) claim(idx); // and the loop boundary itself
    return { victims: affected, blocked };
  }

  /**
   * Sever loop: a trail that closes on ITSELF in the wild (not into the cutter's land).
   * Everything it encloses — plus the trail boundary — that belongs to OTHER players is
   * cut to NEUTRAL (the cutter gains nothing). Returns the set of victims. Encloses
   * nothing → does nothing (must be a real loop around an area).
   */
  severEnclosed(
    cutter: number,
    trail: Set<number>,
    protectedCaps?: Map<number, number>,
  ): { victims: Set<number>; blocked: Set<number> } {
    const affected = new Set<number>();
    const blocked = new Set<number>();
    if (trail.size === 0) return { victims: affected, blocked };

    let minX = GRID_COLS;
    let minY = GRID_ROWS;
    let maxX = -1;
    let maxY = -1;
    for (const idx of trail) {
      const x = cellX(idx);
      const y = cellY(idx);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(GRID_COLS - 1, maxX + 1);
    maxY = Math.min(GRID_ROWS - 1, maxY + 1);
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // Flood from the border; walls = trail cells. An unsealed/dangling trail lets the
    // outside reach everywhere, so nothing is enclosed.
    const visited = new Uint8Array(bw * bh);
    const stack: number[] = [];
    const push = (lx: number, ly: number): void => {
      if (lx < 0 || ly < 0 || lx >= bw || ly >= bh) return;
      const li = ly * bw + lx;
      if (visited[li]) return;
      if (trail.has(cellIndex(minX + lx, minY + ly))) return;
      visited[li] = 1;
      stack.push(li);
    };
    for (let lx = 0; lx < bw; lx++) {
      push(lx, 0);
      push(lx, bh - 1);
    }
    for (let ly = 0; ly < bh; ly++) {
      push(0, ly);
      push(bw - 1, ly);
    }
    while (stack.length > 0) {
      const li = stack.pop()!;
      const lx = li % bw;
      const ly = (li / bw) | 0;
      push(lx + 1, ly);
      push(lx - 1, ly);
      push(lx, ly + 1);
      push(lx, ly - 1);
    }

    const interior: number[] = [];
    for (let ly = 0; ly < bh; ly++) {
      for (let lx = 0; lx < bw; lx++) {
        if (visited[ly * bw + lx]) continue;
        const gi = cellIndex(minX + lx, minY + ly);
        if (trail.has(gi)) continue;
        interior.push(gi);
      }
    }
    if (interior.length === 0) return { victims: affected, blocked };

    // A powered capital enclosed here shields its whole owner's land from being severed.
    if (protectedCaps) {
      for (const idx of interior) {
        const o = protectedCaps.get(idx);
        if (o !== undefined && o !== cutter) blocked.add(o);
      }
      for (const idx of trail) {
        const o = protectedCaps.get(idx);
        if (o !== undefined && o !== cutter) blocked.add(o);
      }
    }

    const cut = (idx: number): void => {
      const prev = this.cells[idx]!;
      if (prev !== NEUTRAL && prev !== DECAY_OWNER && prev !== cutter) {
        if (blocked.has(prev)) return; // shielded by a powered capital
        affected.add(prev);
        // Turn it to decaying rubble (not instant neutral) so the severed patch CRUMBLES
        // away like a fallen empire's land (setOwner records it for the decay queue).
        this.setOwner(idx, DECAY_OWNER);
      }
    };
    for (const idx of interior) cut(idx);
    for (const idx of trail) cut(idx);
    return { victims: affected, blocked };
  }

  /**
   * Keep an owner's territory a single connected mass (game-spec §7 contiguity). The
   * component holding the owner's core cell (or the largest, if the core was lost) stays;
   * every other component is resolved — given to `inheritBy` if it touches that cutter's
   * land (loop-sever inherit), otherwise returned to neutral (slash/decay-sever).
   */
  enforceContiguity(owner: number, inheritBy?: number): void {
    const cells: number[] = [];
    for (let i = 0; i < GRID_SIZE; i++) if (this.cells[i] === owner) cells.push(i);
    if (cells.length <= 1) return;

    const compOf = new Map<number, number>();
    const components: number[][] = [];
    for (const start of cells) {
      if (compOf.has(start)) continue;
      const id = components.length;
      const comp: number[] = [];
      const stack = [start];
      compOf.set(start, id);
      while (stack.length > 0) {
        const idx = stack.pop()!;
        comp.push(idx);
        for (const ni of this.neighbors(idx)) {
          if (this.cells[ni] === owner && !compOf.has(ni)) {
            compOf.set(ni, id);
            stack.push(ni);
          }
        }
      }
      components.push(comp);
    }
    if (components.length <= 1) return;

    // The component to keep: the one holding the core cell, else the largest.
    const core = this.cores.get(owner);
    let keep = core !== undefined ? compOf.get(core) : undefined;
    if (keep === undefined) {
      keep = 0;
      for (let k = 1; k < components.length; k++) {
        if (components[k]!.length > components[keep]!.length) keep = k;
      }
    }

    for (let k = 0; k < components.length; k++) {
      if (k === keep) continue;
      const comp = components[k]!;
      // Inherited by the cutter if it borders them; otherwise it's lost → rubble (crumbles).
      const target = inheritBy !== undefined && this.touches(comp, inheritBy) ? inheritBy : DECAY_OWNER;
      for (const idx of comp) this.setOwner(idx, target);
    }
  }

  private neighbors(idx: number): number[] {
    const x = cellX(idx);
    const y = cellY(idx);
    const out: number[] = [];
    if (x + 1 < GRID_COLS) out.push(idx + 1);
    if (x - 1 >= 0) out.push(idx - 1);
    if (y + 1 < GRID_ROWS) out.push(idx + GRID_COLS);
    if (y - 1 >= 0) out.push(idx - GRID_COLS);
    return out;
  }

  private touches(comp: number[], owner: number): boolean {
    for (const idx of comp) {
      for (const ni of this.neighbors(idx)) {
        if (this.cells[ni] === owner) return true;
      }
    }
    return false;
  }

  /** Pop accumulated changes as `[idx:uint32, owner:uint16]` pairs, or null if none. */
  flushDelta(): Uint8Array | null {
    if (this.dirty.size === 0) return null;
    const buf = new Uint8Array(this.dirty.size * 6);
    const dv = new DataView(buf.buffer);
    let o = 0;
    for (const idx of this.dirty) {
      dv.setUint32(o, idx, true);
      dv.setUint16(o + 4, this.cells[idx]!, true);
      o += 6;
    }
    this.dirty.clear();
    return buf;
  }

  /** Full grid as run-length `[owner:uint16, count:uint16]` pairs (count < GRID_SIZE). */
  snapshot(): Uint8Array {
    const runs: number[] = [];
    let cur = this.cells[0]!;
    let cnt = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      const v = this.cells[i]!;
      if (v === cur) {
        cnt++;
      } else {
        runs.push(cur, cnt);
        cur = v;
        cnt = 1;
      }
    }
    runs.push(cur, cnt);

    const buf = new Uint8Array((runs.length / 2) * 4);
    const dv = new DataView(buf.buffer);
    let o = 0;
    for (let i = 0; i < runs.length; i += 2) {
      dv.setUint16(o, runs[i]!, true);
      dv.setUint16(o + 2, runs[i + 1]!, true);
      o += 4;
    }
    return buf;
  }
}
