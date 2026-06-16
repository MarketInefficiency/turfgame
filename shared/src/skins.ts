/**
 * Skin color generation + contrast helpers (ui-ux.md §2). Pure and isomorphic:
 * the server picks a player's color on join; the client uses the contrast helper to
 * choose readable number text. Black/white and near-extremes are excluded by the
 * lightness band so skins stay visible across the day/night floor cycle.
 */

export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number): number => {
    const color = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color);
  };
  const toHex = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** A random mid-tone color: any hue, saturation 60–85%, lightness 45–62%. */
export function randomSkinColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.random() * 25;
  const l = 45 + Math.random() * 17;
  return hslToHex(h, s, l);
}

/** WCAG relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Pick near-black or near-white text so the army number reads on the fill. */
export function contrastTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#111111" : "#ffffff";
}

/** Linearly interpolate between two #rrggbb colors; returns #rrggbb. */
export function lerpHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 0xff) + (((nb >> 16) & 0xff) - ((na >> 16) & 0xff)) * t);
  const g = Math.round(((na >> 8) & 0xff) + (((nb >> 8) & 0xff) - ((na >> 8) & 0xff)) * t);
  const bl = Math.round((na & 0xff) + ((nb & 0xff) - (na & 0xff)) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Pack a #rrggbb color into a 0xRRGGBB number (for Pixi tint/background). */
export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** #rrggbb → {h (deg), s, l} with s,l in 0..1. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

const vibrantCache = new Map<string, string>();

/**
 * Punch up a fill colour so claimed land + avatars read vividly on the bright day floor (where flat
 * mid-tones wash out). Pushes saturation up and gently deepens very-light colours toward a richer
 * mid; clamped, so already-vivid skins barely move and the day/night-visibility band is preserved.
 * Cached per colour (called per owner each frame).
 */
export function vibrant(hex: string): string {
  const cached = vibrantCache.get(hex);
  if (cached) return cached;
  const { h, s, l } = hexToHsl(hex);
  const s2 = Math.min(1, s * 1.25 + 0.05);
  const l2 = l > 0.55 ? l * 0.94 : l; // keep pastels from looking washed without darkening dark hues
  const out = hslToHex(h, s2 * 100, l2 * 100);
  vibrantCache.set(hex, out);
  return out;
}
