/**
 * Cosmetic catalog — the single source of truth for skins, capital designs, and sword designs,
 * shared by the client (shop UI + rendering) and the server (validating what a player may equip).
 * Cosmetics are purely visual; they never affect gameplay.
 *
 * - A "skin" sets the player's avatar/territory colour (the existing `color` field). The special
 *   `default` skin means a random colour per spawn (the classic behaviour).
 * - A "capital" design recolours the castle stone; a "sword" design recolours the combat icon.
 *
 * `free` cosmetics are usable by everyone. The rest require an entitlement (a purchase) — until
 * the purchase flow ships they simply can't be equipped, and the server enforces that.
 */
export type CosmeticType = "skin" | "capital" | "sword" | "cloak" | "hat" | "hair" | "shirt";

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  name: string;
  free: boolean;
  medalCost: number; // price in medals (0 for free); the real charge is enforced server-side
  color: string; // the design's primary colour ("" for the random default skin)
  design?: string; // base design id for recolourable cosmetics (e.g. cloak "wings_dragon" + a colour)
}

// --- Small colour helpers (no DOM) for recolourable designs ---
function hexLum(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function mixHex(a: string, b: string, t: number): string {
  const pa = [0, 2, 4].map((i) => parseInt(a.replace("#", "").slice(i, i + 2), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.replace("#", "").slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("");
}
/** An outline that always contrasts the fill (dark edge on light fills, light edge on dark) so a
 *  recoloured wing reads on the white day floor AND the black night floor — incl. pure black/white. */
function contrastOutline(fill: string): string {
  return hexLum(fill) > 0.5 ? mixHex(fill, "#000000", 0.68) : mixHex(fill, "#ffffff", 0.5);
}

export const SKINS: Cosmetic[] = [
  { id: "default", type: "skin", name: "Random", free: true, medalCost: 0, color: "" },
  { id: "skin_emerald", type: "skin", name: "Emerald", free: true, medalCost: 0, color: "#37c46e" },
  { id: "skin_sky", type: "skin", name: "Sky", free: true, medalCost: 0, color: "#4aa3ff" },
  { id: "skin_coral", type: "skin", name: "Coral", free: false, medalCost: 300, color: "#ff7a59" },
  { id: "skin_gold", type: "skin", name: "Gold", free: false, medalCost: 300, color: "#f2b63c" },
  { id: "skin_violet", type: "skin", name: "Violet", free: false, medalCost: 300, color: "#a96bff" },
  // Mid-tone only (the floor cycles white<->black, so near-extremes are banned — ui-ux §2).
  { id: "skin_crimson", type: "skin", name: "Crimson", free: false, medalCost: 300, color: "#d2453a" },
  { id: "skin_rose", type: "skin", name: "Rose", free: false, medalCost: 300, color: "#ff6ab0" },
  { id: "skin_amber", type: "skin", name: "Amber", free: false, medalCost: 300, color: "#e8923a" },
  { id: "skin_lime", type: "skin", name: "Lime", free: false, medalCost: 300, color: "#84c83a" },
  { id: "skin_teal", type: "skin", name: "Teal", free: false, medalCost: 300, color: "#2ab8a8" },
  { id: "skin_indigo", type: "skin", name: "Indigo", free: false, medalCost: 400, color: "#5a5ae0" },
  { id: "skin_magenta", type: "skin", name: "Magenta", free: false, medalCost: 400, color: "#c84ad0" },
  { id: "skin_slate", type: "skin", name: "Slate", free: false, medalCost: 400, color: "#7a8a9a" },
  { id: "skin_mint", type: "skin", name: "Mint", free: false, medalCost: 400, color: "#4ad2a0" },
];

export const CAPITALS: Cosmetic[] = [
  { id: "default", type: "capital", name: "Stone Keep", free: true, medalCost: 0, color: "#d7dde5" },
  { id: "cap_gold", type: "capital", name: "Gold Keep", free: false, medalCost: 700, color: "#e8c24a" },
  { id: "cap_obsidian", type: "capital", name: "Obsidian Spire", free: false, medalCost: 1200, color: "#4a4366" },
  { id: "cap_ember", type: "capital", name: "Ember Fortress", free: false, medalCost: 1800, color: "#8a3a2c" },
  { id: "cap_crystal", type: "capital", name: "Crystal Spire", free: false, medalCost: 1400, color: "#7fd6f5" },
  { id: "cap_volcano", type: "capital", name: "Volcano Keep", free: false, medalCost: 1600, color: "#ff6a18" },
  { id: "cap_emerald", type: "capital", name: "Emerald Citadel", free: false, medalCost: 1300, color: "#27a86e" },
  { id: "cap_bone", type: "capital", name: "Bonekeep", free: false, medalCost: 1500, color: "#f0ebdf" },
  { id: "cap_sky", type: "capital", name: "Sky Palace", free: false, medalCost: 2000, color: "#f2cf63" },
  { id: "cap_shadow", type: "capital", name: "Shadow Spire", free: false, medalCost: 1700, color: "#3a2a54" },
  { id: "cap_sand", type: "capital", name: "Sun Palace", free: false, medalCost: 1200, color: "#e8c24a" },
  { id: "cap_dragon", type: "capital", name: "Dragon's Roost", free: false, medalCost: 2200, color: "#6e2020" },
  { id: "cap_coral", type: "capital", name: "Coral Throne", free: false, medalCost: 1400, color: "#e86aa0" },
];

/**
 * Castle designs as SVG — the SINGLE source of truth for each capital, rendered both in the shop
 * (as HTML SVG) and in-game (PixiJS `Graphics.svg()`), so the two can never drift apart. Authored
 * with only the elements/attributes Pixi's parser supports (rect/polygon/circle + fill/stroke).
 * Each is drawn in a 0..48 box; the renderer scales/centers it to a fixed size.
 */
export const CASTLE_SVGS: Record<string, string> = {
  default:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="4" y="20" width="11" height="22" fill="#cdd3da" stroke="#262b33" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="20" width="11" height="22" fill="#cdd3da" stroke="#262b33" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="16" y="10" width="16" height="32" fill="#d7dde5" stroke="#262b33" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="4" y="16" width="3.2" height="5" fill="#cdd3da" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="11.8" y="16" width="3.2" height="5" fill="#cdd3da" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="33" y="16" width="3.2" height="5" fill="#cdd3da" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="40.8" y="16" width="3.2" height="5" fill="#cdd3da" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="16" y="6" width="3.6" height="5" fill="#d7dde5" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="22.2" y="6" width="3.6" height="5" fill="#d7dde5" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="28.4" y="6" width="3.6" height="5" fill="#d7dde5" stroke="#262b33" stroke-width="1.5"/>` +
    `<rect x="20" y="30" width="8" height="12" rx="2" fill="#3a4049"/>` +
    `<rect x="22" y="15" width="4" height="6" fill="#3a4049"/>` +
    `<rect x="7.5" y="25" width="3.5" height="5" fill="#3a4049"/>` +
    `<rect x="37" y="25" width="3.5" height="5" fill="#3a4049"/></svg>`,
  cap_gold:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="10" height="20" fill="#e8c24a" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="10" height="20" fill="#e8c24a" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="17" y="14" width="14" height="28" fill="#f2cf63" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,2 32,15 16,15" fill="#c8961f" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="10,15 15,22 5,22" fill="#c8961f" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="38,15 43,22 33,22" fill="#c8961f" stroke="#5a3d0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="21" y="30" width="6" height="12" rx="2" fill="#4a3208"/>` +
    `<circle cx="24" cy="22" r="2.6" fill="#fff3c4" stroke="#5a3d0a" stroke-width="1.2"/></svg>`,
  cap_obsidian:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="6" y="24" width="9" height="18" fill="#3b3550" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="24" width="9" height="18" fill="#3b3550" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="18" y="18" width="12" height="24" fill="#4a4366" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,1 30,18 18,18" fill="#2a2440" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="10.5,9 15,24 6,24" fill="#2a2440" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="37.5,9 42,24 33,24" fill="#2a2440" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="21" y="31" width="6" height="11" rx="1.5" fill="#16111f"/>` +
    `<circle cx="24" cy="11" r="1.8" fill="#a96bff"/>` +
    `<circle cx="10.5" cy="16" r="1.3" fill="#a96bff"/>` +
    `<circle cx="37.5" cy="16" r="1.3" fill="#a96bff"/></svg>`,
  cap_ember:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="10" height="20" fill="#6e2b22" stroke="#2a0f0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="10" height="20" fill="#6e2b22" stroke="#2a0f0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="16" y="12" width="16" height="30" fill="#8a3a2c" stroke="#2a0f0a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="5" y="18" width="3.2" height="5" fill="#6e2b22" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="11.8" y="18" width="3.2" height="5" fill="#6e2b22" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="33" y="18" width="3.2" height="5" fill="#6e2b22" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="40.8" y="18" width="3.2" height="5" fill="#6e2b22" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="16" y="8" width="3.6" height="5" fill="#8a3a2c" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="22.2" y="8" width="3.6" height="5" fill="#8a3a2c" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="28.4" y="8" width="3.6" height="5" fill="#8a3a2c" stroke="#2a0f0a" stroke-width="1.5"/>` +
    `<rect x="20" y="30" width="8" height="12" rx="2" fill="#ff7a18"/>` +
    `<rect x="22" y="17" width="4" height="6" fill="#ffb454"/>` +
    `<rect x="8" y="26" width="3.5" height="5" fill="#ff7a18"/>` +
    `<rect x="36.5" y="26" width="3.5" height="5" fill="#ff7a18"/></svg>`,
  cap_crystal:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="8" y="30" width="32" height="12" fill="#2a5a72" stroke="#15303f" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,2 31,18 28,42 20,42 17,18" fill="#7fd6f5" stroke="#2a6a88" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,2 24,42 17,18" fill="#a8e8ff" opacity="0.55"/>` +
    `<polygon points="8,14 13,30 5,30" fill="#9fe0f5" stroke="#2a6a88" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polygon points="40,14 43,30 35,30" fill="#9fe0f5" stroke="#2a6a88" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="21" y="32" width="6" height="10" rx="1" fill="#1a4253"/></svg>`,
  cap_volcano:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="10" height="20" fill="#2a2420" stroke="#0e0a08" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="10" height="20" fill="#2a2420" stroke="#0e0a08" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,4 34,42 14,42" fill="#3a2e26" stroke="#0e0a08" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M24,8 L21,24 L26,30 L22,42 M24,8 L28,20" fill="none" stroke="#ff6a18" stroke-width="1.6"/>` +
    `<path d="M8,26 L11,34 M37,26 L40,34" stroke="#ff6a18" stroke-width="1.2"/>` +
    `<rect x="21" y="32" width="6" height="10" rx="1" fill="#ff7a18"/></svg>`,
  cap_emerald:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="20" width="10" height="22" fill="#1f8a5a" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="20" width="10" height="22" fill="#1f8a5a" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="16" y="10" width="16" height="32" fill="#27a86e" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,2 30,10 18,10" fill="#37c486" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="10,14 15,20 5,20" fill="#37c486" stroke="#0c3a26" stroke-width="1.6"/>` +
    `<polygon points="38,14 43,20 33,20" fill="#37c486" stroke="#0c3a26" stroke-width="1.6"/>` +
    `<rect x="20" y="30" width="8" height="12" rx="2" fill="#0c3a26"/>` +
    `<circle cx="24" cy="20" r="2.6" fill="#aef5c8" stroke="#0c3a26" stroke-width="1"/></svg>`,
  cap_bone:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="6" y="22" width="9" height="20" fill="#e6e0d2" stroke="#5a5346" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="9" height="20" fill="#e6e0d2" stroke="#5a5346" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="17" y="12" width="14" height="30" fill="#f0ebdf" stroke="#5a5346" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="10.5,7 13,22 8,22" fill="#e6e0d2" stroke="#5a5346" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polygon points="37.5,7 40,22 35,22" fill="#e6e0d2" stroke="#5a5346" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polygon points="24,2 27,12 21,12" fill="#f0ebdf" stroke="#5a5346" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="21" y="30" width="6" height="12" rx="1" fill="#3a352c"/>` +
    `<circle cx="24" cy="20" r="2" fill="#3a352c"/></svg>`,
  cap_sky:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="11" height="20" fill="#eef3f8" stroke="#9aa6b4" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="32" y="22" width="11" height="20" fill="#eef3f8" stroke="#9aa6b4" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="17" y="14" width="14" height="28" fill="#f7fafc" stroke="#9aa6b4" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M5,22 Q10.5,11 16,22 Z" fill="#f2cf63" stroke="#9a7a1e" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M32,22 Q37.5,11 43,22 Z" fill="#f2cf63" stroke="#9a7a1e" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M17,14 Q24,2 31,14 Z" fill="#f2cf63" stroke="#9a7a1e" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="21" y="30" width="6" height="12" rx="2" fill="#7a93a6"/></svg>`,
  cap_shadow:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="24" width="9" height="18" fill="#241a36" stroke="#0e0818" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="34" y="24" width="9" height="18" fill="#241a36" stroke="#0e0818" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="24,2 30,18 30,42 18,42 18,18" fill="#3a2a54" stroke="#0e0818" stroke-width="2" stroke-linejoin="round"/>` +
    `<polygon points="9.5,10 14,24 5,24" fill="#2e2046" stroke="#0e0818" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polygon points="38.5,10 43,24 34,24" fill="#2e2046" stroke="#0e0818" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="21" y="32" width="6" height="10" rx="1" fill="#0e0818"/>` +
    `<circle cx="24" cy="14" r="2" fill="#a96bff"/><circle cx="9.5" cy="18" r="1.2" fill="#a96bff"/><circle cx="38.5" cy="18" r="1.2" fill="#a96bff"/></svg>`,
  cap_sand:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="10" height="20" fill="#e0b878" stroke="#8a5a2a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="10" height="20" fill="#e0b878" stroke="#8a5a2a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="16" y="16" width="16" height="26" fill="#ecc890" stroke="#8a5a2a" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M16,16 Q24,2 32,16 Z" fill="#e8c24a" stroke="#8a5a2a" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M5,22 Q10,15 15,22 Z" fill="#e8c24a" stroke="#8a5a2a" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M33,22 Q38,15 43,22 Z" fill="#e8c24a" stroke="#8a5a2a" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="21" y="30" width="6" height="12" rx="3" fill="#8a5a2a"/></svg>`,
  cap_dragon:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="5" y="22" width="10" height="20" fill="#5a1818" stroke="#1f0808" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="22" width="10" height="20" fill="#5a1818" stroke="#1f0808" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="16" y="12" width="16" height="30" fill="#6e2020" stroke="#1f0808" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M16,12 C12,6 14,4 18,8 Z" fill="#2a1414" stroke="#1f0808" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M32,12 C36,6 34,4 30,8 Z" fill="#2a1414" stroke="#1f0808" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<polygon points="24,2 28,12 20,12" fill="#8a2a2a" stroke="#1f0808" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="20" y="30" width="8" height="12" rx="2" fill="#1f0808"/>` +
    `<circle cx="24" cy="20" r="2.4" fill="#ff7a18" stroke="#1f0808" stroke-width="1"/></svg>`,
  cap_coral:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43">` +
    `<rect x="6" y="24" width="9" height="18" fill="#1f8a8a" stroke="#0c3a3a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="33" y="24" width="9" height="18" fill="#1f8a8a" stroke="#0c3a3a" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="17" y="14" width="14" height="28" fill="#e86aa0" stroke="#7c2a50" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M10.5,24 C8,18 12,16 11,10 M10.5,24 C13,19 16,18 16,14" fill="none" stroke="#f48ab8" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M37.5,24 C40,18 36,16 37,10 M37.5,24 C35,19 32,18 32,14" fill="none" stroke="#f48ab8" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M17,14 C20,6 28,6 31,14 Z" fill="#f48ab8" stroke="#7c2a50" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="21" y="30" width="6" height="12" rx="2" fill="#0c3a3a"/></svg>`,
};

/** The castle SVG for a capital design id (falls back to the default keep). */
export function castleSvg(id: string): string {
  return CASTLE_SVGS[id] ?? CASTLE_SVGS.default!;
}

/** The members-only sword id (granted by membership, equipped from the membership screen). */
export const MEMBER_SWORD_ID = "sword_sovereign";

export const SWORDS: Cosmetic[] = [
  // default/crimson/azure/silver recolour ONE procedural blade (their `color` tints it + the swoosh).
  { id: "default", type: "sword", name: "Gold", free: true, medalCost: 0, color: "#ffcf3f" },
  { id: "sword_crimson", type: "sword", name: "Crimson", free: false, medalCost: 350, color: "#ff5a52" },
  { id: "sword_azure", type: "sword", name: "Azure", free: false, medalCost: 350, color: "#4aa3ff" },
  { id: "sword_silver", type: "sword", name: "Silver", free: false, medalCost: 350, color: "#cfd6dd" },
  // These have their OWN blade shape (SWORD_SVGS, baked colours); `color` is just the swoosh tint.
  { id: "sword_katana", type: "sword", name: "Bloodmoon Katana", free: false, medalCost: 600, color: "#e0473f" },
  { id: "sword_flamberge", type: "sword", name: "Flameberge", free: false, medalCost: 900, color: "#ec6a1e" },
  { id: "sword_broadsword", type: "sword", name: "Warlord's Greatsword", free: false, medalCost: 700, color: "#9fc0e0" },
  { id: "sword_rapier", type: "sword", name: "Duelist's Rapier", free: false, medalCost: 650, color: "#dfe6ee" },
  { id: "sword_obsidian", type: "sword", name: "Obsidian Edge", free: false, medalCost: 1100, color: "#a96bff" },
  { id: "sword_frost", type: "sword", name: "Frostbite", free: false, medalCost: 900, color: "#9fdcff" },
  { id: "sword_venom", type: "sword", name: "Venom Fang", free: false, medalCost: 800, color: "#6fe04a" },
  { id: "sword_runic", type: "sword", name: "Runeblade", free: false, medalCost: 1200, color: "#38e0ff" },
  { id: "sword_celestial", type: "sword", name: "Celestial Edge", free: false, medalCost: 1800, color: "#ffe9a8" },
  // Members only: never sold, never in the shop, equipped from the membership screen (server checks
  // active membership). Its swoosh uses a dedicated prismatic flare texture.
  { id: MEMBER_SWORD_ID, type: "sword", name: "Sovereign's Edge", free: false, medalCost: 0, color: "#ffd86b" },
];

/**
 * Sword blade designs as SVG (a normalized 28x66 box: blade tip at (14,1), hilt/hand origin at
 * (14,44), pommel below). These are the LONG weapons (proper swords). Rendered both in the shop
 * (inline SVG) and in-game (rasterized sprite, anchored at the hilt so the swing + swoosh attach
 * to the tip). Recolourable swords (default/crimson/azure/silver) have NO entry — they use the
 * procedural blade, whose length is short or long per the studio.
 */
export const SWORD_SVGS: Record<string, string> = {
  sword_katana:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 C13,16 12,32 12.5,42 L16,42 C16,30 16,14 15.5,2 Z" fill="#d9e0e8" stroke="#2a2f36" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14.6,4 L13.2,41" stroke="#ffffff" stroke-width="0.8" opacity="0.6"/>` +
    `<circle cx="14" cy="44" r="4.4" fill="#2a1e0a" stroke="#0e0a04" stroke-width="1.2"/>` +
    `<rect x="12" y="45" width="4" height="13" rx="1" fill="#b03030" stroke="#3a0e0e" stroke-width="1"/>` +
    `<path d="M12,48 L16,49 M12,51 L16,52 M12,54 L16,55" stroke="#3a0e0e" stroke-width="0.7"/>` +
    `<circle cx="14" cy="60.5" r="2.4" fill="#2a1e0a" stroke="#0e0a04" stroke-width="1"/></svg>`,
  sword_flamberge:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 C9,8 19,13 12,19 C19,25 9,30 14,36 C12,38 13,40 14,42 L17,42 C16,40 17,38 15,36 C21,30 11,25 18,19 C11,13 21,8 17,3 Z" fill="#ec6a1e" stroke="#5a1e06" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<rect x="6" y="42" width="16" height="3.4" rx="1.5" fill="#7a3a10" stroke="#2a1306" stroke-width="1"/>` +
    `<rect x="11.5" y="45" width="5" height="11" rx="1" fill="#5a2a0c" stroke="#2a1306" stroke-width="1"/>` +
    `<circle cx="14" cy="59" r="2.6" fill="#ec6a1e" stroke="#2a1306" stroke-width="1"/></svg>`,
  sword_broadsword:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L9,10 L8.5,41 L19.5,41 L19,10 Z" fill="#bcd0e6" stroke="#2a3a4a" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14,4 L14,40" stroke="#ffffff" stroke-width="1" opacity="0.5"/>` +
    `<rect x="4" y="41" width="20" height="4" rx="1.5" fill="#5a6b7a" stroke="#1f2a34" stroke-width="1.1"/>` +
    `<rect x="11" y="45" width="6" height="11" rx="1" fill="#33414e" stroke="#1f2a34" stroke-width="1"/>` +
    `<circle cx="14" cy="59" r="3" fill="#7e93a6" stroke="#1f2a34" stroke-width="1"/></svg>`,
  sword_rapier:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L13,42 L15,42 Z" fill="#dfe6ee" stroke="#3a4250" stroke-width="1"/>` +
    `<path d="M7,45 C5,42 8,40 14,42 C20,40 23,42 21,45" fill="none" stroke="#9aa6b4" stroke-width="1.6"/>` +
    `<rect x="12.6" y="42" width="2.8" height="14" rx="1.2" fill="#444c58" stroke="#23282f" stroke-width="0.9"/>` +
    `<circle cx="14" cy="58.5" r="2.2" fill="#c0c8d2" stroke="#23282f" stroke-width="0.9"/></svg>`,
  sword_obsidian:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L10.5,41 L17.5,41 Z" fill="#1c1730" stroke="#a96bff" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14,5 L12.5,40" stroke="#a96bff" stroke-width="0.8" opacity="0.7"/>` +
    `<rect x="6" y="41" width="16" height="3.6" rx="1.5" fill="#2a2440" stroke="#15101f" stroke-width="1"/>` +
    `<rect x="11.5" y="44.5" width="5" height="11.5" rx="1" fill="#1a1530" stroke="#15101f" stroke-width="1"/>` +
    `<circle cx="14" cy="59" r="2.6" fill="#7a4fff" stroke="#15101f" stroke-width="1"/></svg>`,
  sword_frost:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L11,12 L12.5,20 L10.5,28 L12,36 L11,41 L16,41 L15,36 L17.5,28 L15.5,20 L17,12 Z" fill="#cfeaff" stroke="#4a86b8" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M14,4 L14,40" stroke="#ffffff" stroke-width="0.9" opacity="0.7"/>` +
    `<rect x="6" y="41" width="16" height="3.4" rx="1.5" fill="#7fb3d6" stroke="#2f5a76" stroke-width="1"/>` +
    `<rect x="11.5" y="44.5" width="5" height="11" rx="1" fill="#4a86b8" stroke="#2f5a76" stroke-width="1"/>` +
    `<circle cx="14" cy="58.5" r="2.5" fill="#cfeaff" stroke="#2f5a76" stroke-width="1"/></svg>`,
  sword_venom:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L11,9 L13,12 L11,17 L13,20 L11,25 L13,28 L11,33 L13,36 L11.5,41 L16.5,41 L15,36 L17,33 L15,28 L17,25 L15,20 L17,17 L15,12 L17,9 Z" fill="#5fbf3a" stroke="#1f5a14" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<rect x="6" y="41" width="16" height="3.4" rx="1.5" fill="#2f6a1f" stroke="#143d0d" stroke-width="1"/>` +
    `<rect x="11.5" y="44.5" width="5" height="11" rx="1" fill="#244a18" stroke="#143d0d" stroke-width="1"/>` +
    `<circle cx="14" cy="58.5" r="2.5" fill="#7fe04a" stroke="#143d0d" stroke-width="1"/></svg>`,
  sword_runic:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,2 L10.5,10 L10,41 L18,41 L17.5,10 Z" fill="#b6c2cc" stroke="#2a343c" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14,6 L14,39 M12,14 L16,14 M12,22 L16,22 M12,30 L16,30 M12,38 L16,38" stroke="#38e0ff" stroke-width="1" opacity="0.9"/>` +
    `<rect x="5" y="41" width="18" height="3.6" rx="1.5" fill="#3a4750" stroke="#1f282e" stroke-width="1.1"/>` +
    `<rect x="11" y="44.5" width="6" height="11.5" rx="1" fill="#2a343c" stroke="#1f282e" stroke-width="1"/>` +
    `<circle cx="14" cy="59" r="2.8" fill="#38e0ff" stroke="#1f282e" stroke-width="1"/></svg>`,
  sword_celestial:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<path d="M14,1 L10,11 L9.5,41 L18.5,41 L18,11 Z" fill="#fff6da" stroke="#caa23a" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14,3 L14,40" stroke="#f7d36c" stroke-width="1.1" opacity="0.8"/>` +
    `<rect x="4" y="41" width="20" height="4" rx="1.8" fill="#e8c24a" stroke="#7a5310" stroke-width="1.1"/>` +
    `<rect x="11" y="45" width="6" height="11" rx="1" fill="#caa23a" stroke="#7a5310" stroke-width="1"/>` +
    `<path d="M14,56 L11,59 L14,63 L17,59 Z" fill="#fff0c0" stroke="#7a5310" stroke-width="1"/></svg>`,
  // The members-only Sovereign's Edge: radiant winged greatsword, prismatic core, amethyst pommel.
  [MEMBER_SWORD_ID]:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 66">` +
    `<defs><linearGradient id="sov" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#fff0b0"/><stop offset="0.5" stop-color="#fffefa"/><stop offset="1" stop-color="#ffd86b"/>` +
    `</linearGradient></defs>` +
    `<path d="M14,0 L7.6,12 L8.2,42 L19.8,42 L20.4,12 Z" fill="#fff3b0" opacity="0.3"/>` + // glow aura
    `<path d="M14,1 L9,12 L9,41 L19,41 L19,12 Z" fill="url(#sov)" stroke="#b9892a" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M14,3 L14,40" stroke="#ff8af0" stroke-width="1.6" opacity="0.45"/>` + // prismatic core
    `<path d="M14,3 L14,40" stroke="#8ad8ff" stroke-width="0.8" opacity="0.8"/>` +
    `<path d="M11,17 L17,17 M11,25 L17,25 M11,33 L17,33" stroke="#f7d36c" stroke-width="0.7" opacity="0.7"/>` +
    `<path d="M14,42 C5,39 1,44 3.5,47.5 C8,45 11,45 14,45 C17,45 20,45 24.5,47.5 C27,44 23,39 14,42 Z" fill="#f0c544" stroke="#7a5310" stroke-width="1.1" stroke-linejoin="round"/>` + // winged crossguard
    `<circle cx="4.6" cy="45.4" r="1.5" fill="#a96bff" stroke="#7a5310" stroke-width="0.7"/>` +
    `<circle cx="23.4" cy="45.4" r="1.5" fill="#a96bff" stroke="#7a5310" stroke-width="0.7"/>` +
    `<rect x="11.4" y="45" width="5.2" height="11" rx="1" fill="#6a4a12" stroke="#3a2606" stroke-width="1"/>` +
    `<path d="M11.4,48 L16.6,49 M11.4,51 L16.6,52 M11.4,54 L16.6,55" stroke="#3a2606" stroke-width="0.6"/>` +
    `<circle cx="14" cy="59.6" r="3.4" fill="#a96bff" stroke="#7a5310" stroke-width="1.2"/>` +
    `<circle cx="12.9" cy="58.5" r="1.1" fill="#ffffff" opacity="0.85"/></svg>`,
};

/** The blade SVG for a sword design id, or "" for the recolourable procedural swords. */
export function swordSvg(id: string): string {
  return SWORD_SVGS[id] ?? "";
}

/**
 * Cloaks (capes/wings) worn BEHIND the avatar — a members-only cosmetic. Each is a hand-drawn SVG,
 * browser-rasterized both in the shop and in-game (so the two match), authored with a dark outline
 * (reads on the white day floor) and bright fills/highlights (read on the black night floor).
 */
/** Colour palette the recolourable wings come in (incl. pearl/obsidian for near white/black). */
const WING_COLORS: [string, string, string][] = [
  ["crimson", "Crimson", "#d23a32"], ["ember", "Ember", "#ec6a1e"], ["gold", "Gold", "#e8c24a"],
  ["emerald", "Emerald", "#37c46e"], ["frost", "Frost", "#4ad0ff"], ["azure", "Azure", "#3a78ff"],
  ["amethyst", "Amethyst", "#a96bff"], ["rose", "Rose", "#ff6ab0"], ["pearl", "Pearl", "#f2f5f8"],
  ["obsidian", "Obsidian", "#23262e"],
];
function wingVariants(base: string, label: string): Cosmetic[] {
  return WING_COLORS.map(([key, name, color]) => ({
    id: `${base}_${key}`, type: "cloak" as const, name: `${name} ${label}`,
    free: false, medalCost: 2500, color, design: base,
  }));
}

export const CLOAKS: Cosmetic[] = [
  { id: "default", type: "cloak", name: "None", free: true, medalCost: 0, color: "" },
  { id: "cloak_red", type: "cloak", name: "Crimson Cloak", free: false, medalCost: 900, color: "#c4302a" },
  { id: "cloak_king", type: "cloak", name: "King's Mantle", free: false, medalCost: 1600, color: "#5e2b91" },
  { id: "cloak_queen", type: "cloak", name: "Queen's Mantle", free: false, medalCost: 1600, color: "#e64aa0" },
  { id: "cloak_void", type: "cloak", name: "Void Mantle", free: false, medalCost: 2200, color: "#1a1530" },
  { id: "cloak_phoenix", type: "cloak", name: "Phoenix Cloak", free: false, medalCost: 2400, color: "#ec5a1e" },
  { id: "cloak_storm", type: "cloak", name: "Storm Cloak", free: false, medalCost: 2000, color: "#3a78c8" },
  { id: "cloak_emerald", type: "cloak", name: "Emerald Cloak", free: false, medalCost: 1800, color: "#1f9a5a" },
  { id: "cloak_frost", type: "cloak", name: "Frost Cloak", free: false, medalCost: 2000, color: "#bfe6ff" },
  { id: "wings_dragon", type: "cloak", name: "Dragon Wings", free: false, medalCost: 2500, color: "#7e1d1d" },
  { id: "wings_angel", type: "cloak", name: "Angel Wings", free: false, medalCost: 2500, color: "#eef2f6" },
  ...wingVariants("wings_dragon", "Dragon Wings"),
  ...wingVariants("wings_angel", "Angel Wings"),
];

/**
 * Cloak art (viewBox 0 0 100 100, avatar centred at 50,50 ~r20). Drawn behind the avatar so the
 * inner parts hide; the flaps/wings/collars extend past the circle. Symmetric designs mirror the
 * left half with a `scale(-1,1)` group so both sides always match.
 */
export const CLOAK_SVGS: Record<string, string> = {
  // Cloaks hang OPEN (two panels clasped at the neck, body showing between them) over the lower
  // body — below the number, never past the body's bottom edge.
  cloak_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#c4302a" stroke="#4a120c" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,58 L45,69" fill="none" stroke="#e35b4a" stroke-width="1.4" opacity="0.6"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#c4302a" stroke="#4a120c" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,58 L45,69" fill="none" stroke="#e35b4a" stroke-width="1.4" opacity="0.6"/></g>` +
    `<circle cx="50" cy="56" r="2.4" fill="#f2c84a" stroke="#7a5310" stroke-width="1.2"/></svg>`,
  cloak_king:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 29,67 33,71 C38,72 43,72 45,70 L46,57 Z" fill="#5e2b91" stroke="#2a1145" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,57 C44,60 44,65 45,70 C47,69 48,64 48,57 Z" fill="#f3f4f6" stroke="#8b9098" stroke-width="1"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 29,67 33,71 C38,72 43,72 45,70 L46,57 Z" fill="#5e2b91" stroke="#2a1145" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,57 C44,60 44,65 45,70 C47,69 48,64 48,57 Z" fill="#f3f4f6" stroke="#8b9098" stroke-width="1"/></g>` +
    `<circle cx="50" cy="56" r="2.4" fill="#f2c84a" stroke="#7a5310" stroke-width="1.2"/></svg>`,
  cloak_queen:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,71 C38,72 43,72 45,70 L46,57 Z" fill="#e64aa0" stroke="#7c1450" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,57 L45,70" fill="none" stroke="#f7d36c" stroke-width="1.6"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,71 C38,72 43,72 45,70 L46,57 Z" fill="#e64aa0" stroke="#7c1450" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,57 L45,70" fill="none" stroke="#f7d36c" stroke-width="1.6"/></g>` +
    `<circle cx="50" cy="56" r="2.6" fill="#fff0c0" stroke="#b88a1e" stroke-width="1"/></svg>`,
  // More epic open cloaks — same two-panel cape, themed.
  cloak_void:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#1a1530" stroke="#0c0818" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,57 L45,69" fill="none" stroke="#a96bff" stroke-width="1.6" opacity="0.85"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#1a1530" stroke="#0c0818" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,57 L45,69" fill="none" stroke="#a96bff" stroke-width="1.6" opacity="0.85"/></g>` +
    `<circle cx="50" cy="56" r="2.4" fill="#a96bff" stroke="#0c0818" stroke-width="1.2"/></svg>`,
  cloak_phoenix:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#ec5a1e" stroke="#5a1e06" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,58 C44,62 44,66 45,69" fill="none" stroke="#ffd07a" stroke-width="1.6" opacity="0.8"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#ec5a1e" stroke="#5a1e06" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,58 C44,62 44,66 45,69" fill="none" stroke="#ffd07a" stroke-width="1.6" opacity="0.8"/></g>` +
    `<circle cx="50" cy="56" r="2.5" fill="#ffd07a" stroke="#5a1e06" stroke-width="1.2"/></svg>`,
  cloak_storm:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#3a78c8" stroke="#14263f" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M40,58 L37,63 L40,63 L37,69" fill="none" stroke="#ffe96a" stroke-width="1.3"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#3a78c8" stroke="#14263f" stroke-width="2.4" stroke-linejoin="round"/><path d="M40,58 L37,63 L40,63 L37,69" fill="none" stroke="#ffe96a" stroke-width="1.3"/></g>` +
    `<circle cx="50" cy="56" r="2.4" fill="#cfe6ff" stroke="#14263f" stroke-width="1.2"/></svg>`,
  cloak_emerald:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#1f9a5a" stroke="#0c3a26" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,57 L45,69" fill="none" stroke="#f7d36c" stroke-width="1.6"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#1f9a5a" stroke="#0c3a26" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,57 L45,69" fill="none" stroke="#f7d36c" stroke-width="1.6"/></g>` +
    `<circle cx="50" cy="56" r="2.5" fill="#aef5c8" stroke="#0c3a26" stroke-width="1.2"/></svg>`,
  cloak_frost:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#bfe6ff" stroke="#4a86b8" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M46,58 L45,69" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.8"/>` +
    `<g transform="translate(100,0) scale(-1,1)"><path d="M49,55 C42,55 36,56 31,57 C29,61 30,67 33,70 C38,71 43,71 45,69 L46,57 Z" fill="#bfe6ff" stroke="#4a86b8" stroke-width="2.4" stroke-linejoin="round"/><path d="M46,58 L45,69" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.8"/></g>` +
    `<circle cx="50" cy="56" r="2.4" fill="#eaf6ff" stroke="#4a86b8" stroke-width="1.2"/></svg>`,
};

/** Dragon (bat) wings recoloured to `color`, with a contrast outline so any colour reads. */
function dragonWingsSvg(color: string): string {
  const stroke = contrastOutline(color);
  const hi = mixHex(color, "#ffffff", 0.4);
  const wing =
    `<path d="M48,58 C38,49 25,37 15,20 C18,25 20,29 23,33 C19,35 20,40 24,42 L19,47 C24,47 26,50 29,52 L24,57 C30,56 32,59 35,60 L31,65 C37,63 41,61 45,60 C46,59 47,59 48,58 Z" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M48,58 C38,49 25,37 15,20" fill="none" stroke="${hi}" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g>${wing}</g><g transform="translate(100,0) scale(-1,1)">${wing}</g></svg>`;
}

/** Angel (feathered) wings recoloured to `color`. */
function angelWingsSvg(color: string): string {
  const stroke = contrastOutline(color);
  const feather = hexLum(color) > 0.5 ? mixHex(color, "#000000", 0.25) : mixHex(color, "#ffffff", 0.3);
  const wing =
    `<path d="M48,58 C37,49 23,38 14,19 C17,21 21,24 25,27 C20,29 21,34 26,36 C22,38 23,43 28,45 L23,53 C28,51 30,53 33,55 L29,62 C35,60 38,59 42,59 L39,65 C43,63 46,60 48,58 Z" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M44,55 C34,47 24,38 16,23 M40,57 C31,50 22,42 16,28" fill="none" stroke="${feather}" stroke-width="1.1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g>${wing}</g><g transform="translate(100,0) scale(-1,1)">${wing}</g></svg>`;
}

/**
 * The cloak SVG for a design (or id). Recolourable wings ("wings_dragon"/"wings_angel") are
 * generated in `color`; fixed cloak designs come from CLOAK_SVGS. "" = wear nothing.
 */
export function cloakSvg(design: string, color = ""): string {
  if (design === "wings_dragon") return dragonWingsSvg(color || "#7e1d1d");
  if (design === "wings_angel") return angelWingsSvg(color || "#eef2f6");
  return CLOAK_SVGS[design] ?? "";
}

/**
 * Worn cosmetics rendered ON the avatar (viewBox 0 0 100 100, head centred at 50,50 ~r20):
 *  - HAIR frames the head top/sides (face stays clear), UNDER the hat.
 *  - HAT sits on the crown, OVER hair; a top-3 leaderboard crown temporarily replaces it.
 *  - SHIRT clothes the lower body, UNDER cloaks. "shirt" includes hoodies + armour chestplates.
 * Helmet hats + chestplate shirts come in matching sets (e.g. iron, gold).
 */
export const HAIR_SVGS: Record<string, string> = {
  hair_male:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,47 C26,24 74,24 72,47 C70,41 65,37 59,36 C57,40 52,41 50,37 C48,41 43,40 41,36 C35,37 30,41 28,47 Z" fill="#6b4423" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,28 C49,33 47,38 45,42 M50,28 C51,33 53,38 56,41 M36,42 C39,38 43,36 47,35" fill="none" stroke="#4a3018" stroke-width="0.9" opacity="0.5"/><path d="M40,30 C44,29 47,30 49,32" fill="none" stroke="#8a5a32" stroke-width="0.9" opacity="0.45"/></svg>`,
  hair_female:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#7a4a2a" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#4a2e18" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_spiky:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,40 L34,25 L38,38 L42,23 L46,38 L50,21 L54,38 L58,23 L62,38 L66,25 L70,40 C60,34 40,34 30,40 Z" fill="#2a2e3a" stroke="#12141a" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_long:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,25 75,25 73,46 C74,59 72,68 69,74 L62,71 C65,59 64,48 62,42 C55,35 45,35 38,42 C36,48 35,59 38,71 L31,74 C28,68 26,59 27,46 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M33,48 C32,58 33,67 35,72 M67,48 C68,58 67,67 65,72 M44,32 C47,30 53,30 56,32" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_mohawk:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M44,40 L44,18 L50,11 L56,18 L56,40 C52,38 48,38 44,40 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_bun:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C29,28 71,28 70,42 C66,36 60,34 50,34 C40,34 34,36 30,42 Z" fill="#3a2412" stroke="#1f130a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="24" r="6" fill="#3a2412" stroke="#1f130a" stroke-width="1.4"/></svg>`,
  hair_afro:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,46 C23,46 21,30 32,24 C36,15 64,15 68,24 C79,30 77,46 70,46 C66,40 58,38 50,38 C42,38 34,40 30,46 Z" fill="#2a2018" stroke="#120c08" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_ponytail:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M68,36 C77,38 79,50 75,61 L70,59 C73,50 71,42 66,40 Z" fill="#4a3018" stroke="#1f130a" stroke-width="1.4" stroke-linejoin="round"/><path d="M30,42 C29,26 71,26 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#4a3018" stroke="#1f130a" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_buzz:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,42 C32,31 68,31 68,42 C62,37 38,37 32,42 Z" fill="#3a3530" stroke="#1f1c18" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  hair_curly:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,44 C26,40 28,34 32,34 C32,28 38,26 42,28 C44,24 50,24 52,28 C56,24 62,26 64,30 C70,30 72,38 68,42 C64,38 58,36 50,36 C42,36 34,38 30,44 Z" fill="#5a3a1a" stroke="#2a1c0c" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_pixie:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C28,28 50,23 70,30 C72,35 70,41 66,43 C60,37 56,36 52,38 L52,30 C46,32 40,34 36,41 Z" fill="#1a1a1f" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_braids:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C29,28 71,28 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#2a1c10" stroke="#120c08" stroke-width="1.6" stroke-linejoin="round"/><path d="M32,40 C30,48 32,58 34,64 L38,62 C36,54 36,46 36,40 Z" fill="#2a1c10" stroke="#120c08" stroke-width="1.1"/><path d="M68,40 C70,48 68,58 66,64 L62,62 C64,54 64,46 64,40 Z" fill="#2a1c10" stroke="#120c08" stroke-width="1.1"/></svg>`,
  hair_emo:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,26 72,26 72,42 C68,34 60,32 50,32 C44,32 38,34 34,40 C40,38 46,38 51,38 C45,42 39,47 32,49 C30,47 28,44 28,42 Z" fill="#15151a" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hair_dreads:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C29,28 71,28 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#2a1c10" stroke="#120c08" stroke-width="1.6" stroke-linejoin="round"/><rect x="31" y="40" width="3" height="22" rx="1.5" fill="#2a1c10" stroke="#120c08" stroke-width="0.8"/><rect x="37" y="42" width="3" height="20" rx="1.5" fill="#2a1c10" stroke="#120c08" stroke-width="0.8"/><rect x="60" y="42" width="3" height="20" rx="1.5" fill="#2a1c10" stroke="#120c08" stroke-width="0.8"/><rect x="66" y="40" width="3" height="22" rx="1.5" fill="#2a1c10" stroke="#120c08" stroke-width="0.8"/></svg>`,
  hair_pigtails:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C29,28 71,28 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#6b4423" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><circle cx="28" cy="44" r="5" fill="#6b4423" stroke="#3a2412" stroke-width="1.2"/><circle cx="72" cy="44" r="5" fill="#6b4423" stroke="#3a2412" stroke-width="1.2"/></svg>`,
  hair_wavy:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,26 75,26 73,46 C74,54 70,60 72,68 L66,64 C68,58 64,52 62,44 C55,37 45,37 38,44 C36,52 32,58 34,64 L28,68 C30,60 26,54 27,46 Z" fill="#7a4a2a" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C32,52 34,58 33,64 M66,46 C68,52 66,58 67,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#4a2e18" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_pink:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#ff6ab0" stroke="#a02a60" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#c43a80" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_blue:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#4aa3ff" stroke="#1f5a99" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#2a6cc0" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_white:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#eef2f6" stroke="#9aa6b4" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#aeb6c0" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,47 C26,24 74,24 72,47 C70,41 65,37 59,36 C57,40 52,41 50,37 C48,41 43,40 41,36 C35,37 30,41 28,47 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,28 C49,33 47,38 45,42 M50,28 C51,33 53,38 56,41" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.5"/></svg>`,
  // --- batch 2: color matrix for the signature styles (brown/blonde/red/black) + colorful dyes ---
  hair_male_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,47 C26,24 74,24 72,47 C70,41 65,37 59,36 C57,40 52,41 50,37 C48,41 43,40 41,36 C35,37 30,41 28,47 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,28 C49,33 47,38 45,42 M50,28 C51,33 53,38 56,41 M36,42 C39,38 43,36 47,35" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/><path d="M40,30 C44,29 47,30 49,32" fill="none" stroke="#f5e0a8" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_male_black:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,47 C26,24 74,24 72,47 C70,41 65,37 59,36 C57,40 52,41 50,37 C48,41 43,40 41,36 C35,37 30,41 28,47 Z" fill="#23232b" stroke="#0a0a0e" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,28 C49,33 47,38 45,42 M50,28 C51,33 53,38 56,41 M36,42 C39,38 43,36 47,35" fill="none" stroke="#45454f" stroke-width="0.9" opacity="0.6"/><path d="M40,30 C44,29 47,30 49,32" fill="none" stroke="#5a5a66" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_female_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_female_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_female_black:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#23232b" stroke="#0a0a0e" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#45454f" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_long_brown:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,25 75,25 73,46 C74,59 72,68 69,74 L62,71 C65,59 64,48 62,42 C55,35 45,35 38,42 C36,48 35,59 38,71 L31,74 C28,68 26,59 27,46 Z" fill="#6b4423" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><path d="M33,48 C32,58 33,67 35,72 M67,48 C68,58 67,67 65,72 M44,32 C47,30 53,30 56,32" fill="none" stroke="#4a3018" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_long_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,25 75,25 73,46 C74,59 72,68 69,74 L62,71 C65,59 64,48 62,42 C55,35 45,35 38,42 C36,48 35,59 38,71 L31,74 C28,68 26,59 27,46 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M33,48 C32,58 33,67 35,72 M67,48 C68,58 67,67 65,72 M44,32 C47,30 53,30 56,32" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_long_black:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,25 75,25 73,46 C74,59 72,68 69,74 L62,71 C65,59 64,48 62,42 C55,35 45,35 38,42 C36,48 35,59 38,71 L31,74 C28,68 26,59 27,46 Z" fill="#23232b" stroke="#0a0a0e" stroke-width="1.6" stroke-linejoin="round"/><path d="M33,48 C32,58 33,67 35,72 M67,48 C68,58 67,67 65,72 M44,32 C47,30 53,30 56,32" fill="none" stroke="#45454f" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_wavy_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,26 75,26 73,46 C74,54 70,60 72,68 L66,64 C68,58 64,52 62,44 C55,37 45,37 38,44 C36,52 32,58 34,64 L28,68 C30,60 26,54 27,46 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C32,52 34,58 33,64 M66,46 C68,52 66,58 67,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_wavy_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27,46 C25,26 75,26 73,46 C74,54 70,60 72,68 L66,64 C68,58 64,52 62,44 C55,37 45,37 38,44 C36,52 32,58 34,64 L28,68 C30,60 26,54 27,46 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C32,52 34,58 33,64 M66,46 C68,52 66,58 67,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_curly_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,44 C26,40 28,34 32,34 C32,28 38,26 42,28 C44,24 50,24 52,28 C56,24 62,26 64,30 C70,30 72,38 68,42 C64,38 58,36 50,36 C42,36 34,38 30,44 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M38,31 C40,29 43,29 44,31 M56,28 C58,26 61,27 62,29" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_curly_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,44 C26,40 28,34 32,34 C32,28 38,26 42,28 C44,24 50,24 52,28 C56,24 62,26 64,30 C70,30 72,38 68,42 C64,38 58,36 50,36 C42,36 34,38 30,44 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M38,31 C40,29 43,29 44,31 M56,28 C58,26 61,27 62,29" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.6"/></svg>`,
  hair_ponytail_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M68,36 C77,38 79,50 75,61 L70,59 C73,50 71,42 66,40 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.4" stroke-linejoin="round"/><path d="M30,42 C29,26 71,26 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><path d="M66,38 C68,39 69,41 68,43" fill="none" stroke="#a07a30" stroke-width="1.8"/><path d="M44,31 C47,30 53,30 56,31" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_ponytail_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M68,36 C77,38 79,50 75,61 L70,59 C73,50 71,42 66,40 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.4" stroke-linejoin="round"/><path d="M30,42 C29,26 71,26 70,42 C66,35 60,33 50,33 C40,33 34,35 30,42 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.6" stroke-linejoin="round"/><path d="M66,38 C68,39 69,41 68,43" fill="none" stroke="#7a1e16" stroke-width="1.8"/><path d="M44,31 C47,30 53,30 56,31" fill="none" stroke="#8a2018" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_bun_blonde:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,42 C29,28 71,28 70,42 C66,36 60,34 50,34 C40,34 34,36 30,42 Z" fill="#e8c878" stroke="#a07a30" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="24" r="6" fill="#e8c878" stroke="#a07a30" stroke-width="1.4"/><path d="M46,29 C48,28.2 52,28.2 54,29" fill="none" stroke="#a07a30" stroke-width="1.4"/><path d="M44,32 C47,31 53,31 56,32" fill="none" stroke="#bd9438" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_green:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#3fae5a" stroke="#1a5a2c" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#2a7a3e" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_purple:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#8a4fd0" stroke="#41246b" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#6a35a8" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_teal:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="#2ab8a8" stroke="#0f5a52" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#1a8a7c" stroke-width="0.9" opacity="0.55"/></svg>`,
  hair_ombre:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="hgOmb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6ab0"/><stop offset="1" stop-color="#8a4fd0"/></linearGradient></defs><path d="M28,44 C26,26 74,26 72,44 C72,56 70,63 67,67 L61,65 C63,55 63,47 61,42 C55,36 45,36 39,42 C37,47 37,55 39,65 L33,67 C30,63 28,56 28,44 Z" fill="url(#hgOmb)" stroke="#7c2a78" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,46 C33,54 34,60 36,64 M66,46 C67,54 66,60 64,64 M44,33 C47,31 53,31 56,33" fill="none" stroke="#c44a98" stroke-width="0.9" opacity="0.5"/></svg>`,
  hair_rainbow:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="hgRbw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5a52"/><stop offset="0.25" stop-color="#f7d36c"/><stop offset="0.5" stop-color="#3fae5a"/><stop offset="0.75" stop-color="#4aa3ff"/><stop offset="1" stop-color="#8a4fd0"/></linearGradient></defs><path d="M27,46 C25,25 75,25 73,46 C74,59 72,68 69,74 L62,71 C65,59 64,48 62,42 C55,35 45,35 38,42 C36,48 35,59 38,71 L31,74 C28,68 26,59 27,46 Z" fill="url(#hgRbw)" stroke="#3a3a46" stroke-width="1.6" stroke-linejoin="round"/><path d="M33,48 C32,58 33,67 35,72 M67,48 C68,58 67,67 65,72 M44,32 C47,30 53,30 56,32" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.35"/></svg>`,
};

export const HAT_SVGS: Record<string, string> = {
  hat_tg:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,38 C30,20 70,20 70,38 Z" fill="#2a6cd0" stroke="#143b75" stroke-width="2" stroke-linejoin="round"/><path d="M30,37 C22,38 19,42 22,44 L42,41 C37,39 33,38 30,37 Z" fill="#1f5099" stroke="#143b75" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="22" r="1.8" fill="#143b75"/><text x="50" y="34" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#ffffff" text-anchor="middle">TG</text></svg>`,
  helmet_iron:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#9aa6b4" stroke="#3a4450" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#6a7686" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="1" stroke-linejoin="round"/></svg>`,
  helmet_gold:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#c8961f" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#fff0c0" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/></svg>`,
  hat_wizard:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="40" rx="20" ry="4" fill="#6a4ab0" stroke="#2a1a4a" stroke-width="1.6"/><path d="M50,8 L62,40 L38,40 Z" fill="#5a3a9a" stroke="#2a1a4a" stroke-width="2" stroke-linejoin="round"/><path d="M50,23 l1.1,2.2 2.4,0.3 -1.7,1.7 0.5,2.4 -2.3,-1.2 -2.3,1.2 0.5,-2.4 -1.7,-1.7 2.4,-0.3 z" fill="#f7d36c"/></svg>`,
  hat_top:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="38" rx="20" ry="3.6" fill="#1a1a1f" stroke="#000000" stroke-width="1.6"/><rect x="38" y="16" width="24" height="22" rx="1" fill="#1a1a1f" stroke="#000000" stroke-width="1.6"/><rect x="38" y="31" width="24" height="3.6" fill="#7a1e1e"/></svg>`,
  helmet_crimson:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#b03a3a" stroke="#4a1212" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#d45a5a" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#1a1a1f" stroke="#4a1212" stroke-width="1"/></svg>`,
  helmet_obsidian:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#3a3550" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#a96bff" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#a96bff" stroke="#15101f" stroke-width="1"/></svg>`,
  helmet_emerald:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#1f8a5a" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#37c486" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#f7d36c" stroke="#0c3a26" stroke-width="1"/></svg>`,
  helmet_diamond:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,42 C28,22 72,22 72,42 L72,47 L64,47 L64,40 C64,30 36,30 36,40 L36,47 L28,47 Z" fill="#bfe6ff" stroke="#4a86b8" stroke-width="2" stroke-linejoin="round"/><path d="M50,22 L50,40" stroke="#7fc4ff" stroke-width="2"/><path d="M50,18 C44,10 48,6 50,12 C52,6 56,10 50,18 Z" fill="#ffffff" stroke="#4a86b8" stroke-width="1"/></svg>`,
  hat_beanie:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,40 C32,26 68,26 68,40 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="2" stroke-linejoin="round"/><rect x="31" y="37" width="38" height="5" rx="2.5" fill="#9a2a2a" stroke="#7a1e1e" stroke-width="1.2"/><circle cx="50" cy="23" r="3" fill="#e8c878" stroke="#7a1e1e" stroke-width="1"/></svg>`,
  hat_cowboy:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,41 C26,43 23,41 21,42 C30,46 70,46 79,42 C77,41 74,43 70,41 C66,30 34,30 30,41 Z" fill="#9a6a3a" stroke="#4a2f12" stroke-width="2" stroke-linejoin="round"/><path d="M38,40 C38,30 62,30 62,40 C56,35 44,35 38,40 Z" fill="#8a5a2a" stroke="#4a2f12" stroke-width="1.4" stroke-linejoin="round"/><path d="M36,37 L64,37" stroke="#4a2f12" stroke-width="1.6"/></svg>`,
  hat_pirate:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,40 C26,34 30,30 36,32 C40,26 60,26 64,32 C70,30 74,34 70,40 C60,44 40,44 30,40 Z" fill="#1f242c" stroke="#0c0f14" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="35" r="3.2" fill="#e8e0d2"/><path d="M45,40 L55,40" stroke="#e8e0d2" stroke-width="1.6"/></svg>`,
  hat_viking:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,42 C34,28 66,28 66,42 Z" fill="#8a96a4" stroke="#3a4450" stroke-width="2" stroke-linejoin="round"/><rect x="48" y="24" width="4" height="16" fill="#6a7686" stroke="#3a4450" stroke-width="1.2"/><path d="M34,40 C24,38 20,30 23,26 C28,31 32,35 36,38 Z" fill="#e6e0d2" stroke="#5a5346" stroke-width="1.6" stroke-linejoin="round"/><path d="M66,40 C76,38 80,30 77,26 C72,31 68,35 64,38 Z" fill="#e6e0d2" stroke="#5a5346" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hat_halo:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="20" rx="13" ry="4" fill="none" stroke="#f7d36c" stroke-width="3.2"/><ellipse cx="50" cy="20" rx="13" ry="4" fill="none" stroke="#fff4c4" stroke-width="1" opacity="0.7"/></svg>`,
  hat_devil:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M40,36 C33,29 33,20 37,18 C39,24 41,30 43,34 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.6" stroke-linejoin="round"/><path d="M60,36 C67,29 67,20 63,18 C61,24 59,30 57,34 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  hat_santa:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,40 C30,24 64,17 71,30 C73,36 68,40 60,40 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="2" stroke-linejoin="round"/><rect x="30" y="37" width="36" height="6" rx="3" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.2"/><circle cx="72" cy="28" r="4" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.1"/></svg>`,
  hat_chef:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="38" y="30" width="24" height="12" rx="2" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.6"/><circle cx="42" cy="26" r="6" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.4"/><circle cx="50" cy="23" r="6.5" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.4"/><circle cx="58" cy="26" r="6" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.4"/></svg>`,
  hat_grad:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M44,37 L44,44 C46,46 54,46 56,44 L56,37 Z" fill="#1f242c" stroke="#0c0f14" stroke-width="1.4" stroke-linejoin="round"/><path d="M30,34 L50,28 L70,34 L50,40 Z" fill="#1f242c" stroke="#0c0f14" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,31 L66,36 L66,42" fill="none" stroke="#f7d36c" stroke-width="1.4"/><circle cx="66" cy="43" r="1.8" fill="#f7d36c"/></svg>`,
  hat_flower:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,41 C32,35 68,35 70,41 C60,38 40,38 30,41 Z" fill="#2f8a4a" stroke="#0c3a26" stroke-width="1.6" stroke-linejoin="round"/><circle cx="35" cy="37" r="3.2" fill="#ff6ab0" stroke="#7c2a50" stroke-width="0.8"/><circle cx="44" cy="34" r="3.2" fill="#f7d36c" stroke="#8a6a10" stroke-width="0.8"/><circle cx="56" cy="34" r="3.2" fill="#a96bff" stroke="#3a1a6a" stroke-width="0.8"/><circle cx="65" cy="37" r="3.2" fill="#ff6ab0" stroke="#7c2a50" stroke-width="0.8"/></svg>`,
  hat_bandana:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,40 C30,35 70,35 70,40 C66,38 34,38 30,40 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="1.6" stroke-linejoin="round"/><path d="M70,38 C74,38 78,42 76,46 L72,44 C73,42 71,40 69,40 Z" fill="#a02a2a" stroke="#7a1e1e" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  // --- batch 2 ---
  hat_beret:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30,38 C26,26 60,20 69,30 C72,34 70,38 66,39 C54,35 40,36 30,38 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="2" stroke-linejoin="round"/><path d="M30,38 C42,36 56,35 66,39" fill="none" stroke="#7a1e1e" stroke-width="1.2" opacity="0.7"/><path d="M48,22 L50,18" stroke="#7a1e1e" stroke-width="1.8"/><circle cx="50" cy="17" r="2" fill="#7a1e1e"/></svg>`,
  hat_sun:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="40" rx="26" ry="5.5" fill="#e6c87a" stroke="#9a7a30" stroke-width="1.8"/><path d="M36,40 C36,26 64,26 64,40 Z" fill="#eed28a" stroke="#9a7a30" stroke-width="1.8" stroke-linejoin="round"/><path d="M36,38 C45,40 55,40 64,38 L64,34 C55,36 45,36 36,34 Z" fill="#d2453a" stroke="#7a1e16" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  hat_bow:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50,32 C44,26 36,26 36,32 C36,38 44,38 50,34 Z" fill="#ff6ab0" stroke="#a02a60" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,32 C56,26 64,26 64,32 C64,38 56,38 50,34 Z" fill="#ff6ab0" stroke="#a02a60" stroke-width="1.6" stroke-linejoin="round"/><path d="M41,30 L45,32.5 M59,30 L55,32.5" stroke="#a02a60" stroke-width="0.9" opacity="0.6"/><circle cx="50" cy="33" r="3.2" fill="#e0488e" stroke="#a02a60" stroke-width="1.2"/></svg>`,
  hat_tiara:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,38 C40,34 60,34 66,38" fill="none" stroke="#e8c24a" stroke-width="3"/><path d="M41,35 L44,27 L47,34 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/><path d="M47,34 L50,23 L53,34 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/><path d="M53,34 L56,27 L59,35 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/><circle cx="50" cy="29" r="1.6" fill="#7fd4ff"/><circle cx="44" cy="31" r="1.1" fill="#ff8ac2"/><circle cx="56" cy="31" r="1.1" fill="#ff8ac2"/></svg>`,
  hat_headband:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M31,38 C38,32 62,32 69,38 L69,42 C62,36 38,36 31,42 Z" fill="#3a86d0" stroke="#1f4f80" stroke-width="1.6" stroke-linejoin="round"/><path d="M32,39.5 C39,34 61,34 68,39.5" fill="none" stroke="#f0f3f7" stroke-width="1.4"/></svg>`,
  hat_cat:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,38 L31,22 L46,30 Z" fill="#2a2e3a" stroke="#12141a" stroke-width="1.6" stroke-linejoin="round"/><path d="M66,38 L69,22 L54,30 Z" fill="#2a2e3a" stroke="#12141a" stroke-width="1.6" stroke-linejoin="round"/><path d="M36,34 L34,26 L42,30 Z" fill="#ff8ac2"/><path d="M64,34 L66,26 L58,30 Z" fill="#ff8ac2"/></svg>`,
  hat_bunny:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M40,36 C36,20 40,10 44,12 C47,14 47,28 45,36 Z" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.6" stroke-linejoin="round"/><path d="M60,36 C64,20 60,10 56,12 C53,14 53,28 55,36 Z" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="1.6" stroke-linejoin="round"/><path d="M42,32 C40,22 42,15 44,16 C45,18 45,27 44,32 Z" fill="#ffb4d2"/><path d="M58,32 C60,22 58,15 56,16 C55,18 55,27 56,32 Z" fill="#ffb4d2"/></svg>`,
  hat_fedora:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28,40 C36,43 64,43 72,40 C74,39 73,37 70,38 C64,39 36,39 30,38 C27,37 26,39 28,40 Z" fill="#7a7a86" stroke="#3a3a44" stroke-width="1.6" stroke-linejoin="round"/><path d="M35,38 C35,26 42,24 50,24 C58,24 65,26 65,38 Z" fill="#8a8a96" stroke="#3a3a44" stroke-width="1.6" stroke-linejoin="round"/><path d="M47,25 C48,29 52,29 53,25" fill="none" stroke="#3a3a44" stroke-width="1" opacity="0.7"/><path d="M35,38 L65,38 L65,34 C55,36 45,36 35,34 Z" fill="#1f242c"/></svg>`,
  hat_bucket:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M37,27 L63,27 L66,38 L34,38 Z" fill="#6a7a4a" stroke="#3a4426" stroke-width="1.8" stroke-linejoin="round"/><path d="M34,38 L66,38 L70,44 C56,41 44,41 30,44 Z" fill="#5e6e40" stroke="#3a4426" stroke-width="1.8" stroke-linejoin="round"/><path d="M36,31 L64,31" stroke="#3a4426" stroke-width="0.9" opacity="0.6"/></svg>`,
  hat_sombrero:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M22,40 C22,35 30,36 34,36 C38,36 62,36 66,36 C70,36 78,35 78,40 C66,44 34,44 22,40 Z" fill="#d2a85a" stroke="#8a6526" stroke-width="1.8" stroke-linejoin="round"/><path d="M40,36 C40,24 60,24 60,36 Z" fill="#dcb46a" stroke="#8a6526" stroke-width="1.8" stroke-linejoin="round"/><path d="M40,33 L60,33" stroke="#c43a3a" stroke-width="1.6"/><path d="M24,40 C40,43 60,43 76,40" fill="none" stroke="#c43a3a" stroke-width="1.2" opacity="0.7"/></svg>`,
  hat_party:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50,12 L60,38 L40,38 Z" fill="#4aa3ff" stroke="#1f5a99" stroke-width="1.8" stroke-linejoin="round"/><path d="M46,22 L55,25 M43,29 L58,31" stroke="#f7d36c" stroke-width="2"/><circle cx="50" cy="11" r="2.6" fill="#ff6ab0" stroke="#a02a60" stroke-width="1"/></svg>`,
  hat_detective:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,40 C34,26 66,26 66,40 Z" fill="#8a6a42" stroke="#4a3618" stroke-width="1.6" stroke-linejoin="round"/><path d="M34,40 C28,40 26,36 28,34 C31,37 33,38 36,38 Z" fill="#7a5c36" stroke="#4a3618" stroke-width="1.4" stroke-linejoin="round"/><path d="M66,40 C72,40 74,36 72,34 C69,37 67,38 64,38 Z" fill="#7a5c36" stroke="#4a3618" stroke-width="1.4" stroke-linejoin="round"/><path d="M40,30 L60,30 M37,34 L63,34" stroke="#4a3618" stroke-width="0.8" opacity="0.5"/><path d="M47,25 C48,23 52,23 53,25" fill="none" stroke="#4a3618" stroke-width="1.2"/></svg>`,
  hat_witch:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="40" rx="20" ry="4" fill="#241a33" stroke="#0e0a16" stroke-width="1.6"/><path d="M38,40 C42,28 46,18 58,10 C52,18 54,28 62,40 Z" fill="#2e2244" stroke="#0e0a16" stroke-width="1.8" stroke-linejoin="round"/><path d="M41,37 C46,39 55,39 59,37 L58,33 C53,35 47,35 42,33 Z" fill="#5a3a9a" stroke="#0e0a16" stroke-width="0.9"/><rect x="48" y="32.5" width="5" height="5" fill="none" stroke="#f7d36c" stroke-width="1.3"/></svg>`,
  hat_sailor:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,38 C34,28 66,28 66,38 Z" fill="#f0f3f7" stroke="#9aa6b4" stroke-width="1.6" stroke-linejoin="round"/><path d="M32,42 C32,38 68,38 68,42 C56,39 44,39 32,42 Z" fill="#2a5ca8" stroke="#163b75" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="32" r="1.8" fill="#2a5ca8"/></svg>`,
  hat_propeller:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,40 C34,28 66,28 66,40 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.6" stroke-linejoin="round"/><path d="M50,28 C42,28 36,32 34,40 L44,40 C45,34 47,30 50,28 Z" fill="#f7d36c" stroke="#5a1212" stroke-width="0.9"/><path d="M50,28 C58,28 64,32 66,40 L56,40 C55,34 53,30 50,28 Z" fill="#3a86d0" stroke="#5a1212" stroke-width="0.9"/><path d="M50,23 L50,28" stroke="#1a1a1f" stroke-width="1.6"/><ellipse cx="42" cy="22" rx="7" ry="2.4" fill="#3fae5a" stroke="#1a5a2c" stroke-width="1"/><ellipse cx="58" cy="22" rx="7" ry="2.4" fill="#f7d36c" stroke="#8a5a10" stroke-width="1"/><circle cx="50" cy="22" r="1.6" fill="#1a1a1f"/></svg>`,
  hat_ushanka:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,40 C34,26 66,26 66,40 Z" fill="#7a5a3a" stroke="#3e2c18" stroke-width="1.8" stroke-linejoin="round"/><path d="M34,38 C30,38 28,44 30,48 L36,46 C35,43 35,40 36,38 Z" fill="#8a6a48" stroke="#3e2c18" stroke-width="1.4" stroke-linejoin="round"/><path d="M66,38 C70,38 72,44 70,48 L64,46 C65,43 65,40 64,38 Z" fill="#8a6a48" stroke="#3e2c18" stroke-width="1.4" stroke-linejoin="round"/><path d="M36,39 C44,36 56,36 64,39 L64,34 C56,31 44,31 36,34 Z" fill="#c9b390" stroke="#8a7350" stroke-width="1.2"/><path d="M40,36 L40,33.5 M46,34.8 L46,32.4 M54,34.8 L54,32.4 M60,36 L60,33.5" stroke="#8a7350" stroke-width="0.8" opacity="0.7"/></svg>`,
  helmet_samurai:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,40 C32,26 68,26 68,40 Z" fill="#3a3f4a" stroke="#15181f" stroke-width="2" stroke-linejoin="round"/><path d="M32,38 C26,40 24,44 26,46 C30,44 33,42 36,41 Z" fill="#2e323c" stroke="#15181f" stroke-width="1.4" stroke-linejoin="round"/><path d="M68,38 C74,40 76,44 74,46 C70,44 67,42 64,41 Z" fill="#2e323c" stroke="#15181f" stroke-width="1.4" stroke-linejoin="round"/><path d="M50,26 C44,18 40,14 38,14 C42,20 45,24 47,27 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/><path d="M50,26 C56,18 60,14 62,14 C58,20 55,24 53,27 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/><circle cx="50" cy="27" r="2" fill="#e8c24a" stroke="#8a5a10" stroke-width="0.8"/><path d="M36,36 C44,33 56,33 64,36" fill="none" stroke="#15181f" stroke-width="1" opacity="0.7"/></svg>`,
  helmet_spartan:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,42 C32,26 68,26 68,42 L68,46 L62,46 L62,40 C62,32 38,32 38,40 L38,46 L32,46 Z" fill="#c89a4a" stroke="#6e4a14" stroke-width="2" stroke-linejoin="round"/><path d="M38,26 C42,14 58,14 62,26 C56,20 44,20 38,26 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.6" stroke-linejoin="round"/><path d="M44,19 L44,23 M50,17 L50,21 M56,19 L56,23" stroke="#8a2020" stroke-width="1"/></svg>`,
  hat_mining:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M34,40 C34,28 66,28 66,40 Z" fill="#f2c230" stroke="#8a6a10" stroke-width="1.8" stroke-linejoin="round"/><path d="M30,42 C30,39 70,39 70,42 C58,40 42,40 30,42 Z" fill="#e0b020" stroke="#8a6a10" stroke-width="1.4" stroke-linejoin="round"/><path d="M50,33 L50,39" stroke="#8a6a10" stroke-width="1" opacity="0.7"/><rect x="46" y="27" width="8" height="6" rx="1" fill="#8a8a96" stroke="#4a4a54" stroke-width="1.2"/><circle cx="50" cy="30" r="2" fill="#fff8d0" stroke="#8a6a10" stroke-width="0.8"/></svg>`,
  hat_jester:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,38 C30,24 36,18 40,28 C42,14 58,14 60,28 C64,18 70,24 68,38 C56,34 44,34 32,38 Z" fill="#8a4fd0" stroke="#41246b" stroke-width="1.8" stroke-linejoin="round"/><path d="M42,30 C44,16 56,16 58,30 C53,28 47,28 42,30 Z" fill="#3fae5a" stroke="#1a5a2c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="33" cy="24" r="2" fill="#f7d36c" stroke="#8a5a10" stroke-width="0.8"/><circle cx="50" cy="14" r="2" fill="#f7d36c" stroke="#8a5a10" stroke-width="0.8"/><circle cx="67" cy="24" r="2" fill="#f7d36c" stroke="#8a5a10" stroke-width="0.8"/></svg>`,
};

export const SHIRT_SVGS: Record<string, string> = {
  shirt_iron:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#9aa6b4" stroke="#3a4450" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#3a4450" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#8a96a4" stroke="#3a4450" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#8a96a4" stroke="#3a4450" stroke-width="1.4"/></svg>`,
  shirt_gold:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#e8c24a" stroke="#8a5a10" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#8a5a10" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#f2cf63" stroke="#8a5a10" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#f2cf63" stroke="#8a5a10" stroke-width="1.4"/></svg>`,
  shirt_hoodie:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#5a6470" stroke="#2a3038" stroke-width="2" stroke-linejoin="round"/><path d="M41,60 C45,65 55,65 59,60 C55,67 45,67 41,60 Z" fill="#4a5360" stroke="#2a3038" stroke-width="1.3" stroke-linejoin="round"/><path d="M47,63 L46,70 M53,63 L54,70" stroke="#cfd6dd" stroke-width="1.2"/><path d="M43,69 C47,71 53,71 57,69" fill="none" stroke="#2a3038" stroke-width="1"/></svg>`,
  shirt_tee:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a86d0" stroke="#1f4f80" stroke-width="2" stroke-linejoin="round"/><path d="M45,61 C47,64 53,64 55,61" fill="none" stroke="#1f4f80" stroke-width="1.4"/></svg>`,
  shirt_suit:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#1f242c" stroke="#0c0f14" stroke-width="2" stroke-linejoin="round"/><path d="M45,62 L50,73 L55,62 L52,73 L48,73 Z" fill="#f0f3f7" stroke="#0c0f14" stroke-width="0.9" stroke-linejoin="round"/><path d="M50,64 L47,68 L50,73 L53,68 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="0.8" stroke-linejoin="round"/></svg>`,
  shirt_crimson:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#b03a3a" stroke="#4a1212" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#4a1212" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#d45a5a" stroke="#4a1212" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#d45a5a" stroke="#4a1212" stroke-width="1.4"/></svg>`,
  shirt_obsidian:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#3a3550" stroke="#15101f" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#15101f" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#5a5078" stroke="#15101f" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#5a5078" stroke="#15101f" stroke-width="1.4"/></svg>`,
  shirt_emerald:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#1f8a5a" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#0c3a26" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#37c486" stroke="#0c3a26" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#37c486" stroke="#0c3a26" stroke-width="1.4"/></svg>`,
  shirt_diamond:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M32,54 C30,60 32,68 37,72 L50,70 L63,72 C68,68 70,60 68,54 C58,57 42,57 32,54 Z" fill="#bfe6ff" stroke="#4a86b8" stroke-width="2" stroke-linejoin="round"/><path d="M50,57 L50,70 M40,58 C40,64 42,68 45,70 M60,58 C60,64 58,68 55,70" fill="none" stroke="#4a86b8" stroke-width="1" opacity="0.6"/><circle cx="34" cy="56" r="3.6" fill="#ffffff" stroke="#4a86b8" stroke-width="1.4"/><circle cx="66" cy="56" r="3.6" fill="#ffffff" stroke="#4a86b8" stroke-width="1.4"/></svg>`,
  shirt_tank:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M40,58 C40,54 45,54 45,58 C47,61 53,61 55,58 C55,54 60,54 60,58 C63,64 64,70 62,73 C55,74 45,74 38,73 C36,70 37,64 40,58 Z" fill="#e0e4e8" stroke="#9aa6b4" stroke-width="2" stroke-linejoin="round"/></svg>`,
  shirt_jersey:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#d23a32" stroke="#7a1e16" stroke-width="2" stroke-linejoin="round"/><text x="50" y="72" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">7</text></svg>`,
  shirt_flannel:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#7a3030" stroke="#3a1414" stroke-width="2" stroke-linejoin="round"/><path d="M43,61 L43,73 M57,61 L57,73 M30,66 C44,68 56,68 70,66" fill="none" stroke="#3a1414" stroke-width="1.4" opacity="0.6"/><path d="M50,62 L50,73 M31,63 C44,65 56,65 69,63 M31,70 C44,72 56,72 69,70" fill="none" stroke="#c45a5a" stroke-width="0.8" opacity="0.5"/></svg>`,
  shirt_stripes:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a4658" stroke="#1f2a38" stroke-width="2" stroke-linejoin="round"/><path d="M31,63 C44,65 56,65 69,63 M30,68 C44,70 56,70 70,68 M32,72 C44,73 56,73 68,72" fill="none" stroke="#e0e4e8" stroke-width="1.8"/></svg>`,
  shirt_overalls:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a5a8a" stroke="#1f3050" stroke-width="2" stroke-linejoin="round"/><path d="M44,63 L44,55 M56,63 L56,55" stroke="#2a4570" stroke-width="2.2"/><rect x="44" y="64" width="12" height="8" rx="1" fill="none" stroke="#2a4570" stroke-width="1.2"/></svg>`,
  shirt_lab:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#f0f3f7" stroke="#bcc4cc" stroke-width="2" stroke-linejoin="round"/><path d="M50,62 L50,73" stroke="#bcc4cc" stroke-width="1"/><circle cx="50" cy="65" r="0.9" fill="#9aa6b4"/><circle cx="50" cy="70" r="0.9" fill="#9aa6b4"/><rect x="54" y="64" width="6" height="6" fill="none" stroke="#bcc4cc" stroke-width="1"/></svg>`,
  shirt_vest:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#5a3a2a" stroke="#2a1c12" stroke-width="2" stroke-linejoin="round"/><path d="M45,62 L50,71 L55,62 Z" fill="#f0f3f7" stroke="#2a1c12" stroke-width="0.9" stroke-linejoin="round"/><circle cx="47" cy="66" r="0.9" fill="#2a1c12"/><circle cx="53" cy="66" r="0.9" fill="#2a1c12"/></svg>`,
  shirt_polo:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#2f9a6a" stroke="#0c3a26" stroke-width="2" stroke-linejoin="round"/><path d="M45,61 L48,64 L50,62 L52,64 L55,61" fill="none" stroke="#1f6a4a" stroke-width="1.5"/><path d="M50,62 L50,69" stroke="#1f6a4a" stroke-width="1"/></svg>`,
  shirt_turtleneck:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#8a8a96" stroke="#4a4a54" stroke-width="2" stroke-linejoin="round"/><path d="M42,60 C42,56 58,56 58,60 C54,63 46,63 42,60 Z" fill="#7a7a86" stroke="#4a4a54" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  shirt_tactical:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a4030" stroke="#1f2418" stroke-width="2" stroke-linejoin="round"/><rect x="38" y="64" width="8" height="8" rx="1" fill="#2a3022" stroke="#1f2418" stroke-width="1"/><rect x="54" y="64" width="8" height="8" rx="1" fill="#2a3022" stroke="#1f2418" stroke-width="1"/><path d="M50,61 L50,73" stroke="#1f2418" stroke-width="1.1"/></svg>`,
  shirt_robe:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#5a3a9a" stroke="#2a1a4a" stroke-width="2" stroke-linejoin="round"/><path d="M50,62 L50,73" stroke="#f7d36c" stroke-width="1.3"/><circle cx="43" cy="66" r="1.3" fill="#f7d36c"/><circle cx="57" cy="66" r="1.3" fill="#f7d36c"/></svg>`,
  // --- batch 2: formalwear, dresses, casual + samurai/spartan armour sets ---
  shirt_tuxedo:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#1a1d24" stroke="#07090c" stroke-width="2" stroke-linejoin="round"/><path d="M45,62 C47,64 53,64 55,62 L53,73 L47,73 Z" fill="#f0f3f7" stroke="#07090c" stroke-width="0.8"/><path d="M44,61 L47,65 L45,70 M56,61 L53,65 L55,70" fill="none" stroke="#3a3f4a" stroke-width="1" opacity="0.8"/><path d="M45,60.5 L49,62.5 L45,64.5 Z" fill="#111319"/><path d="M55,60.5 L51,62.5 L55,64.5 Z" fill="#111319"/><circle cx="50" cy="62.5" r="1.1" fill="#111319"/><circle cx="50" cy="68" r="0.7" fill="#1a1d24"/><circle cx="50" cy="71" r="0.7" fill="#1a1d24"/></svg>`,
  shirt_tux_white:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#f0f3f7" stroke="#aab4be" stroke-width="2" stroke-linejoin="round"/><path d="M44,61 C46,65 46,69 45,72 L48,72 C48,68 48,65 47,62 Z" fill="#1a1d24"/><path d="M56,61 C54,65 54,69 55,72 L52,72 C52,68 52,65 53,62 Z" fill="#1a1d24"/><path d="M45,60.5 L49,62.5 L45,64.5 Z" fill="#1a1d24"/><path d="M55,60.5 L51,62.5 L55,64.5 Z" fill="#1a1d24"/><circle cx="50" cy="62.5" r="1.1" fill="#1a1d24"/><circle cx="50" cy="68" r="0.7" fill="#1a1d24"/><circle cx="50" cy="71" r="0.7" fill="#1a1d24"/></svg>`,
  shirt_suit_navy:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#243a5e" stroke="#101c30" stroke-width="2" stroke-linejoin="round"/><path d="M45,62 L50,64 L55,62 L52,73 L48,73 Z" fill="#f0f3f7" stroke="#101c30" stroke-width="0.8"/><path d="M50,64 L48,67 L50,73 L52,67 Z" fill="#c43a3a" stroke="#7a1e1e" stroke-width="0.7"/><rect x="56" y="66" width="3.2" height="1.8" fill="#f0f3f7"/></svg>`,
  shirt_pinstripe:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#2e3138" stroke="#14161a" stroke-width="2" stroke-linejoin="round"/><path d="M38,57 C38,63 38,69 39,73 M43,61 L43,73 M57,61 L57,73 M62,57 C62,63 62,69 61,73" fill="none" stroke="#8a8f9a" stroke-width="0.7" opacity="0.6"/><path d="M45,62 L50,64 L55,62 L52,73 L48,73 Z" fill="#f0f3f7" stroke="#14161a" stroke-width="0.8"/><path d="M50,64 L48,67 L50,73 L52,67 Z" fill="#aab4be" stroke="#5a6470" stroke-width="0.7"/></svg>`,
  shirt_dress_red:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#c2304e" stroke="#6e1228" stroke-width="2" stroke-linejoin="round"/><path d="M43,61 C46,64 48,64 50,62 C52,64 54,64 57,61" fill="none" stroke="#6e1228" stroke-width="1.2"/><circle cx="50" cy="60.5" r="1" fill="#f7d36c"/><path d="M36,70 C45,72 55,72 64,70" fill="none" stroke="#e85a78" stroke-width="1" opacity="0.6"/><circle cx="42" cy="67" r="0.6" fill="#ffd9e2" opacity="0.85"/><circle cx="58" cy="68" r="0.6" fill="#ffd9e2" opacity="0.85"/></svg>`,
  shirt_dress_blue:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#2f5fc4" stroke="#14306e" stroke-width="2" stroke-linejoin="round"/><path d="M33,56 C40,60 60,60 67,56" fill="none" stroke="#6f9be0" stroke-width="2" stroke-linecap="round"/><path d="M50,63 l1.6,2 -1.6,2 -1.6,-2 Z" fill="#bfe6ff" stroke="#14306e" stroke-width="0.6"/><circle cx="43" cy="68" r="0.6" fill="#bfe6ff" opacity="0.85"/><circle cx="57" cy="70" r="0.6" fill="#bfe6ff" opacity="0.85"/></svg>`,
  shirt_dress_pink:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#f06a9a" stroke="#98305c" stroke-width="2" stroke-linejoin="round"/><circle cx="42" cy="65" r="0.9" fill="#ffffff" opacity="0.85"/><circle cx="58" cy="65" r="0.9" fill="#ffffff" opacity="0.85"/><circle cx="50" cy="69" r="0.9" fill="#ffffff" opacity="0.85"/><circle cx="45" cy="72" r="0.9" fill="#ffffff" opacity="0.85"/><circle cx="55" cy="72" r="0.9" fill="#ffffff" opacity="0.85"/><path d="M47,61 L50,62.5 L47,64 Z" fill="#ffffff" stroke="#98305c" stroke-width="0.6"/><path d="M53,61 L50,62.5 L53,64 Z" fill="#ffffff" stroke="#98305c" stroke-width="0.6"/><circle cx="50" cy="62.5" r="0.9" fill="#ffffff" stroke="#98305c" stroke-width="0.5"/></svg>`,
  shirt_dress_floral:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#f5ecd2" stroke="#b09a5e" stroke-width="2" stroke-linejoin="round"/><circle cx="43" cy="66" r="1" fill="#f06a9a"/><circle cx="56" cy="69" r="1" fill="#8a4fd0"/><circle cx="49" cy="72" r="1" fill="#f7a04a"/><circle cx="59" cy="63" r="1" fill="#f06a9a"/><path d="M44,67 C45,68 46,68 47,67 M57,70 C58,71 59,71 60,70 M50,73 C51,74 52,74 53,73" fill="none" stroke="#3fae5a" stroke-width="0.8" opacity="0.8"/></svg>`,
  shirt_dress_black:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#1c1c22" stroke="#050507" stroke-width="2" stroke-linejoin="round"/><circle cx="44" cy="61.5" r="0.8" fill="#f0ead8"/><circle cx="47" cy="63" r="0.8" fill="#f0ead8"/><circle cx="50" cy="63.5" r="0.8" fill="#f0ead8"/><circle cx="53" cy="63" r="0.8" fill="#f0ead8"/><circle cx="56" cy="61.5" r="0.8" fill="#f0ead8"/><path d="M38,66 C42,70 48,72 54,72" fill="none" stroke="#3c3c46" stroke-width="1" opacity="0.8"/></svg>`,
  shirt_dress_gold:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#e0b13e" stroke="#8a5e0a" stroke-width="2" stroke-linejoin="round"/><path d="M44,66 l0.8,1.6 1.6,0.8 -1.6,0.8 -0.8,1.6 -0.8,-1.6 -1.6,-0.8 1.6,-0.8 Z" fill="#fff0c0"/><path d="M57,63 l0.7,1.4 1.4,0.7 -1.4,0.7 -0.7,1.4 -0.7,-1.4 -1.4,-0.7 1.4,-0.7 Z" fill="#fff0c0"/><path d="M52,70 l0.6,1.2 1.2,0.6 -1.2,0.6 -0.6,1.2 -0.6,-1.2 -1.2,-0.6 1.2,-0.6 Z" fill="#fff0c0"/><path d="M35,68 C44,71 56,71 65,68" fill="none" stroke="#f2cf63" stroke-width="1" opacity="0.7"/></svg>`,
  shirt_blouse:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#f6f8fa" stroke="#b6c0ca" stroke-width="2" stroke-linejoin="round"/><path d="M44,61 C44,65 48,66 50,64 C52,66 56,65 56,61 C54,63.5 46,63.5 44,61 Z" fill="#ffffff" stroke="#b6c0ca" stroke-width="1"/><circle cx="50" cy="67" r="0.7" fill="#8a96a4"/><circle cx="50" cy="70" r="0.7" fill="#8a96a4"/><circle cx="50" cy="73" r="0.7" fill="#8a96a4"/></svg>`,
  shirt_cardigan:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#9a6a8a" stroke="#4e2e44" stroke-width="2" stroke-linejoin="round"/><path d="M46,62 C49,64 51,64 54,62 L54,73 L46,73 Z" fill="#f0e6d8" stroke="#4e2e44" stroke-width="0.8"/><circle cx="44.5" cy="66" r="0.7" fill="#4e2e44"/><circle cx="44.5" cy="70" r="0.7" fill="#4e2e44"/><path d="M37,72.5 C45,74 55,74 63,72.5" fill="none" stroke="#4e2e44" stroke-width="0.9" opacity="0.6"/></svg>`,
  shirt_kimono:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a4a8a" stroke="#1a2350" stroke-width="2" stroke-linejoin="round"/><path d="M44,61 C49,65 56,70 63,73 L52,73 C48,69 45,65 43,62 Z" fill="#2e3b72" stroke="#1a2350" stroke-width="0.8"/><circle cx="58" cy="64" r="1.1" fill="#ff9ec4"/><circle cx="61" cy="67" r="0.8" fill="#ff9ec4" opacity="0.8"/><path d="M34,68 C45,70.5 55,70.5 66,68 L66,71.5 C55,73.5 45,73.5 34,71.5 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1"/></svg>`,
  shirt_sweater:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#e8dcc2" stroke="#9a8456" stroke-width="2" stroke-linejoin="round"/><path d="M43,61 C46,63 54,63 57,61" fill="none" stroke="#9a8456" stroke-width="1.6"/><path d="M34,65 L38,63.5 L42,65 L46,63.5 L50,65 L54,63.5 L58,65 L62,63.5 L66,65" fill="none" stroke="#c4b48e" stroke-width="1"/><path d="M35,70 L39,68.5 L43,70 L47,68.5 L51,70 L55,68.5 L59,70 L63,68.5 L65,69.5" fill="none" stroke="#c4b48e" stroke-width="1"/></svg>`,
  shirt_denim:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#4a72a8" stroke="#1f3a5e" stroke-width="2" stroke-linejoin="round"/><path d="M50,62 L50,73" stroke="#1f3a5e" stroke-width="1.2"/><path d="M48.6,62 L48.6,73 M51.4,62 L51.4,73" stroke="#e8a04a" stroke-width="0.5" opacity="0.8"/><rect x="39" y="64" width="7" height="6" rx="1" fill="#3f6494" stroke="#1f3a5e" stroke-width="1"/><rect x="54" y="64" width="7" height="6" rx="1" fill="#3f6494" stroke="#1f3a5e" stroke-width="1"/><path d="M39,66 L46,66 M54,66 L61,66" stroke="#1f3a5e" stroke-width="0.7"/></svg>`,
  shirt_leather:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#23252c" stroke="#0a0b0e" stroke-width="2" stroke-linejoin="round"/><path d="M43,60 L47,64 L42,64 Z" fill="#2c2e36" stroke="#0a0b0e" stroke-width="0.8"/><path d="M57,60 L53,64 L58,64 Z" fill="#2c2e36" stroke="#0a0b0e" stroke-width="0.8"/><path d="M52,62 L54,73" stroke="#aab4be" stroke-width="1.3"/><circle cx="52.3" cy="63.5" r="0.8" fill="#aab4be"/><path d="M38,64 C38,68 39,71 40,73 M62,64 C62,68 61,71 60,73" fill="none" stroke="#0a0b0e" stroke-width="0.9" opacity="0.8"/></svg>`,
  shirt_hawaiian:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#2a9a8a" stroke="#0f4a42" stroke-width="2" stroke-linejoin="round"/><circle cx="42" cy="66" r="1.8" fill="#f0f3f7"/><circle cx="42" cy="66" r="0.7" fill="#f7d36c"/><circle cx="57" cy="64" r="1.8" fill="#f0f3f7"/><circle cx="57" cy="64" r="0.7" fill="#f7d36c"/><circle cx="50" cy="71" r="1.8" fill="#f0f3f7"/><circle cx="50" cy="71" r="0.7" fill="#f7d36c"/><path d="M44,68 C46,69 47,70 48,71 M59,66 C60,68 61,69 61,71" fill="none" stroke="#7fd4c4" stroke-width="0.8" opacity="0.8"/></svg>`,
  shirt_sequin:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#7a3fc0" stroke="#3a1a66" stroke-width="2" stroke-linejoin="round"/><circle cx="41" cy="64" r="0.7" fill="#c9a0ff" opacity="0.9"/><circle cx="46" cy="68" r="0.7" fill="#ffffff" opacity="0.8"/><circle cx="52" cy="65" r="0.7" fill="#c9a0ff" opacity="0.9"/><circle cx="58" cy="69" r="0.7" fill="#ffffff" opacity="0.8"/><circle cx="44" cy="72" r="0.7" fill="#ffffff" opacity="0.8"/><circle cx="55" cy="72" r="0.7" fill="#c9a0ff" opacity="0.9"/><circle cx="61" cy="64" r="0.7" fill="#ffffff" opacity="0.8"/><path d="M36,62 C44,70 56,73 64,71" fill="none" stroke="#9a6ad8" stroke-width="1" opacity="0.5"/></svg>`,
  shirt_samurai:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M29,56 C26,52 28,48 33,49 C36,50 38,53 38,56 C35,58 31,58 29,56 Z" fill="#2e323c" stroke="#15181f" stroke-width="1.3" stroke-linejoin="round"/><path d="M71,56 C74,52 72,48 67,49 C64,50 62,53 62,56 C65,58 69,58 71,56 Z" fill="#2e323c" stroke="#15181f" stroke-width="1.3" stroke-linejoin="round"/><path d="M30,52 C33,51 36,52 37,54 M70,52 C67,51 64,52 63,54" fill="none" stroke="#15181f" stroke-width="0.8" opacity="0.7"/><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#3a3f4a" stroke="#15181f" stroke-width="2" stroke-linejoin="round"/><path d="M33,64 C45,66.5 55,66.5 67,64 M35,69 C45,71 55,71 65,69" fill="none" stroke="#15181f" stroke-width="1.2"/><path d="M44,62 L44,73 M56,62 L56,73" stroke="#e8c24a" stroke-width="0.9" opacity="0.8"/></svg>`,
  shirt_spartan:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M31,55 C29,52 31,49 35,50 C37,51 38,53 38,55 L33,57 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.2" stroke-linejoin="round"/><path d="M69,55 C71,52 69,49 65,50 C63,51 62,53 62,55 L67,57 Z" fill="#c43a3a" stroke="#5a1212" stroke-width="1.2" stroke-linejoin="round"/><path d="M29,57 C29,53 31,52 34,53 C38,56 41,60 45,62 C48,63 52,63 55,62 C59,60 62,56 66,53 C69,52 71,53 71,57 C72,64 69,71 63,73 C55,74 45,74 37,73 C31,71 28,64 29,57 Z" fill="#c89a4a" stroke="#6e4a14" stroke-width="2" stroke-linejoin="round"/><path d="M42,64 C46,66 48,66 50,65 C52,66 54,66 58,64" fill="none" stroke="#8a6420" stroke-width="1"/><path d="M50,66 L50,72 M46,68.5 C48,69.5 52,69.5 54,68.5" fill="none" stroke="#8a6420" stroke-width="0.9" opacity="0.8"/><path d="M38,72.5 L40,75.5 L42,72.8 M46,73.3 L48,76 L50,73.5 M52,73.5 L54,76 L56,73.3 M58,72.8 L60,75.5 L62,72.5" fill="none" stroke="#c43a3a" stroke-width="1.5"/></svg>`,
};

export function hairSvg(id: string): string {
  return HAIR_SVGS[id] ?? "";
}
export function hatSvg(id: string): string {
  return HAT_SVGS[id] ?? "";
}
export function shirtSvg(id: string): string {
  return SHIRT_SVGS[id] ?? "";
}

export const HAIRS: Cosmetic[] = [
  { id: "default", type: "hair", name: "None", free: true, medalCost: 0, color: "" },
  { id: "hair_male", type: "hair", name: "Classic Cut", free: true, medalCost: 0, color: "#6b4423" },
  { id: "hair_female", type: "hair", name: "Shoulder Length", free: true, medalCost: 0, color: "#7a4a2a" },
  { id: "hair_spiky", type: "hair", name: "Spiky", free: false, medalCost: 300, color: "#2a2e3a" },
  { id: "hair_long", type: "hair", name: "Golden Locks", free: false, medalCost: 500, color: "#e8c878" },
  { id: "hair_mohawk", type: "hair", name: "Mohawk", free: false, medalCost: 400, color: "#c43a3a" },
  { id: "hair_bun", type: "hair", name: "Top Knot", free: false, medalCost: 300, color: "#3a2412" },
  { id: "hair_afro", type: "hair", name: "Afro", free: false, medalCost: 400, color: "#2a2018" },
  { id: "hair_ponytail", type: "hair", name: "Ponytail", free: false, medalCost: 300, color: "#4a3018" },
  { id: "hair_buzz", type: "hair", name: "Buzz Cut", free: false, medalCost: 200, color: "#3a3530" },
  { id: "hair_curly", type: "hair", name: "Curly", free: false, medalCost: 300, color: "#5a3a1a" },
  { id: "hair_pixie", type: "hair", name: "Pixie", free: false, medalCost: 300, color: "#1a1a1f" },
  { id: "hair_braids", type: "hair", name: "Braids", free: false, medalCost: 400, color: "#2a1c10" },
  { id: "hair_emo", type: "hair", name: "Side Sweep", free: false, medalCost: 400, color: "#15151a" },
  { id: "hair_dreads", type: "hair", name: "Dreads", free: false, medalCost: 500, color: "#2a1c10" },
  { id: "hair_pigtails", type: "hair", name: "Pigtails", free: false, medalCost: 300, color: "#6b4423" },
  { id: "hair_wavy", type: "hair", name: "Wavy", free: false, medalCost: 400, color: "#7a4a2a" },
  { id: "hair_pink", type: "hair", name: "Pink Dye", free: false, medalCost: 600, color: "#ff6ab0" },
  { id: "hair_blue", type: "hair", name: "Blue Dye", free: false, medalCost: 600, color: "#4aa3ff" },
  { id: "hair_white", type: "hair", name: "Silver Dye", free: false, medalCost: 600, color: "#eef2f6" },
  { id: "hair_red", type: "hair", name: "Redhead", free: false, medalCost: 400, color: "#d2453a" },
  { id: "hair_male_blonde", type: "hair", name: "Classic Cut Blonde", free: false, medalCost: 300, color: "#e8c878" },
  { id: "hair_male_black", type: "hair", name: "Classic Cut Black", free: false, medalCost: 300, color: "#23232b" },
  { id: "hair_female_blonde", type: "hair", name: "Shoulder Length Blonde", free: false, medalCost: 300, color: "#e8c878" },
  { id: "hair_female_red", type: "hair", name: "Shoulder Length Red", free: false, medalCost: 400, color: "#d2453a" },
  { id: "hair_female_black", type: "hair", name: "Shoulder Length Black", free: false, medalCost: 300, color: "#23232b" },
  { id: "hair_long_brown", type: "hair", name: "Chestnut Locks", free: false, medalCost: 500, color: "#6b4423" },
  { id: "hair_long_red", type: "hair", name: "Crimson Locks", free: false, medalCost: 500, color: "#d2453a" },
  { id: "hair_long_black", type: "hair", name: "Raven Locks", free: false, medalCost: 500, color: "#23232b" },
  { id: "hair_wavy_blonde", type: "hair", name: "Wavy Blonde", free: false, medalCost: 400, color: "#e8c878" },
  { id: "hair_wavy_red", type: "hair", name: "Wavy Red", free: false, medalCost: 400, color: "#d2453a" },
  { id: "hair_curly_blonde", type: "hair", name: "Curly Blonde", free: false, medalCost: 300, color: "#e8c878" },
  { id: "hair_curly_red", type: "hair", name: "Curly Red", free: false, medalCost: 300, color: "#d2453a" },
  { id: "hair_ponytail_blonde", type: "hair", name: "Ponytail Blonde", free: false, medalCost: 300, color: "#e8c878" },
  { id: "hair_ponytail_red", type: "hair", name: "Ponytail Red", free: false, medalCost: 300, color: "#d2453a" },
  { id: "hair_bun_blonde", type: "hair", name: "Top Knot Blonde", free: false, medalCost: 300, color: "#e8c878" },
  { id: "hair_green", type: "hair", name: "Lime Dye", free: false, medalCost: 600, color: "#3fae5a" },
  { id: "hair_purple", type: "hair", name: "Violet Dye", free: false, medalCost: 600, color: "#8a4fd0" },
  { id: "hair_teal", type: "hair", name: "Teal Dye", free: false, medalCost: 600, color: "#2ab8a8" },
  { id: "hair_ombre", type: "hair", name: "Sunset Ombre", free: false, medalCost: 900, color: "#ff6ab0" },
  { id: "hair_rainbow", type: "hair", name: "Rainbow Dye", free: false, medalCost: 1200, color: "#8a4fd0" },
];

export const HATS: Cosmetic[] = [
  { id: "default", type: "hat", name: "None", free: true, medalCost: 0, color: "" },
  { id: "hat_tg", type: "hat", name: "Pioneer Cap", free: true, medalCost: 0, color: "#2a6cd0" },
  { id: "helmet_iron", type: "hat", name: "Iron Helm", free: false, medalCost: 600, color: "#9aa6b4" },
  { id: "helmet_gold", type: "hat", name: "Gold Helm", free: false, medalCost: 1200, color: "#e8c24a" },
  { id: "helmet_crimson", type: "hat", name: "Crimson Helm", free: false, medalCost: 800, color: "#b03a3a" },
  { id: "helmet_obsidian", type: "hat", name: "Obsidian Helm", free: false, medalCost: 1400, color: "#3a3550" },
  { id: "helmet_emerald", type: "hat", name: "Emerald Helm", free: false, medalCost: 1000, color: "#1f8a5a" },
  { id: "helmet_diamond", type: "hat", name: "Diamond Helm", free: false, medalCost: 1800, color: "#bfe6ff" },
  { id: "hat_wizard", type: "hat", name: "Wizard Hat", free: false, medalCost: 700, color: "#5a3a9a" },
  { id: "hat_top", type: "hat", name: "Top Hat", free: false, medalCost: 500, color: "#1a1a1f" },
  { id: "hat_beanie", type: "hat", name: "Beanie", free: false, medalCost: 300, color: "#c43a3a" },
  { id: "hat_cowboy", type: "hat", name: "Cowboy Hat", free: false, medalCost: 600, color: "#9a6a3a" },
  { id: "hat_pirate", type: "hat", name: "Pirate Tricorn", free: false, medalCost: 700, color: "#1f242c" },
  { id: "hat_viking", type: "hat", name: "Viking Helm", free: false, medalCost: 800, color: "#8a96a4" },
  { id: "hat_halo", type: "hat", name: "Halo", free: false, medalCost: 1000, color: "#f7d36c" },
  { id: "hat_devil", type: "hat", name: "Devil Horns", free: false, medalCost: 800, color: "#c43a3a" },
  { id: "hat_santa", type: "hat", name: "Santa Hat", free: false, medalCost: 500, color: "#c43a3a" },
  { id: "hat_chef", type: "hat", name: "Chef Toque", free: false, medalCost: 400, color: "#f0f3f7" },
  { id: "hat_grad", type: "hat", name: "Graduation Cap", free: false, medalCost: 500, color: "#1f242c" },
  { id: "hat_flower", type: "hat", name: "Flower Crown", free: false, medalCost: 600, color: "#2f8a4a" },
  { id: "hat_bandana", type: "hat", name: "Bandana", free: false, medalCost: 300, color: "#c43a3a" },
  { id: "hat_beret", type: "hat", name: "Beret", free: false, medalCost: 400, color: "#c43a3a" },
  { id: "hat_sun", type: "hat", name: "Sun Hat", free: false, medalCost: 500, color: "#e6c87a" },
  { id: "hat_bow", type: "hat", name: "Hair Bow", free: false, medalCost: 400, color: "#ff6ab0" },
  { id: "hat_tiara", type: "hat", name: "Tiara", free: false, medalCost: 900, color: "#e8c24a" },
  { id: "hat_headband", type: "hat", name: "Headband", free: false, medalCost: 300, color: "#3a86d0" },
  { id: "hat_cat", type: "hat", name: "Cat Ears", free: false, medalCost: 600, color: "#2a2e3a" },
  { id: "hat_bunny", type: "hat", name: "Bunny Ears", free: false, medalCost: 600, color: "#f0f3f7" },
  { id: "hat_fedora", type: "hat", name: "Fedora", free: false, medalCost: 500, color: "#8a8a96" },
  { id: "hat_bucket", type: "hat", name: "Bucket Hat", free: false, medalCost: 400, color: "#6a7a4a" },
  { id: "hat_sombrero", type: "hat", name: "Sombrero", free: false, medalCost: 700, color: "#d2a85a" },
  { id: "hat_party", type: "hat", name: "Party Hat", free: false, medalCost: 400, color: "#4aa3ff" },
  { id: "hat_detective", type: "hat", name: "Deerstalker", free: false, medalCost: 600, color: "#8a6a42" },
  { id: "hat_witch", type: "hat", name: "Witch Hat", free: false, medalCost: 700, color: "#2e2244" },
  { id: "hat_sailor", type: "hat", name: "Sailor Cap", free: false, medalCost: 400, color: "#f0f3f7" },
  { id: "hat_propeller", type: "hat", name: "Propeller Cap", free: false, medalCost: 500, color: "#c43a3a" },
  { id: "hat_ushanka", type: "hat", name: "Ushanka", free: false, medalCost: 500, color: "#7a5a3a" },
  { id: "helmet_samurai", type: "hat", name: "Samurai Kabuto", free: false, medalCost: 1400, color: "#3a3f4a" },
  { id: "helmet_spartan", type: "hat", name: "Spartan Helm", free: false, medalCost: 1600, color: "#c89a4a" },
  { id: "hat_mining", type: "hat", name: "Hard Hat", free: false, medalCost: 400, color: "#f2c230" },
  { id: "hat_jester", type: "hat", name: "Jester Hat", free: false, medalCost: 600, color: "#8a4fd0" },
];

export const SHIRTS: Cosmetic[] = [
  { id: "default", type: "shirt", name: "None", free: true, medalCost: 0, color: "" },
  { id: "shirt_iron", type: "shirt", name: "Iron Plate", free: false, medalCost: 600, color: "#9aa6b4" },
  { id: "shirt_gold", type: "shirt", name: "Gold Plate", free: false, medalCost: 1200, color: "#e8c24a" },
  { id: "shirt_crimson", type: "shirt", name: "Crimson Plate", free: false, medalCost: 800, color: "#b03a3a" },
  { id: "shirt_obsidian", type: "shirt", name: "Obsidian Plate", free: false, medalCost: 1400, color: "#3a3550" },
  { id: "shirt_emerald", type: "shirt", name: "Emerald Plate", free: false, medalCost: 1000, color: "#1f8a5a" },
  { id: "shirt_diamond", type: "shirt", name: "Diamond Plate", free: false, medalCost: 1800, color: "#bfe6ff" },
  { id: "shirt_hoodie", type: "shirt", name: "Hoodie", free: false, medalCost: 400, color: "#5a6470" },
  { id: "shirt_tee", type: "shirt", name: "Tee", free: false, medalCost: 300, color: "#3a86d0" },
  { id: "shirt_suit", type: "shirt", name: "Sharp Suit", free: false, medalCost: 800, color: "#1f242c" },
  { id: "shirt_tank", type: "shirt", name: "Tank Top", free: false, medalCost: 300, color: "#e0e4e8" },
  { id: "shirt_jersey", type: "shirt", name: "Jersey", free: false, medalCost: 400, color: "#d23a32" },
  { id: "shirt_flannel", type: "shirt", name: "Flannel", free: false, medalCost: 400, color: "#7a3030" },
  { id: "shirt_stripes", type: "shirt", name: "Striped Shirt", free: false, medalCost: 300, color: "#3a4658" },
  { id: "shirt_overalls", type: "shirt", name: "Overalls", free: false, medalCost: 500, color: "#3a5a8a" },
  { id: "shirt_lab", type: "shirt", name: "Lab Coat", free: false, medalCost: 500, color: "#f0f3f7" },
  { id: "shirt_vest", type: "shirt", name: "Vest", free: false, medalCost: 500, color: "#5a3a2a" },
  { id: "shirt_polo", type: "shirt", name: "Polo", free: false, medalCost: 300, color: "#2f9a6a" },
  { id: "shirt_turtleneck", type: "shirt", name: "Turtleneck", free: false, medalCost: 400, color: "#8a8a96" },
  { id: "shirt_tactical", type: "shirt", name: "Tactical Vest", free: false, medalCost: 700, color: "#3a4030" },
  { id: "shirt_robe", type: "shirt", name: "Wizard Robe", free: false, medalCost: 700, color: "#5a3a9a" },
  { id: "shirt_tuxedo", type: "shirt", name: "Classic Tuxedo", free: false, medalCost: 900, color: "#1a1d24" },
  { id: "shirt_tux_white", type: "shirt", name: "White Tuxedo", free: false, medalCost: 1000, color: "#f0f3f7" },
  { id: "shirt_suit_navy", type: "shirt", name: "Navy Suit", free: false, medalCost: 800, color: "#243a5e" },
  { id: "shirt_pinstripe", type: "shirt", name: "Pinstripe Suit", free: false, medalCost: 900, color: "#2e3138" },
  { id: "shirt_dress_red", type: "shirt", name: "Scarlet Gown", free: false, medalCost: 800, color: "#c2304e" },
  { id: "shirt_dress_blue", type: "shirt", name: "Sapphire Gown", free: false, medalCost: 800, color: "#2f5fc4" },
  { id: "shirt_dress_pink", type: "shirt", name: "Rose Dress", free: false, medalCost: 600, color: "#f06a9a" },
  { id: "shirt_dress_floral", type: "shirt", name: "Sundress", free: false, medalCost: 500, color: "#f5ecd2" },
  { id: "shirt_dress_black", type: "shirt", name: "Evening Dress", free: false, medalCost: 900, color: "#1c1c22" },
  { id: "shirt_dress_gold", type: "shirt", name: "Golden Gown", free: false, medalCost: 1200, color: "#e0b13e" },
  { id: "shirt_blouse", type: "shirt", name: "Silk Blouse", free: false, medalCost: 400, color: "#f6f8fa" },
  { id: "shirt_cardigan", type: "shirt", name: "Cardigan", free: false, medalCost: 400, color: "#9a6a8a" },
  { id: "shirt_kimono", type: "shirt", name: "Kimono", free: false, medalCost: 700, color: "#3a4a8a" },
  { id: "shirt_sweater", type: "shirt", name: "Knit Sweater", free: false, medalCost: 400, color: "#e8dcc2" },
  { id: "shirt_denim", type: "shirt", name: "Denim Jacket", free: false, medalCost: 500, color: "#4a72a8" },
  { id: "shirt_leather", type: "shirt", name: "Leather Jacket", free: false, medalCost: 700, color: "#23252c" },
  { id: "shirt_hawaiian", type: "shirt", name: "Hawaiian Shirt", free: false, medalCost: 500, color: "#2a9a8a" },
  { id: "shirt_sequin", type: "shirt", name: "Sequin Top", free: false, medalCost: 800, color: "#7a3fc0" },
  { id: "shirt_samurai", type: "shirt", name: "Samurai Armor", free: false, medalCost: 1400, color: "#3a3f4a" },
  { id: "shirt_spartan", type: "shirt", name: "Spartan Cuirass", free: false, medalCost: 1600, color: "#c89a4a" },
];

export const COSMETIC_GROUPS: { type: CosmeticType; label: string; items: Cosmetic[] }[] = [
  { type: "skin", label: "Skins", items: SKINS },
  { type: "hat", label: "Hats", items: HATS },
  { type: "hair", label: "Hair", items: HAIRS },
  { type: "shirt", label: "Shirts", items: SHIRTS },
  { type: "capital", label: "Capitals", items: CAPITALS },
  { type: "sword", label: "Swords", items: SWORDS },
  { type: "cloak", label: "Cloaks", items: CLOAKS },
];

const ALL: Cosmetic[] = [...SKINS, ...CAPITALS, ...SWORDS, ...CLOAKS, ...HATS, ...HAIRS, ...SHIRTS];

export function cosmeticById(type: CosmeticType, id: string): Cosmetic | undefined {
  return ALL.find((c) => c.type === type && c.id === id);
}

/**
 * A cosmetic is usable if it's free or owned. (Cloaks are owned like anything else — the
 * members-only restriction is enforced at PURCHASE time, not on equip.)
 */
export function canUseCosmetic(type: CosmeticType, id: string, owned: ReadonlySet<string>): boolean {
  const c = cosmeticById(type, id);
  return c ? c.free || owned.has(id) : false;
}
