import { GRID_COLS, GRID_ROWS, GRID_SIZE } from "./grid.js";

/**
 * Static terrain overlay for concealment (trees / mountains players hide behind).
 * Generated randomly per arena on the server, sent once to each client. A cell is
 * either clear, a tree, or a mountain; standing on a non-clear cell hides your avatar
 * from other players. This layer is independent of territory ownership.
 */
export const FOLIAGE_NONE = 0;
export const FOLIAGE_TREE = 1;
export const FOLIAGE_MOUNTAIN = 2;

/** RLE-encode a foliage map as `[count:uint16][type:uint8]` runs (mostly-clear → tiny). */
export function encodeFoliage(f: Uint8Array): Uint8Array {
  const runs: number[] = []; // flat pairs of (type, count)
  let cur = f[0]!;
  let cnt = 1;
  for (let i = 1; i < GRID_SIZE; i++) {
    const v = f[i]!;
    if (v === cur) {
      cnt++;
    } else {
      runs.push(cur, cnt);
      cur = v;
      cnt = 1;
    }
  }
  runs.push(cur, cnt);

  const buf = new Uint8Array((runs.length / 2) * 3);
  const dv = new DataView(buf.buffer);
  let o = 0;
  for (let i = 0; i < runs.length; i += 2) {
    dv.setUint16(o, runs[i + 1]!, true); // count
    dv.setUint8(o + 2, runs[i]!); // type
    o += 3;
  }
  return buf;
}

/**
 * Label connected foliage patches (4-connectivity, any foliage type). Returns a map of
 * cell → cover id (0 = no cover, otherwise a patch number). Two players share "the same
 * cover" when their cells carry the same non-zero id — that's when they can see each
 * other while hidden.
 */
export function labelFoliageClusters(foliage: Uint8Array): Uint16Array {
  const labels = new Uint16Array(GRID_SIZE);
  const stack: number[] = [];
  let next = 1;
  for (let start = 0; start < GRID_SIZE; start++) {
    if (foliage[start] === FOLIAGE_NONE || labels[start] !== 0) continue;
    const id = next++;
    labels[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % GRID_COLS;
      const y = (idx / GRID_COLS) | 0;
      const visit = (n: number): void => {
        if (foliage[n] !== FOLIAGE_NONE && labels[n] === 0) {
          labels[n] = id;
          stack.push(n);
        }
      };
      if (x + 1 < GRID_COLS) visit(idx + 1);
      if (x - 1 >= 0) visit(idx - 1);
      if (y + 1 < GRID_ROWS) visit(idx + GRID_COLS);
      if (y - 1 >= 0) visit(idx - GRID_COLS);
    }
  }
  return labels;
}

/** Decode an RLE foliage payload into `out` (length GRID_SIZE). */
export function decodeFoliage(bytes: Uint8Array, out: Uint8Array): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cell = 0;
  for (let o = 0; o + 3 <= bytes.byteLength; o += 3) {
    const count = dv.getUint16(o, true);
    const type = dv.getUint8(o + 2);
    out.fill(type, cell, cell + count);
    cell += count;
  }
}
