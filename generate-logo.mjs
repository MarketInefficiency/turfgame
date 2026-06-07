// Generates logo.png — transparent PNG: blue circle with a centered "50k", our golden
// crown sitting just above the number (spanning the circle width), and a red royal robe
// flaring on the sides.
import zlib from "node:zlib";
import fs from "node:fs";

const SIZE = 512;
const SS = 4;
const W = SIZE * SS;
const H = SIZE * SS;
const hi = new Uint8ClampedArray(W * H * 4);

const BLUE = [47, 111, 237];
const BLUE_DK = [22, 52, 110];
const RED = [193, 39, 45];
const RED_DK = [110, 20, 26];
const GOLD = [255, 210, 74];
const GOLD_EDGE = [56, 46, 16];
const JEWEL = [255, 235, 174];
const WHITE = [255, 255, 255];

function px(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  hi[i] = c[0]; hi[i + 1] = c[1]; hi[i + 2] = c[2]; hi[i + 3] = 255;
}
function fillCircle(cx, cy, r, c) {
  const CX = cx * SS, CY = cy * SS, R = r * SS, R2 = R * R;
  for (let y = Math.floor(CY - R); y <= Math.ceil(CY + R); y++)
    for (let x = Math.floor(CX - R); x <= Math.ceil(CX + R); x++) {
      const dx = x - CX, dy = y - CY;
      if (dx * dx + dy * dy <= R2) px(x, y, c);
    }
}
function fillEllipse(cx, cy, rx, ry, c) {
  const CX = cx * SS, CY = cy * SS, RX = rx * SS, RY = ry * SS;
  for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++)
    for (let x = Math.floor(CX - RX); x <= Math.ceil(CX + RX); x++) {
      const dx = (x - CX) / RX, dy = (y - CY) / RY;
      if (dx * dx + dy * dy <= 1) px(x, y, c);
    }
}
function fillPoly(pts512, c) {
  const pts = pts512.map(([x, y]) => [x * SS, y * SS]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) px(x, y, c);
    }
}
const rect = (x, y, w, h, c) => fillPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c);
function thickLine(x1, y1, x2, y2, t, c) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (t / 2), ny = (dx / len) * (t / 2);
  fillPoly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], c);
}
function scalePoly(pts, f) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
}

// --- design ---
const cx = 256, cy = 268, R = 130;

// Red royal robe — flares on the sides, only a little below the circle.
const robe = [
  [cx - 0.5 * R, cy - 0.15 * R],
  [cx - R - 38, cy + 0.72 * R],
  [cx - 0.42 * R, cy + R - 6], // tucked behind the circle so nothing pokes out the bottom
  [cx + 0.42 * R, cy + R - 6],
  [cx + R + 38, cy + 0.72 * R],
  [cx + 0.5 * R, cy - 0.15 * R],
];
fillPoly(scalePoly(robe, 1.05), RED_DK);
fillPoly(robe, RED);

// Blue circle.
fillCircle(cx, cy, R + 5, BLUE_DK);
fillCircle(cx, cy, R, BLUE);

// "50k" centered in the circle (white digits; the 0's hole shows the blue behind).
const nh = 72, t = 14, gap = 9;
const w5 = 44, w0 = 50, wk = 44;
let gx = cx - (w5 + w0 + wk + gap * 2) / 2;
const gy = cy - nh / 2;
// 5
rect(gx, gy, w5, t, WHITE);
rect(gx, gy, t, nh / 2, WHITE);
rect(gx, gy + nh / 2 - t / 2, w5, t, WHITE);
rect(gx + w5 - t, gy + nh / 2 - t / 2, t, nh / 2 + t / 2, WHITE);
rect(gx, gy + nh - t, w5, t, WHITE);
gx += w5 + gap;
// 0
fillEllipse(gx + w0 / 2, gy + nh / 2, w0 / 2, nh / 2, WHITE);
fillEllipse(gx + w0 / 2, gy + nh / 2, w0 / 2 - t, nh / 2 - t, BLUE);
gx += w0 + gap;
// k
rect(gx, gy, t, nh, WHITE);
thickLine(gx + t * 0.7, gy + nh * 0.52, gx + wk, gy, t, WHITE);
thickLine(gx + t * 0.7, gy + nh * 0.5, gx + wk, gy + nh, t, WHITE);

// Golden crown — same proportions as the in-game avatar crown, scaled to R; sits just
// above the number (band at -0.4R) and spans ~the circle width.
const f = R / 22;
const w = R * 0.95;
const Yb = cy - 0.4 * R;
const cpY = (yr) => Yb + yr * f;
const crown = [
  [cx - w, cpY(0)], [cx - w, cpY(-15)], [cx - 0.75 * w, cpY(-5)], [cx - 0.5 * w, cpY(-19)],
  [cx - 0.25 * w, cpY(-5)], [cx, cpY(-23)], [cx + 0.25 * w, cpY(-5)], [cx + 0.5 * w, cpY(-19)],
  [cx + 0.75 * w, cpY(-5)], [cx + w, cpY(-15)], [cx + w, cpY(0)],
];
fillPoly(scalePoly(crown, 1.05), GOLD_EDGE);
fillPoly(crown, GOLD);
const jewels = [
  [cx, cpY(-6), 2.8 * f],
  [cx - 0.5 * w, cpY(-9), 1.7 * f],
  [cx + 0.5 * w, cpY(-9), 1.7 * f],
];
for (const [jx, jy, jr] of jewels) {
  fillCircle(jx, jy, jr + 1.8, GOLD_EDGE);
  fillCircle(jx, jy, jr, JEWEL);
}

// --- downsample + PNG encode ---
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let oy = 0; oy < SIZE; oy++)
  for (let ox = 0; ox < SIZE; ox++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const i = (((oy * SS + sy) * W) + (ox * SS + sx)) * 4;
        const aa = hi[i + 3];
        r += hi[i] * aa; g += hi[i + 1] * aa; b += hi[i + 2] * aa; a += aa;
      }
    const o = (oy * SIZE + ox) * 4;
    out[o + 3] = Math.round(a / (SS * SS));
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
  }

const crcTable = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tbl[n] = c >>> 0; }
  return tbl;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, cb]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) { raw[y * (SIZE * 4 + 1)] = 0; out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4); }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync("logo.png", png);
console.log(`wrote logo.png (${png.length} bytes)`);
