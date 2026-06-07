import {
  CONFIG,
  FOLIAGE_MOUNTAIN,
  FOLIAGE_TREE,
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  cellIndex,
} from "@territory/shared";

/**
 * Generate a fresh random foliage map for an arena (game terrain players hide behind).
 * Builds organic clumps via short random walks so trees form groves and mountains form
 * ranges, rather than single scattered cells. Authoritative and per-room.
 */
export function generateFoliage(): Uint8Array {
  const f = new Uint8Array(GRID_SIZE);
  const clusters = Math.max(
    1,
    Math.round((GRID_SIZE * CONFIG.FOLIAGE_DENSITY) / CONFIG.FOLIAGE_CLUSTER_AVG),
  );

  for (let c = 0; c < clusters; c++) {
    const type = Math.random() < CONFIG.FOLIAGE_TREE_RATIO ? FOLIAGE_TREE : FOLIAGE_MOUNTAIN;
    const size = 2 + Math.floor(Math.random() * (CONFIG.FOLIAGE_CLUSTER_AVG * 2 - 1));
    let cx = Math.floor(Math.random() * GRID_COLS);
    let cy = Math.floor(Math.random() * GRID_ROWS);
    for (let s = 0; s < size; s++) {
      if (cx >= 0 && cy >= 0 && cx < GRID_COLS && cy < GRID_ROWS) {
        f[cellIndex(cx, cy)] = type;
      }
      switch (Math.floor(Math.random() * 4)) {
        case 0:
          cx++;
          break;
        case 1:
          cx--;
          break;
        case 2:
          cy++;
          break;
        default:
          cy--;
          break;
      }
    }
  }
  return f;
}
