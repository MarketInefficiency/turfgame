/**
 * Skin pack generator — emits supabase/skin_pack.sql.
 *
 * Three sources, all rendered through the existing `kind='image'` skin pipeline:
 *  1. ORIGINAL ART (memes, faces, monkeys, animals) — hand-authored SVGs in this file,
 *     embedded as base64 data-URLs so they need no hosting and survive offline.
 *  2. COUNTRY FLAGS — public-domain national symbols served from flagcdn.com (free for
 *     commercial use, no attribution required).
 *  3. EMOJI — Twemoji art (jdecked/twemoji), licensed CC-BY 4.0: commercial use is fine
 *     but the game's credits MUST include: "Emoji art by Twemoji, licensed CC-BY 4.0".
 *
 * Legal notes on the meme skins (kept original on purpose):
 *  - "Clip Pal" is an original paperclip character — NOT Microsoft's Clippy (trademarked).
 *  - "Smug Grin" is an original mischief face — NOT Trollface (registered copyright,
 *    actively licensed; do not ship the real one).
 *  - "Stonks" is original art evoking the meme; the word itself isn't protected.
 *  - "Teddy Monkey" is an original cartoon (a real animal's viral moment isn't ownable).
 *
 * Usage:  node tools/build-skin-pack.mjs   → writes supabase/skin_pack.sql
 * Then run that file in the Supabase SQL editor (idempotent upsert).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "skin_pack.sql");

const esc = (s) => s.replace(/'/g, "''");
const dataUrl = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

// ---------------------------------------------------------------------------
// SVG helpers — every skin is a 100x100 square (the avatar mask crops it to the
// inscribed circle, so keep features inside cx=50, cy=50, r=50).
// ---------------------------------------------------------------------------
const SVG = (inner) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='256' height='256'>${inner}</svg>`;
const BG = (c) => `<rect width='100' height='100' fill='${c}'/>`;
const EYES = (y = 52, dx = 12, r = 3.2, ink = "#241710") =>
  `<circle cx='${50 - dx}' cy='${y}' r='${r}' fill='${ink}'/><circle cx='${50 + dx}' cy='${y}' r='${r}' fill='${ink}'/>`;

// --- Face kit (teen/20s stylisation: bald canvas — the HAIR cosmetic layers on top) ---
const TONES = {
  t1: ["#f2c79a", "#d9a86e"], t2: ["#e0a878", "#c28a55"], t3: ["#c98a5e", "#aa6f3f"],
  t4: ["#9a6a42", "#7d5230"], t5: ["#6e4428", "#55321a"],
};
// Bald head with ears, side contour shade and a scalp sheen.
const HEAD2 = (t) => {
  const [skin, shade] = TONES[t];
  return `<ellipse cx='23' cy='52' rx='4.5' ry='7' fill='${skin}' stroke='#241710' stroke-width='2'/>` +
    `<ellipse cx='77' cy='52' rx='4.5' ry='7' fill='${skin}' stroke='#241710' stroke-width='2'/>` +
    `<circle cx='23' cy='52' r='1.8' fill='${shade}' opacity='0.6'/><circle cx='77' cy='52' r='1.8' fill='${shade}' opacity='0.6'/>` +
    `<path d='M50,17 C68,17 77,31 76,50 C75,68 65,81 50,81 C35,81 25,68 24,50 C23,31 32,17 50,17 Z' fill='${skin}' stroke='#241710' stroke-width='2.4'/>` +
    `<path d='M61,24 C70,32 71,52 66,66 C73,56 73,34 61,24 Z' fill='${shade}' opacity='0.5'/>` +
    `<path d='M36,22 Q44,18.4 52,20' fill='none' stroke='#ffffff' stroke-width='2.2' opacity='0.3' stroke-linecap='round'/>`;
};
// Almond eye: sclera + coloured iris + pupil + highlight. lid > 0 lowers the upper lid (heavy/sleepy).
const EYE2 = (x, y, iris, lid = 0) =>
  `<path d='M${x - 7.5},${y} Q${x},${y - 5.4 + lid} ${x + 7.5},${y} Q${x},${y + 4.8} ${x - 7.5},${y} Z' fill='#fff' stroke='#241710' stroke-width='1.7'/>` +
  `<circle cx='${x}' cy='${y - 0.2}' r='3.1' fill='${iris}'/><circle cx='${x}' cy='${y - 0.2}' r='1.5' fill='#241710'/>` +
  `<circle cx='${x + 1.1}' cy='${y - 1.6}' r='0.9' fill='#fff'/>`;
const EYES2 = (iris, lid = 0) => EYE2(38, 48, iris, lid) + EYE2(62, 48, iris, lid);
// Symmetric brows; outerDrop > 0 slants the outer ends down (relaxed/confident), < 0 raises them.
const BROWS = (y, outerDrop = 1.5, w = 3.2, c = "#241710") =>
  `<path d='M30,${y + outerDrop} Q38,${y - 2.6} 46,${y}' fill='none' stroke='${c}' stroke-width='${w}' stroke-linecap='round'/>` +
  `<path d='M54,${y} Q62,${y - 2.6} 70,${y + outerDrop}' fill='none' stroke='${c}' stroke-width='${w}' stroke-linecap='round'/>`;
const NOSE2 = `<path d='M50,52 L48.4,60 Q50,62.4 53,60.4' fill='none' stroke='#241710' stroke-width='2' stroke-linecap='round' opacity='0.85'/>`;
const SMIRK = `<path d='M42,68.6 Q51,73.6 60,67.6' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>` +
  `<path d='M60,67.6 Q62.4,66.8 63.4,64.9' fill='none' stroke='#241710' stroke-width='2' stroke-linecap='round'/>`;
const GRIN = `<path d='M39,66.5 Q50,77 61,66.5 Q50,71.8 39,66.5 Z' fill='#ffffff' stroke='#241710' stroke-width='1.8' stroke-linejoin='round'/>`;
const CALM = `<path d='M43,69 Q50,71.6 57,69' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>`;
const LIPS = (c) =>
  `<path d='M42,68 Q46,65.4 50,67.8 Q54,65.4 58,68 Q54,72.8 50,72.6 Q46,72.8 42,68 Z' fill='${c}' stroke='#241710' stroke-width='1.4'/>`;
const LINER = `<path d='M30.5,47 L26.6,44.6 M69.5,47 L73.4,44.6' stroke='#241710' stroke-width='2' stroke-linecap='round'/>`;
const BLUSH2 = `<ellipse cx='32' cy='59' rx='4.4' ry='2.8' fill='#e88a7a' opacity='0.45'/><ellipse cx='68' cy='59' rx='4.4' ry='2.8' fill='#e88a7a' opacity='0.45'/>`;
const FRECKLES = `<circle cx='34' cy='57' r='1' fill='#b87a4a'/><circle cx='39' cy='59.4' r='1' fill='#b87a4a'/><circle cx='44' cy='57.6' r='1' fill='#b87a4a'/><circle cx='56' cy='57.6' r='1' fill='#b87a4a'/><circle cx='61' cy='59.4' r='1' fill='#b87a4a'/><circle cx='66' cy='57' r='1' fill='#b87a4a'/>`;
const STUBBLE = (c = "#55321a") =>
  `<path d='M31,62 C34,74 42,80 50,80 C58,80 66,74 69,62 C64,72 56,76 50,76 C44,76 36,72 31,62 Z' fill='${c}' opacity='0.28'/>`;

// art skins: { id, name, cost, rarity, color (territory tint), svg }
const ART = [];

// --- Memes -----------------------------------------------------------------
ART.push({
  id: "skin_clip_pal", name: "Clip Pal", cost: 1000, rarity: 0.08, color: "#4aa3ff",
  svg: SVG(BG("#cfe8ff") +
    `<rect x='33' y='16' width='34' height='64' rx='17' fill='none' stroke='#8fa6ba' stroke-width='7'/>` +
    `<rect x='42' y='30' width='16' height='42' rx='8' fill='none' stroke='#aebfd0' stroke-width='5.5'/>` +
    `<circle cx='41' cy='42' r='7' fill='#fff' stroke='#24323f' stroke-width='2'/><circle cx='59' cy='42' r='7' fill='#fff' stroke='#24323f' stroke-width='2'/>` +
    `<circle cx='42.5' cy='43.5' r='3' fill='#24323f'/><circle cx='60.5' cy='43.5' r='3' fill='#24323f'/>` +
    `<path d='M42,60 Q50,67 58,60' fill='none' stroke='#24323f' stroke-width='2.6' stroke-linecap='round'/>`),
});
ART.push({
  id: "skin_teddy_monkey", name: "Teddy Monkey", cost: 1200, rarity: 0.06, color: "#a9744b",
  svg: SVG(BG("#ffd9c2") +
    // soft vignette + floating hearts and sparkles (cuteness staging)
    `<circle cx='50' cy='50' r='44' fill='#ffe7d6'/>` +
    `<path d='M24,18 c-1.3,-1.8 -4,-0.7 -4,1.3 c0,1.8 2.2,3.1 4,4.4 c1.8,-1.3 4,-2.6 4,-4.4 c0,-2 -2.7,-3.1 -4,-1.3 Z' fill='#ff9eae'/>` +
    `<path d='M78,22 c-1,-1.4 -3.2,-0.5 -3.2,1 c0,1.4 1.8,2.5 3.2,3.5 c1.4,-1 3.2,-2.1 3.2,-3.5 c0,-1.5 -2.2,-2.4 -3.2,-1 Z' fill='#ffb8c4'/>` +
    `<path d='M14,46 l1,2.2 2.2,1 -2.2,1 -1,2.2 -1,-2.2 -2.2,-1 2.2,-1 Z' fill='#ffffff' opacity='0.9'/>` +
    `<path d='M86,50 l0.9,2 2,0.9 -2,0.9 -0.9,2 -0.9,-2 -2,-0.9 2,-0.9 Z' fill='#ffffff' opacity='0.8'/>` +
    // ears — high and round, cream inner with a blush ring
    `<circle cx='21' cy='32' r='9.5' fill='#a9744b' stroke='#5a3a22' stroke-width='2.2'/><circle cx='21' cy='32' r='4.8' fill='#f5dcb8'/><circle cx='21' cy='32' r='4.8' fill='#f2a48a' opacity='0.35'/>` +
    `<circle cx='79' cy='32' r='9.5' fill='#a9744b' stroke='#5a3a22' stroke-width='2.2'/><circle cx='79' cy='32' r='4.8' fill='#f5dcb8'/><circle cx='79' cy='32' r='4.8' fill='#f2a48a' opacity='0.35'/>` +
    // head + soft top tuft
    `<circle cx='50' cy='42' r='29' fill='#a9744b' stroke='#5a3a22' stroke-width='2.4'/>` +
    `<path d='M44,14.8 Q47,9.4 50,13.4 Q53,8.6 57,13.8 Q54,16.4 50,15.6 Q46,16.6 44,14.8 Z' fill='#a9744b' stroke='#5a3a22' stroke-width='1.6' stroke-linejoin='round'/>` +
    // big cream face panel (heart-ish, low on the head)
    `<path d='M31,45 C31,59 39,65.5 50,65.5 C61,65.5 69,59 69,45 C69,36.6 61,33 50,33 C39,33 31,36.6 31,45 Z' fill='#f5dcb8'/>` +
    // puppy brows — inner ends lifted
    `<path d='M30.6,30 Q36.6,26.6 42.6,29.8' fill='none' stroke='#5a3a22' stroke-width='2.4' stroke-linecap='round'/>` +
    `<path d='M57.4,29.8 Q63.4,26.6 69.4,30' fill='none' stroke='#5a3a22' stroke-width='2.4' stroke-linecap='round'/>` +
    // HUGE low-set glossy eyes — iris fills the eye, triple highlight
    `<circle cx='38' cy='43' r='9' fill='#ffffff' stroke='#5a3a22' stroke-width='1.8'/>` +
    `<circle cx='62' cy='43' r='9' fill='#ffffff' stroke='#5a3a22' stroke-width='1.8'/>` +
    `<circle cx='38.6' cy='44' r='6.8' fill='#6e4428'/><circle cx='61.4' cy='44' r='6.8' fill='#6e4428'/>` +
    `<circle cx='38.6' cy='44.4' r='3.8' fill='#241710'/><circle cx='61.4' cy='44.4' r='3.8' fill='#241710'/>` +
    `<circle cx='35.8' cy='40.4' r='2.5' fill='#ffffff'/><circle cx='58.6' cy='40.4' r='2.5' fill='#ffffff'/>` +
    `<circle cx='41.4' cy='47.4' r='1.2' fill='#ffffff' opacity='0.95'/><circle cx='64.2' cy='47.4' r='1.2' fill='#ffffff' opacity='0.95'/>` +
    `<circle cx='37' cy='48.6' r='0.7' fill='#ffffff' opacity='0.8'/><circle cx='60' cy='48.6' r='0.7' fill='#ffffff' opacity='0.8'/>` +
    // tiny nose + shy smile, close together and low (cute ratio)
    `<ellipse cx='50' cy='52.6' rx='2.6' ry='1.9' fill='#5a3a22'/>` +
    `<path d='M46.8,56.4 Q50,59.4 53.2,56.4' fill='none' stroke='#5a3a22' stroke-width='2' stroke-linecap='round'/>` +
    // big soft blush with sparkle dots
    `<ellipse cx='28.6' cy='51' rx='5' ry='3.4' fill='#f6a88e' opacity='0.8'/><ellipse cx='71.4' cy='51' rx='5' ry='3.4' fill='#f6a88e' opacity='0.8'/>` +
    `<circle cx='27' cy='49.8' r='0.9' fill='#ffffff' opacity='0.9'/><circle cx='70' cy='49.8' r='0.9' fill='#ffffff' opacity='0.9'/>` +
    // arms reaching down into the hug
    `<path d='M24,58 C21,71 28,81 39,85.5 L43,78.5 C35,75.5 29,68 30,58.5 Z' fill='#a9744b' stroke='#5a3a22' stroke-width='2'/>` +
    `<path d='M76,58 C79,71 72,81 61,85.5 L57,78.5 C65,75.5 71,68 70,58.5 Z' fill='#a9744b' stroke='#5a3a22' stroke-width='2'/>` +
    // the teddy, tilted into the cuddle (button eyes, stitches, patch)
    `<g transform='rotate(-6 50 83)'>` +
    `<circle cx='41' cy='72.5' r='4.8' fill='#d9a45e' stroke='#8a5e2a' stroke-width='1.8'/><circle cx='59' cy='72.5' r='4.8' fill='#d9a45e' stroke='#8a5e2a' stroke-width='1.8'/>` +
    `<circle cx='41' cy='72.5' r='2.1' fill='#f2cf94'/><circle cx='59' cy='72.5' r='2.1' fill='#f2cf94'/>` +
    `<circle cx='50' cy='83' r='13.8' fill='#d9a45e' stroke='#8a5e2a' stroke-width='2.2'/>` +
    `<path d='M50,69.5 L50,77' stroke='#8a5e2a' stroke-width='1' opacity='0.7'/>` +
    `<rect x='55' y='74.5' width='6.2' height='6.2' rx='1' fill='#c08a44' transform='rotate(12 58 77.5)'/>` +
    `<path d='M55.5,76 L60.7,80.2 M60.2,75.5 L56,80.7' stroke='#8a5e2a' stroke-width='0.9'/>` +
    `<circle cx='44.5' cy='80' r='2' fill='#241710'/><circle cx='55.5' cy='80' r='2' fill='#241710'/>` +
    `<circle cx='43.9' cy='79.4' r='0.7' fill='#9a9aa4'/><circle cx='54.9' cy='79.4' r='0.7' fill='#9a9aa4'/>` +
    `<ellipse cx='50' cy='87.5' rx='6.6' ry='4.8' fill='#f2cf94'/><ellipse cx='50' cy='85.8' rx='2.3' ry='1.7' fill='#5a3a22'/>` +
    `<path d='M50,87.5 L50,89.4 M50,89.4 Q47.4,91.4 45.4,90 M50,89.4 Q52.6,91.4 54.6,90' fill='none' stroke='#5a3a22' stroke-width='1.2' stroke-linecap='round'/>` +
    `</g>` +
    // cream hands wrapped over the teddy
    `<circle cx='39.5' cy='83' r='4.8' fill='#f5dcb8' stroke='#5a3a22' stroke-width='1.8'/>` +
    `<circle cx='60.5' cy='83' r='4.8' fill='#f5dcb8' stroke='#5a3a22' stroke-width='1.8'/>`),
});
ART.push({
  id: "skin_stonks", name: "Stonks", cost: 1200, rarity: 0.06, color: "#3fae5a",
  svg: SVG(BG("#2e3f63") +
    `<path d='M34,30 L52,24 L62,32 L60,48 L64,58 L50,64 L38,58 L36,44 Z' fill='#9aa0ad'/>` +
    `<path d='M52,24 L62,32 L56,40 L48,34 Z' fill='#b4bac4'/><path d='M38,58 L50,64 L48,50 Z' fill='#7d8494'/>` +
    `<path d='M44,40 L50,42' stroke='#5a6170' stroke-width='2.4'/><path d='M55,41 L60,42' stroke='#5a6170' stroke-width='2.4'/>` +
    `<path d='M30,64 L70,64 L66,84 L34,84 Z' fill='#1f2738'/><path d='M46,64 L50,72 L54,64 Z' fill='#fff'/>` +
    `<path d='M14,86 L34,72 L46,78 L70,56' fill='none' stroke='#3fae5a' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<path d='M70,56 L70,68 L58,56 Z' fill='#3fae5a'/>` +
    `<text x='50' y='19' font-family='Arial, sans-serif' font-size='13' font-weight='900' font-style='italic' fill='#ffffff' text-anchor='middle'>STONKS</text>`),
});
ART.push({
  id: "skin_smug", name: "Smug Grin", cost: 1000, rarity: 0.08, color: "#7a8a9a",
  svg: SVG(BG("#f2f4f6") +
    `<circle cx='50' cy='52' r='36' fill='#ffffff' stroke='#23262e' stroke-width='2.6'/>` +
    `<ellipse cx='37' cy='44' rx='6' ry='4.4' fill='none' stroke='#23262e' stroke-width='2.2'/>` +
    `<ellipse cx='64' cy='44' rx='6' ry='4.4' fill='none' stroke='#23262e' stroke-width='2.2'/>` +
    `<circle cx='39.5' cy='45' r='2' fill='#23262e'/><circle cx='66.5' cy='45' r='2' fill='#23262e'/>` +
    `<path d='M26,62 Q40,76 60,72 Q72,69 76,58' fill='none' stroke='#23262e' stroke-width='3' stroke-linecap='round'/>` +
    `<path d='M26,62 Q30,60 33,62 M76,58 Q73,55 70,57' fill='none' stroke='#23262e' stroke-width='2' stroke-linecap='round'/>` +
    `<path d='M30,33 Q38,29 45,32 M56,31 Q63,28 70,32' fill='none' stroke='#23262e' stroke-width='2.4' stroke-linecap='round'/>`),
});

// --- 10 male faces (modern hairstyles; bald only when it IS the character) -----
const M = (id, name, color, body) => ART.push({ id, name, cost: 400, rarity: 0.18, color, svg: SVG(body) });
// Ace — textured crop with a choppy fringe, confident smirk.
M("skin_face_m1", "Ace", "#3a86d0", BG("#3a86d0") + HEAD2("t1") +
  `<path d='M23.5,45 C20,5 80,5 76.5,45 C73.5,34 69,31.6 64,32.4 L61,26.4 L57,32 L53,26 L49,32 L45,26 L41,32 L38,27 L35,33 C30,34.6 26,39 23.5,45 Z' fill='#4a3018' stroke='#2a1a0a' stroke-width='1.8' stroke-linejoin='round'/>` +
  `<path d='M32,20 C38,15.4 47,13.6 54,14.4' fill='none' stroke='#6e4a28' stroke-width='1.2' opacity='0.7'/>` +
  BROWS(40, 2.4) + EYES2("#3a6ea8") + NOSE2 + SMIRK);
// Bjorn — long swept-back viking hair + braided beard with a gold bead.
M("skin_face_m2", "Bjorn", "#2f8a4a", BG("#2f8a4a") +
  `<path d='M25,38 C20,54 21,70 27,78 L34,73 C29,64 29,50 31,40 Z' fill='#c9a25e' stroke='#8a6a2a' stroke-width='1.8'/>` +
  `<path d='M75,38 C80,54 79,70 73,78 L66,73 C71,64 71,50 69,40 Z' fill='#c9a25e' stroke='#8a6a2a' stroke-width='1.8'/>` +
  HEAD2("t2") +
  `<path d='M23.5,43 C20,4 80,4 76.5,43 C70,27 30,27 23.5,43 Z' fill='#c9a25e' stroke='#8a6a2a' stroke-width='1.8'/>` +
  `<path d='M34,18 C42,12.6 58,12.6 66,18' fill='none' stroke='#8a6a2a' stroke-width='1.2' opacity='0.7'/>` +
  `<path d='M27,52 C28,74 36,85 50,85 C64,85 72,74 73,52 C71,64 70,70 66,74 L62,68 L58,75 L54,69 L50,76 L46,69 L42,75 L38,68 L34,74 C30,70 29,64 27,52 Z' fill='#8a5a2a' stroke='#5a3a14' stroke-width='1.6' stroke-linejoin='round'/>` +
  `<path d='M40,64 C44,61.6 56,61.6 60,64' fill='none' stroke='#5a3a14' stroke-width='3' stroke-linecap='round'/>` +
  `<rect x='47.6' y='78' width='4.8' height='3.4' rx='1' fill='#e8c24a' stroke='#8a5a10' stroke-width='0.9'/>` +
  BROWS(39, -1.8, 3.8, "#8a5a2a") + EYES2("#6a7a8a") + NOSE2);
// Dex — black curtain part + round glasses, one brow raised.
M("skin_face_m3", "Dex", "#e8923a", BG("#e8923a") + HEAD2("t1") +
  `<path d='M48.6,13 C35,14 25,26 23.8,45 C27,32 35,27.4 45,26.8 L47.8,16 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.6'/>` +
  `<path d='M51.4,13 C65,14 75,26 76.2,45 C73,32 65,27.4 55,26.8 L52.2,16 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.6'/>` +
  `<circle cx='38' cy='48' r='9.4' fill='none' stroke='#23262e' stroke-width='2.6'/><circle cx='62' cy='48' r='9.4' fill='none' stroke='#23262e' stroke-width='2.6'/>` +
  `<path d='M47.4,48 L52.6,48 M28.6,48 L24,46 M71.4,48 L76,46' stroke='#23262e' stroke-width='2.4'/>` +
  EYES2("#8a6a2a") +
  `<path d='M30,40.6 Q38,38 46,40.4' fill='none' stroke='#241710' stroke-width='3' stroke-linecap='round'/>` +
  `<path d='M54,38.6 Q62,35.4 70,38' fill='none' stroke='#241710' stroke-width='3' stroke-linecap='round'/>` +
  NOSE2 + CALM);
// Maximo — slicked-back shine + handlebar mustache.
M("skin_face_m4", "Maximo", "#c43a3a", BG("#c43a3a") + HEAD2("t3") +
  `<path d='M23.5,43 C20,4 80,4 76.5,43 C70,27 30,27 23.5,43 Z' fill='#241710' stroke='#0a0a0e' stroke-width='1.8'/>` +
  `<path d='M31,20 C39,13 57,12 67,18 M27,30 C35,20 61,18 71,26' fill='none' stroke='#4a4440' stroke-width='1.2' opacity='0.8'/>` +
  BROWS(38.6, -1.4) + EYES2("#5a3a22") + NOSE2 +
  `<path d='M50,64.5 C45,61.5 37,62 33.6,65.5 C36,68.4 33,71 30.4,70 C34.4,73.6 41,72 44,68 C46,66 48,65.4 50,66 C52,65.4 54,66 56,68 C59,72 65.6,73.6 69.6,70 C67,71 64,68.4 66.4,65.5 C63,62 55,61.5 50,64.5 Z' fill='#3a2412' stroke='#241710' stroke-width='1'/>` +
  `<path d='M44,74 Q50,77.4 56,74' fill='none' stroke='#241710' stroke-width='2.2' stroke-linecap='round'/>`);
// Bruno — DESIGNED bald: tough guy, brow scar, heavy stubble.
M("skin_face_m5", "Bruno", "#5a5ae0", BG("#5a5ae0") + HEAD2("t4") + STUBBLE("#3a2412") +
  `<path d='M30,40.8 L46,40' stroke='#241710' stroke-width='3.6' stroke-linecap='round'/>` +
  `<path d='M54,40 L70,40.8' stroke='#241710' stroke-width='3.6' stroke-linecap='round'/>` +
  `<path d='M62,35 L66,44.6' stroke='#7d5230' stroke-width='2.2' stroke-linecap='round'/>` +
  EYES2("#5a3a22", 1.6) + NOSE2 +
  `<path d='M43,69.6 L58,69' fill='none' stroke='#241710' stroke-width='2.6' stroke-linecap='round'/>`);
// Joaquin — low fade with waves, lidded eyes, goatee.
M("skin_face_m6", "Joaquin", "#2a9a8a", BG("#2a9a8a") + HEAD2("t3") +
  `<path d='M24.5,42 C22,8 78,8 75.5,42 C69,28 31,28 24.5,42 Z' fill='#2a1c10' stroke='#140c06' stroke-width='1.8'/>` +
  `<path d='M32,27 Q36,23.6 40,26 M44,22.4 Q48,20 52,22 M56,22.4 Q60,20.6 64,23 M66,26 Q69,24 71,27' fill='none' stroke='#4a3018' stroke-width='1.3' opacity='0.85'/>` +
  BROWS(39.4, 2) + EYES2("#3f7a4a", 1.2) + NOSE2 + SMIRK +
  `<path d='M42,67 Q50,71 58,67 L58,69.4 Q50,73.4 42,69.4 Z' fill='#3a2412' opacity='0.85'/>` +
  `<path d='M44,75 C45,80.6 55,80.6 56,75 C54,78 46,78 44,75 Z' fill='#3a2412'/>`);
// Finn — messy ginger mop, freckles, eyebrow slit, toothy grin.
M("skin_face_m7", "Finn", "#f2c230", BG("#f2c230") + HEAD2("t1") +
  `<path d='M24,46 C21,24 36,14 50,16 C64,14 79,24 76,46 C74,36 71,31 67,33 L66,27 L61,31 L58,24.6 L53,30 L48,24 L44,30 L39,25.6 L37,31 C32,30 26,38 24,46 Z' fill='#d2683a' stroke='#8a3a1a' stroke-width='1.8' stroke-linejoin='round'/>` +
  FRECKLES +
  `<path d='M30,40.8 Q34,38.6 38,39.4 M41.6,40 L46,40.6' fill='none' stroke='#b06a2a' stroke-width='3' stroke-linecap='round'/>` +
  `<path d='M54,40 Q62,37.4 70,40' fill='none' stroke='#b06a2a' stroke-width='3' stroke-linecap='round'/>` +
  EYES2("#3f7a4a") + NOSE2 + GRIN);
// Sam — receding silver side-sweep + trimmed grey beard, crow's feet.
M("skin_face_m8", "Sam", "#23262e", BG("#23262e") + HEAD2("t2") +
  `<path d='M23.5,43 C20,5 80,5 76.5,43 C72,28 32,28 23.5,43 Z' fill='#c4ccd4' stroke='#8a96a4' stroke-width='1.6'/>` +
  `<path d='M32,19 C40,13.6 60,13.6 68,19' fill='none' stroke='#e6ebf0' stroke-width='1.2' opacity='0.7'/>` +
  `<path d='M28,54 C29,72 37,82 50,82 C63,82 71,72 72,54 C70,68 62,76 50,76 C38,76 30,68 28,54 Z' fill='#c4ccd4' stroke='#8a96a4' stroke-width='1.4'/>` +
  `<path d='M42,66 C46,63.6 54,63.6 58,66' fill='none' stroke='#8a96a4' stroke-width='2.6' stroke-linecap='round'/>` +
  `<path d='M27.4,44 L30,49 M72.6,44 L70,49' stroke='#c28a55' stroke-width='1.6' stroke-linecap='round' opacity='0.9'/>` +
  BROWS(40, 1.6, 3.2, "#aab4be") + EYES2("#6a7a8a") + NOSE2);
// Kade — skin fade with crisp line-up + aviators + stud.
M("skin_face_m9", "Kade", "#d2453a", BG("#d2453a") + HEAD2("t5") + STUBBLE("#241008") +
  `<path d='M24.5,41 C22,6 78,6 75.5,41 L71,41 C69,28 31,28 29,41 Z' fill='#15100a' stroke='#0a0604' stroke-width='1.6'/>` +
  `<path d='M27,42 L73,42 M27,42 L24,40 M73,42 L76,40' stroke='#1a1a1f' stroke-width='2.4'/>` +
  `<path d='M29,42 C29,51 35,53.4 39.6,52 C44,50.8 46,46.6 46,42 Z' fill='#1f242c' stroke='#0c0f14' stroke-width='1.6'/>` +
  `<path d='M71,42 C71,51 65,53.4 60.4,52 C56,50.8 54,46.6 54,42 Z' fill='#1f242c' stroke='#0c0f14' stroke-width='1.6'/>` +
  `<path d='M32,44.5 L36,48.5 M62,44.5 L66,48.5' stroke='#6f8aa8' stroke-width='1.6' stroke-linecap='round' opacity='0.85'/>` +
  `<circle cx='77.5' cy='59' r='2' fill='#e8c24a' stroke='#8a5a10' stroke-width='1'/>` +
  NOSE2 + `<path d='M43,69.4 L58,69.4' stroke='#241710' stroke-width='2.6' stroke-linecap='round'/>`);
// Zane — mid-length bedhead tufts, heavy lids, brow ring.
M("skin_face_m10", "Zane", "#5a3a9a", BG("#5a3a9a") + HEAD2("t2") + STUBBLE() +
  `<path d='M23,46 C19,20 28,6 46,7 L43,13 L51,8 L50,14 L58,9 L57,15 L65,11 L62,18 L71,17 C76,25 77,37 76,46 C72,33 67,29 60,29 C52,27 40,28 35,31 C29,34 25,39 23,46 Z' fill='#5a4632' stroke='#3a2c1c' stroke-width='1.8' stroke-linejoin='round'/>` +
  BROWS(41, 0.6) +
  `<circle cx='66.6' cy='37.6' r='1.7' fill='none' stroke='#aab4be' stroke-width='1.5'/>` +
  EYES2("#3a6ea8", 3) +
  `<path d='M30.5,48.4 Q38,51.4 45.5,48.4 M54.5,48.4 Q62,51.4 69.5,48.4' fill='none' stroke='#241710' stroke-width='1.5' opacity='0.8'/>` +
  NOSE2 + `<path d='M43,69.4 Q50,71 58,68.2' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>`);

// --- 10 female faces (hairstyles + makeup carry the identity) ------------------
const F = (id, name, color, body) => ART.push({ id, name, cost: 400, rarity: 0.18, color, svg: SVG(body) });
// Rosie — chestnut side-part bob, winged liner, warm lips.
F("skin_face_f1", "Rosie", "#ff6ab0", BG("#ff6ab0") +
  `<path d='M22,42 C20,60 23,70 29,73 L34,67 C30,61 29,52 30,43 Z' fill='#6b4423' stroke='#3a2412' stroke-width='1.8'/>` +
  `<path d='M78,42 C80,60 77,70 71,73 L66,67 C70,61 71,52 70,43 Z' fill='#6b4423' stroke='#3a2412' stroke-width='1.8'/>` +
  HEAD2("t1") +
  `<path d='M23.5,44 C20,5 80,5 76.5,44 C74,31 66,26.6 56,26.6 L60,33 C48,29.6 31,32.6 23.5,44 Z' fill='#6b4423' stroke='#3a2412' stroke-width='1.8'/>` +
  BROWS(40.4, 1.2, 2.6) + EYES2("#3a6ea8") + LINER + BLUSH2 + NOSE2 + LIPS("#d2645a"));
// Bella — long sleek black centre-part, full lashes, beauty mark.
F("skin_face_f2", "Bella", "#5a5ae0", BG("#5a5ae0") +
  `<path d='M21,40 C17,58 18,72 25,80 L32,74 C27,65 27,50 29,40 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.8'/>` +
  `<path d='M79,40 C83,58 82,72 75,80 L68,74 C73,65 73,50 71,40 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.8'/>` +
  HEAD2("t2") +
  `<path d='M48.8,13 C36,14 25,26 23.8,46 C27,33 36,27.6 46,27 L48.6,16 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.6'/>` +
  `<path d='M51.2,13 C64,14 75,26 76.2,46 C73,33 64,27.6 54,27 L51.4,16 Z' fill='#1a1a1f' stroke='#0a0a0e' stroke-width='1.6'/>` +
  BROWS(40, 1.4, 2.8) + EYES2("#5a3a22") + LINER +
  `<path d='M33,43.2 L31,40.8 M38,42 L37,39.4 M43,43.2 L45,40.8 M57,43.2 L55,40.8 M62,42 L63,39.4 M67,43.2 L69,40.8' stroke='#241710' stroke-width='1.5' stroke-linecap='round'/>` +
  `<circle cx='64.5' cy='62.5' r='1.2' fill='#241710'/>` + NOSE2 + LIPS("#8a4a5a"));
// Penny — ginger space buns, freckles, big grin.
F("skin_face_f3", "Penny", "#2f8a4a", BG("#2f8a4a") +
  `<circle cx='27' cy='21' r='8' fill='#d2683a' stroke='#8a3a1a' stroke-width='1.8'/><circle cx='73' cy='21' r='8' fill='#d2683a' stroke='#8a3a1a' stroke-width='1.8'/>` +
  `<path d='M24,23 Q26,16.6 31,15 M70,15 Q74.4,16.6 76,23' fill='none' stroke='#8a3a1a' stroke-width='1.1' opacity='0.8'/>` +
  HEAD2("t1") +
  `<path d='M23.5,43 C21,6 79,6 76.5,43 C70,28 56,25.6 50,26 C44,25.6 30,28 23.5,43 Z' fill='#d2683a' stroke='#8a3a1a' stroke-width='1.8'/>` +
  `<path d='M50,26 L50,13' stroke='#8a3a1a' stroke-width='1.4'/>` +
  FRECKLES +
  `<path d='M30,40.4 Q38,37.6 46,40 M54,40 Q62,37.6 70,40.4' fill='none' stroke='#b06a2a' stroke-width='2.6' stroke-linecap='round'/>` +
  EYES2("#3f7a4a") + BLUSH2 + NOSE2 + GRIN);
// Maya — natural curl crown, arched brows, gold hoops.
F("skin_face_f4", "Maya", "#7a4fb8", BG("#7a4fb8") + HEAD2("t4") +
  // gold hoops hanging from the earlobes (drawn under the hair/head sides)
  `<circle cx='23' cy='60.5' r='4.2' fill='none' stroke='#e8c24a' stroke-width='2.4'/>` +
  `<circle cx='77' cy='60.5' r='4.2' fill='none' stroke='#e8c24a' stroke-width='2.4'/>` +
  // solid hair base covering the whole crown down to a forehead hairline (drawn OVER the scalp)
  `<path d='M20,50 C14,28 28,13 50,12 C72,13 86,28 80,50 C77,37 70,32 62,31 C58,29.5 42,29.5 38,31 C30,32 23,37 20,50 Z' fill='#241710'/>` +
  // curl bumps on the perimeter + a few interior for the curly afro silhouette
  `<circle cx='28' cy='22' r='8' fill='#241710'/><circle cx='39' cy='15' r='8.4' fill='#241710'/><circle cx='50' cy='13' r='8' fill='#241710'/><circle cx='61' cy='15' r='8.4' fill='#241710'/><circle cx='72' cy='22' r='8' fill='#241710'/>` +
  `<circle cx='21' cy='35' r='7' fill='#241710'/><circle cx='79' cy='35' r='7' fill='#241710'/><circle cx='23' cy='45' r='6' fill='#241710'/><circle cx='77' cy='45' r='6' fill='#241710'/>` +
  `<circle cx='34' cy='20' r='6' fill='#241710'/><circle cx='45' cy='16' r='6' fill='#241710'/><circle cx='56' cy='16' r='6' fill='#241710'/><circle cx='66' cy='20' r='6' fill='#241710'/>` +
  // soft highlight specks on the curls
  `<circle cx='30' cy='20' r='1.4' fill='#4a3a2a' opacity='0.9'/><circle cx='42' cy='14' r='1.4' fill='#4a3a2a' opacity='0.9'/><circle cx='56' cy='14' r='1.4' fill='#4a3a2a' opacity='0.9'/><circle cx='70' cy='20' r='1.4' fill='#4a3a2a' opacity='0.9'/>` +
  BROWS(39, -1.6, 3) + EYES2("#5a3a22") + LINER + NOSE2 + LIPS("#a8504a"));
// Sofia — sleek high bun + baby hairs, red lips, one arched brow.
F("skin_face_f5", "Sofia", "#2a9a8a", BG("#2a9a8a") +
  `<circle cx='50' cy='14' r='8.4' fill='#2a1c10' stroke='#140c06' stroke-width='1.8'/>` +
  `<path d='M44,12 Q50,8.6 56,12' fill='none' stroke='#4a3018' stroke-width='1.1' opacity='0.8'/>` +
  HEAD2("t2") +
  `<path d='M23.5,43 C20,5 80,5 76.5,43 C70,27 30,27 23.5,43 Z' fill='#2a1c10' stroke='#140c06' stroke-width='1.8'/>` +
  `<path d='M27,44 Q29,41 31,43.6 M73,44 Q71,41 69,43.6' fill='none' stroke='#2a1c10' stroke-width='1.3'/>` +
  `<path d='M30,40.6 Q38,37.6 46,39.8' fill='none' stroke='#241710' stroke-width='2.8' stroke-linecap='round'/>` +
  `<path d='M54,38.8 Q62,35.6 70,38.4' fill='none' stroke='#241710' stroke-width='2.8' stroke-linecap='round'/>` +
  EYES2("#5a3a22", 1) + LINER + NOSE2 + LIPS("#c43a3a") +
  `<path d='M60,73.4 Q62.6,72.6 63.8,71' fill='none' stroke='#241710' stroke-width='1.6' stroke-linecap='round'/>`);
// Luna — long silver hair with blunt bangs, icy shadow.
F("skin_face_f6", "Luna", "#23262e", BG("#23262e") +
  `<path d='M21,38 C17,56 18,72 26,80 L33,74 C28,65 28,50 30,40 Z' fill='#dde4ea' stroke='#8a96a4' stroke-width='1.8'/>` +
  `<path d='M79,38 C83,56 82,72 74,80 L67,74 C72,65 72,50 70,40 Z' fill='#dde4ea' stroke='#8a96a4' stroke-width='1.8'/>` +
  HEAD2("t1") +
  `<path d='M26,39 C24,5 76,5 74,39 L66,39 L64,33 L60,39 L55,33.6 L50,39 L45,33.6 L40,39 L36,33 L34,39 Z' fill='#dde4ea' stroke='#8a96a4' stroke-width='1.8' stroke-linejoin='round'/>` +
  `<path d='M31,44.4 Q38,41 45,44.2 M55,44.2 Q62,41 69,44.4' fill='none' stroke='#9fb6d8' stroke-width='3.4' stroke-linecap='round' opacity='0.75'/>` +
  EYES2("#6a8ab8") + LINER + NOSE2 + LIPS("#a87a8a"));
// Joy — box braids with gold beads, huge grin, dimples.
F("skin_face_f7", "Joy", "#e8923a", BG("#e8923a") +
  `<path d='M24,40 C22,56 24,68 28,74 L33,70 C30,62 29,50 30,41 Z' fill='#241710'/>` +
  `<path d='M76,40 C78,56 76,68 72,74 L67,70 C70,62 71,50 70,41 Z' fill='#241710'/>` +
  `<circle cx='30.5' cy='72' r='2.2' fill='#e8c24a' stroke='#8a5a10' stroke-width='0.9'/><circle cx='69.5' cy='72' r='2.2' fill='#e8c24a' stroke='#8a5a10' stroke-width='0.9'/>` +
  HEAD2("t3") +
  `<path d='M23.5,43 C20,6 80,6 76.5,43 C70,28 30,28 23.5,43 Z' fill='#241710'/>` +
  `<path d='M33,22 L30,41 M42,17 L40,38 M50,15.6 L50,37 M58,17 L60,38 M67,22 L70,41' stroke='#3a2c1c' stroke-width='1.4' opacity='0.9'/>` +
  BROWS(39.6, 2.6, 2.8) + EYES2("#5a3a22") + BLUSH2 + NOSE2 + GRIN +
  `<path d='M37,68.6 Q35.6,71 36.6,73.2 M63,68.6 Q64.4,71 63.4,73.2' fill='none' stroke='#241710' stroke-width='1.5' stroke-linecap='round'/>`);
// Vee — violet asymmetric bob with a diagonal fringe, dramatic wings.
F("skin_face_f8", "Vee", "#8a4fd0", BG("#1a1a2e") +
  `<path d='M21,40 C18,56 20,68 27,73 L33,67 C28,60 28,48 30,40 Z' fill='#8a4fd0' stroke='#41246b' stroke-width='1.8'/>` +
  `<path d='M79,40 C81,48 80,54 77,57 L71,52 C73,48 73,44 72,40 Z' fill='#8a4fd0' stroke='#41246b' stroke-width='1.8'/>` +
  HEAD2("t2") +
  `<path d='M23.5,44 C20,4 78,3 76.5,40 L62,33 C50,27 31,32 23.5,44 Z' fill='#8a4fd0' stroke='#41246b' stroke-width='1.8'/>` +
  `<path d='M30,24 C40,17 54,16 64,22' fill='none' stroke='#a97ae0' stroke-width='1.2' opacity='0.8'/>` +
  BROWS(39, -1.2, 2.8) + EYES2("#7a4fd0") +
  `<path d='M30.5,47 L25.4,43.8 M69.5,47 L74.6,43.8' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>` +
  NOSE2 + LIPS("#6e3a5a"));
// Amira — dark side-swept waves over one shoulder, gold nose stud.
F("skin_face_f9", "Amira", "#c98a5e", BG("#f2f4f6") +
  `<path d='M76,38 C81,52 80,68 72,78 C74,68 73,58 70,50 L66,56 C68,64 67,72 63,78 C66,66 64,56 60,50 Z' fill='#2a1c10' stroke='#140c06' stroke-width='1.6'/>` +
  HEAD2("t3") +
  `<path d='M23.5,44 C20,4 80,4 76.5,42 C72,29 62,26 52,27 L56,34 C44,30 30,33 23.5,44 Z' fill='#2a1c10' stroke='#140c06' stroke-width='1.8'/>` +
  `<path d='M32,24 C40,18 52,17 62,21' fill='none' stroke='#4a3424' stroke-width='1.2' opacity='0.8'/>` +
  BROWS(39.6, 0.8, 3) + EYES2("#8a6a2a") + LINER +
  `<circle cx='46.6' cy='58.6' r='1.2' fill='#e8c24a' stroke='#8a5a10' stroke-width='0.7'/>` +
  NOSE2 + LIPS("#b06a5a"));
// Pixie — pink pixie cut with a front flick, wink + face gem.
F("skin_face_f10", "Pixie", "#4ad2a0", BG("#4ad2a0") + HEAD2("t1") +
  `<path d='M23.5,42 C21,6 68,2 76,32 C77.5,38 75,43 73,43 C71,33 64,29 58,30 L63,22 C52,23 44,26 40,30 C31,33 26,37 23.5,42 Z' fill='#ff6ab0' stroke='#a02a60' stroke-width='1.8' stroke-linejoin='round'/>` +
  `<path d='M31,23 C37,18 46,15.6 52,16' fill='none' stroke='#ff9ec8' stroke-width='1.2' opacity='0.85'/>` +
  BROWS(40, 1, 2.6) + EYE2(38, 48, "#3f7a4a") +
  `<path d='M54.5,48 Q62,44 69.5,48' fill='none' stroke='#241710' stroke-width='2.6' stroke-linecap='round'/>` +
  `<path d='M30,57.6 l1,2.2 2.2,1 -2.2,1 -1,2.2 -1,-2.2 -2.2,-1 2.2,-1 Z' fill='#ff8ac2'/>` +
  BLUSH2 + NOSE2 +
  `<path d='M41,68 Q50,74.6 59,67.4' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>` +
  `<path d='M52,71.2 Q55,75.4 58.4,73.6 Q56,71.4 54.6,69.8 Z' fill='#e88a9a' stroke='#b85a6a' stroke-width='1.2'/>`);

// --- 5 monkeys ---------------------------------------------------------------
const MONKEY_BASE = (extra, bg) => BG(bg) +
  `<circle cx='20' cy='44' r='9' fill='#9a6a42' stroke='#241710' stroke-width='2'/><circle cx='80' cy='44' r='9' fill='#9a6a42' stroke='#241710' stroke-width='2'/>` +
  `<circle cx='20' cy='44' r='4' fill='#e8c9a0'/><circle cx='80' cy='44' r='4' fill='#e8c9a0'/>` +
  `<circle cx='50' cy='50' r='30' fill='#9a6a42' stroke='#241710' stroke-width='2.4'/>` +
  `<path d='M28,44 C30,30 70,30 72,44 C64,36 36,36 28,44 Z' fill='#7a4f2e'/>` +
  `<ellipse cx='50' cy='62' rx='17' ry='13' fill='#e8c9a0'/>` +
  `<circle cx='46' cy='60' r='1.6' fill='#241710'/><circle cx='54' cy='60' r='1.6' fill='#241710'/>` + extra;
const MK = (id, name, cost, rarity, body) => ART.push({ id, name, cost, rarity, color: "#9a6a42", svg: SVG(body) });
MK("skin_monkey_cheeky", "Cheeky Chimp", 600, 0.15, MONKEY_BASE(
  EYES(48, 9, 3) + `<path d='M42,66 Q50,73 58,66' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>` +
  `<ellipse cx='50' cy='70' rx='4' ry='2.6' fill='#d2645a'/>`, "#2f8a4a"));
MK("skin_monkey_banana", "Banana Bandit", 600, 0.15, MONKEY_BASE(
  EYES(48, 9, 3) + `<path d='M40,68 Q50,74 60,68' fill='none' stroke='#241710' stroke-width='2.2' stroke-linecap='round'/>` +
  `<path d='M62,74 C74,70 82,76 80,84 C72,82 66,80 62,78 Z' fill='#f2c230' stroke='#8a6a10' stroke-width='1.8'/>`, "#f2c230"));
MK("skin_monkey_seeno", "See-No Munki", 700, 0.12, MONKEY_BASE(
  `<circle cx='38' cy='49' r='8.4' fill='#9a6a42' stroke='#241710' stroke-width='2'/><circle cx='62' cy='49' r='8.4' fill='#9a6a42' stroke='#241710' stroke-width='2'/>` +
  `<path d='M33,49 L43,49 M57,49 L67,49' stroke='#7a4f2e' stroke-width='1.6'/>` +
  `<path d='M45,67 Q50,70 55,67' fill='none' stroke='#241710' stroke-width='2.2' stroke-linecap='round'/>`, "#5a3a9a"));
MK("skin_monkey_king", "Monkey King", 900, 0.1, MONKEY_BASE(
  EYES(48, 9, 3) + `<path d='M42,66 Q50,71 58,66' fill='none' stroke='#241710' stroke-width='2.2' stroke-linecap='round'/>` +
  `<path d='M34,22 L40,12 L46,20 L50,10 L54,20 L60,12 L66,22 C56,18 44,18 34,22 Z' fill='#f2c230' stroke='#8a6a10' stroke-width='1.8'/>` +
  `<circle cx='50' cy='14' r='1.8' fill='#d2453a'/>`, "#c43a3a"));
MK("skin_monkey_space", "Space Chimp", 1000, 0.08, BG("#1a1a2e") +
  `<circle cx='50' cy='50' r='40' fill='#dfe6ee' stroke='#8a96a4' stroke-width='3'/>` +
  `<circle cx='50' cy='50' r='32' fill='#bcd2e8' opacity='0.5'/>` +
  `<circle cx='25' cy='47' r='9' fill='#9a6a42' stroke='#241710' stroke-width='2.2'/><circle cx='25' cy='47' r='4.4' fill='#e8c9a0'/>` +
  `<circle cx='75' cy='47' r='9' fill='#9a6a42' stroke='#241710' stroke-width='2.2'/><circle cx='75' cy='47' r='4.4' fill='#e8c9a0'/>` +
  `<circle cx='50' cy='52' r='26' fill='#9a6a42' stroke='#241710' stroke-width='2.2'/>` +
  `<ellipse cx='50' cy='61' rx='14' ry='10' fill='#e8c9a0'/>` +
  EYES(50, 8, 2.8) + `<circle cx='45' cy='59.5' r='1.4' fill='#241710'/><circle cx='55' cy='59.5' r='1.4' fill='#241710'/>` +
  `<path d='M44,65 Q50,69 56,65' fill='none' stroke='#241710' stroke-width='2' stroke-linecap='round'/>` +
  `<path d='M26,32 Q34,22 46,20' fill='none' stroke='#ffffff' stroke-width='3' stroke-linecap='round' opacity='0.7'/>`);

// --- 10 cartoon animal faces (epic first, cute second) --------------------------
const AN = (id, name, color, body) => ART.push({ id, name, cost: 500, rarity: 0.18, color, svg: SVG(body) });
// Foxy — a real fox: pointed dark-tipped ears, angular head, white cheek ruffs, slanted amber eyes.
AN("skin_animal_fox", "Foxy", "#e8762a", BG("#26324e") +
  `<path d='M24,36 L15,7 L46,22 Z' fill='#e8762a' stroke='#7a3a0e' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M76,36 L85,7 L54,22 Z' fill='#e8762a' stroke='#7a3a0e' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M27,30 L22,14 L38,21 Z' fill='#5a2a0c'/><path d='M73,30 L78,14 L62,21 Z' fill='#5a2a0c'/>` +
  `<path d='M15,7 L23,9.6 L18.6,16 Z' fill='#2a1408'/><path d='M85,7 L77,9.6 L81.4,16 Z' fill='#2a1408'/>` +
  `<path d='M26,46 L13,50 L24,54 L12,60 L25,60 L18,68 L30,64 Z' fill='#f6f0e6' stroke='#b8a890' stroke-width='1.3' stroke-linejoin='round'/>` +
  `<path d='M74,46 L87,50 L76,54 L88,60 L75,60 L82,68 L70,64 Z' fill='#f6f0e6' stroke='#b8a890' stroke-width='1.3' stroke-linejoin='round'/>` +
  `<path d='M50,24 C62,24 72,31 74,42 C76,54 66,64 58,70 L50,78 L42,70 C34,64 24,54 26,42 C28,31 38,24 50,24 Z' fill='#e8762a' stroke='#7a3a0e' stroke-width='2.4' stroke-linejoin='round'/>` +
  `<path d='M62,28 C70,34 72,44 69,54 C74,46 73,34 62,28 Z' fill='#b85614' opacity='0.6'/>` +
  `<path d='M50,52 C57,52 61,56.6 60,62 C58,68.6 54,72.6 50,74.6 C46,72.6 42,68.6 40,62 C39,56.6 43,52 50,52 Z' fill='#f6f0e6'/>` +
  `<path d='M29,37 L45,41.6 M71,37 L55,41.6' stroke='#3a1c06' stroke-width='3' stroke-linecap='round'/>` +
  `<path d='M30,43 Q38,39.6 45,45 Q38,48.4 30,43 Z' fill='#fff' stroke='#3a1c06' stroke-width='1.6'/>` +
  `<path d='M70,43 Q62,39.6 55,45 Q62,48.4 70,43 Z' fill='#fff' stroke='#3a1c06' stroke-width='1.6'/>` +
  `<circle cx='38.6' cy='43.6' r='2.9' fill='#e8a13a'/><ellipse cx='38.6' cy='43.6' rx='1.1' ry='2.1' fill='#241710'/><circle cx='39.6' cy='42.4' r='0.7' fill='#fff'/>` +
  `<circle cx='61.4' cy='43.6' r='2.9' fill='#e8a13a'/><ellipse cx='61.4' cy='43.6' rx='1.1' ry='2.1' fill='#241710'/><circle cx='62.4' cy='42.4' r='0.7' fill='#fff'/>` +
  `<path d='M46.6,62 L53.4,62 L50,66.4 Z' fill='#241710'/>` +
  `<path d='M43,68.6 Q50,72.4 57,68' fill='none' stroke='#3a1c06' stroke-width='2' stroke-linecap='round'/>` +
  `<path d='M45.2,69.6 L46.8,73 L48.6,70 Z' fill='#fff' stroke='#b8a890' stroke-width='0.7'/>`);
// Bamboo — cute, polished: glossy patch eyes + a bamboo sprig.
AN("skin_animal_panda", "Bamboo", "#7a8a9a", BG("#f2c230") +
  `<circle cx='24' cy='26' r='10' fill='#23262e'/><circle cx='76' cy='26' r='10' fill='#23262e'/>` +
  `<circle cx='22.6' cy='24.4' r='3.4' fill='#3a3f4a'/><circle cx='74.6' cy='24.4' r='3.4' fill='#3a3f4a'/>` +
  `<circle cx='50' cy='52' r='31' fill='#f7f9fa' stroke='#23262e' stroke-width='2.4'/>` +
  `<path d='M65,26 C74,33 76,46 73,57 C79,45 77,31 65,26 Z' fill='#d8dde2' opacity='0.8'/>` +
  `<path d='M50,21.6 L53.6,12.6' stroke='#2f8a4a' stroke-width='2.2' stroke-linecap='round'/>` +
  `<ellipse cx='56.6' cy='10.8' rx='4.8' ry='2.5' fill='#3fae5a' stroke='#1a5a2c' stroke-width='1.1' transform='rotate(-22 56.6 10.8)'/>` +
  `<ellipse cx='36.5' cy='48' rx='8.6' ry='11' fill='#23262e' transform='rotate(-18 36.5 48)'/>` +
  `<ellipse cx='63.5' cy='48' rx='8.6' ry='11' fill='#23262e' transform='rotate(18 63.5 48)'/>` +
  `<circle cx='37.5' cy='47.5' r='3.7' fill='#fff'/><circle cx='62.5' cy='47.5' r='3.7' fill='#fff'/>` +
  `<circle cx='38' cy='48' r='2.1' fill='#241710'/><circle cx='62' cy='48' r='2.1' fill='#241710'/>` +
  `<circle cx='38.8' cy='47' r='0.8' fill='#fff'/><circle cx='62.8' cy='47' r='0.8' fill='#fff'/>` +
  `<ellipse cx='50' cy='60.5' rx='4.6' ry='3.4' fill='#23262e'/>` +
  `<path d='M50,63.6 L50,67' stroke='#23262e' stroke-width='1.6' stroke-linecap='round'/>` +
  `<path d='M44,67 Q50,71.6 56,67' fill='none' stroke='#23262e' stroke-width='2.2' stroke-linecap='round'/>` +
  `<ellipse cx='30' cy='59' rx='4.4' ry='2.8' fill='#f2a48a' opacity='0.6'/><ellipse cx='70' cy='59' rx='4.4' ry='2.8' fill='#f2a48a' opacity='0.6'/>` +
  `<path d='M71.7,42 L63.4,35 L69.6,33.6 Z' fill='#3fae5a' stroke='#1a5a2c' stroke-width='1.1' stroke-linejoin='round'/>` +
  `<path d='M71.7,42 L80,34.6 L74.2,33.4 Z' fill='#3fae5a' stroke='#1a5a2c' stroke-width='1.1' stroke-linejoin='round'/>` +
  `<rect x='69.4' y='42' width='4.6' height='44' rx='2.2' fill='#3fae5a' stroke='#1a5a2c' stroke-width='1.4'/>` +
  `<path d='M69.4,54 L74,54 M69.4,66 L74,66 M69.4,78 L74,78' stroke='#1a5a2c' stroke-width='1.1'/>` +
  `<circle cx='71.7' cy='60' r='6' fill='#23262e'/>` +
  `<circle cx='69' cy='56.6' r='1.1' fill='#3a3f4a'/><circle cx='74.4' cy='56.6' r='1.1' fill='#3a3f4a'/>`);
// Whiskers — ginger tabby: symmetric brows + cheek stripes, green slit eyes, smug.
AN("skin_animal_cat", "Whiskers", "#e8923a", BG("#5a5ae0") +
  // tail curling up from behind
  `<path d='M60,80 C75,84 86,73 83,59 C82,70 73,79 60,76 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='2' stroke-linejoin='round'/>` +
  `<path d='M80.4,65 L85,64 M78,70.6 L82.8,70.8' stroke='#b85f14' stroke-width='1.8' stroke-linecap='round'/>` +
  // big triangular ears, wide-set, deep pink inners
  `<path d='M24,44 L21,10 L49,31 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M76,44 L79,10 L51,31 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M27.6,35 L25.4,15.4 L42,27.4 Z' fill='#f2a4b8'/><path d='M72.4,35 L74.6,15.4 L58,27.4 Z' fill='#f2a4b8'/>` +
  // cheek fluff (clean single tufts, behind the head so only the tips show)
  `<path d='M21.5,56.5 L13.5,59.5 L22,62.5 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='1.6' stroke-linejoin='round'/>` +
  `<path d='M78.5,56.5 L86.5,59.5 L78,62.5 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='1.6' stroke-linejoin='round'/>` +
  // head: wider than tall — the cat skull shape
  `<ellipse cx='50' cy='56' rx='31' ry='26' fill='#e8923a' stroke='#8a4a10' stroke-width='2.4'/>` +
  `<path d='M68,36 C74,41 76,49 73,57 C77,48 76,40 68,36 Z' fill='#c46a1e' opacity='0.35'/>` +
  // tabby M on the forehead + cheek stripes
  `<path d='M43,31 L44.4,39 M50,29.6 L50,38 M57,31 L55.6,39' stroke='#b85f14' stroke-width='2.6' stroke-linecap='round'/>` +
  `<path d='M23,49 L32,51 M23,56 L32,56 M77,49 L68,51 M77,56 L68,56' stroke='#b85f14' stroke-width='2' stroke-linecap='round'/>` +
  // BIG almond eyes with green iris + vertical slit pupils
  `<path d='M29,49 Q37.5,43 46,49 Q37.5,54.4 29,49 Z' fill='#fff' stroke='#241710' stroke-width='1.7'/>` +
  `<path d='M71,49 Q62.5,43 54,49 Q62.5,54.4 71,49 Z' fill='#fff' stroke='#241710' stroke-width='1.7'/>` +
  `<circle cx='37.5' cy='48.8' r='4' fill='#8ac43a'/><ellipse cx='37.5' cy='48.8' rx='1.4' ry='3.2' fill='#241710'/><circle cx='39' cy='47.2' r='1' fill='#fff'/>` +
  `<circle cx='62.5' cy='48.8' r='4' fill='#8ac43a'/><ellipse cx='62.5' cy='48.8' rx='1.4' ry='3.2' fill='#241710'/><circle cx='64' cy='47.2' r='1' fill='#fff'/>` +
  // muzzle: two pads + chin, pink nose, philtrum line, w-mouth, whisker dots
  `<circle cx='44.6' cy='63.8' r='7.6' fill='#f6f0e6'/><circle cx='55.4' cy='63.8' r='7.6' fill='#f6f0e6'/><circle cx='50' cy='69.4' r='5.6' fill='#f6f0e6'/>` +
  `<circle cx='42.4' cy='62' r='0.65' fill='#8a4a10'/><circle cx='45' cy='64.8' r='0.65' fill='#8a4a10'/><circle cx='57.6' cy='62' r='0.65' fill='#8a4a10'/><circle cx='55' cy='64.8' r='0.65' fill='#8a4a10'/>` +
  `<path d='M46.8,58.4 L53.2,58.4 L50,62.2 Z' fill='#d2647a' stroke='#a84a62' stroke-width='0.8' stroke-linejoin='round'/>` +
  `<path d='M50,62.2 L50,65.2' stroke='#241710' stroke-width='1.7'/>` +
  `<path d='M50,65.2 Q46.4,69 43,67 M50,65.2 Q53.6,69 57,67' fill='none' stroke='#241710' stroke-width='1.9' stroke-linecap='round'/>` +
  // long curved whiskers, three per side
  `<path d='M16,54 C24,55.4 30,56.4 36,57.6 M17,61 C25,61.4 31,61.4 37,61 M20,68 C27,67 32,65.6 38,64.4' fill='none' stroke='#241710' stroke-width='1.7' stroke-linecap='round'/>` +
  `<path d='M84,54 C76,55.4 70,56.4 64,57.6 M83,61 C75,61.4 69,61.4 63,61 M80,68 C73,67 68,65.6 62,64.4' fill='none' stroke='#241710' stroke-width='1.7' stroke-linecap='round'/>`);
// Pupper — heroic shiba: pointed ears, cream mask, determined brows, tongue-out grin.
AN("skin_animal_dog", "Pupper", "#d2944a", BG("#2a9a8a") +
  // left ear perked, right ear flopped over — instant puppy
  `<path d='M34,25 C24,20 15,28 16,40 C17,51 23,59 30,58 C34,57.4 36,52 35,45 C34,36 36,29 34,25 Z' fill='#d2944a' stroke='#7a4a14' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M20,33 C17.8,39 18.2,46 21,52' fill='none' stroke='#7a4a14' stroke-width='1.3' opacity='0.6'/>` +
  `<path d='M66,25 C76,20 85,28 84,40 C83,51 77,59 70,58 C66,57.4 64,52 65,45 C66,36 64,29 66,25 Z' fill='#d2944a' stroke='#7a4a14' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M80,33 C82.2,39 81.8,46 79,52' fill='none' stroke='#7a4a14' stroke-width='1.3' opacity='0.6'/>` +
  `<circle cx='50' cy='54' r='30' fill='#d2944a' stroke='#7a4a14' stroke-width='2.4'/>` +
  `<path d='M63,30 C71,37 73,47 70,57 C75,47 74,36 63,30 Z' fill='#b87a30' opacity='0.6'/>` +
  // shiba mask: rounded cheek lobes blended into the muzzle
  `<circle cx='33' cy='61' r='10.5' fill='#f2d2a0'/><circle cx='67' cy='61' r='10.5' fill='#f2d2a0'/>` +
  `<path d='M50,42 C60,42 66,49 65,58 C64,68 58,75 50,75 C42,75 36,68 35,58 C34,49 40,42 50,42 Z' fill='#f2d2a0'/>` +
  `<rect x='32' y='58' width='36' height='12' fill='#f2d2a0'/>` +
  `<circle cx='35.5' cy='37.4' r='2.4' fill='#f2d2a0'/><circle cx='64.5' cy='37.4' r='2.4' fill='#f2d2a0'/>` +
  // soft raised brows + big round glossy puppy eyes
  `<path d='M33,41.4 Q37.5,38.8 42,41.4 M58,41.4 Q62.5,38.8 67,41.4' fill='none' stroke='#3a2412' stroke-width='2.2' stroke-linecap='round'/>` +
  `<circle cx='38' cy='48.4' r='6' fill='#fff' stroke='#3a2412' stroke-width='1.6'/>` +
  `<circle cx='62' cy='48.4' r='6' fill='#fff' stroke='#3a2412' stroke-width='1.6'/>` +
  `<circle cx='38.4' cy='49' r='4.3' fill='#6e4428'/><circle cx='61.6' cy='49' r='4.3' fill='#6e4428'/>` +
  `<circle cx='38.4' cy='49.2' r='2.3' fill='#241710'/><circle cx='61.6' cy='49.2' r='2.3' fill='#241710'/>` +
  `<circle cx='36.6' cy='47' r='1.6' fill='#fff'/><circle cx='59.8' cy='47' r='1.6' fill='#fff'/>` +
  `<circle cx='40.6' cy='51.4' r='0.8' fill='#fff' opacity='0.9'/><circle cx='63.8' cy='51.4' r='0.8' fill='#fff' opacity='0.9'/>` +
  // round shiny nose + open happy mouth with a proper tongue
  `<ellipse cx='50' cy='59' rx='4.2' ry='3.2' fill='#241710'/><ellipse cx='48.6' cy='58' rx='1.3' ry='0.9' fill='#4a4f5a'/>` +
  `<path d='M50,62 L50,64.4' stroke='#241710' stroke-width='1.8' stroke-linecap='round'/>` +
  `<path d='M41,64.4 Q50,72 59,64.4' fill='none' stroke='#241710' stroke-width='2.4' stroke-linecap='round'/>` +
  `<path d='M45.6,68.8 C46.6,74 53.4,74 54.4,68.8 C52.8,70.4 47.2,70.4 45.6,68.8 Z' fill='#e87a8a' stroke='#b84a5a' stroke-width='1.1'/>` +
  `<path d='M50,70 L50,72.6' stroke='#b84a5a' stroke-width='0.9'/>` +
  // blush
  `<ellipse cx='27.5' cy='54' rx='4' ry='2.6' fill='#f2a48a' opacity='0.6'/><ellipse cx='72.5' cy='54' rx='4' ry='2.6' fill='#f2a48a' opacity='0.6'/>`);
// Eucalypt — cute koala: fluffy ears, big glossy nose, leaf snack.
AN("skin_animal_koala", "Eucalypt", "#8a96a4", BG("#f06a9a") +
  `<circle cx='19' cy='36' r='13' fill='#8a96a4' stroke='#4a545e' stroke-width='2.2'/>` +
  `<circle cx='81' cy='36' r='13' fill='#8a96a4' stroke='#4a545e' stroke-width='2.2'/>` +
  `<circle cx='19' cy='36' r='6' fill='#e0a8b8'/><circle cx='81' cy='36' r='6' fill='#e0a8b8'/>` +
  `<path d='M9,30 L13,27 M8,38 L13,37 M10,45 L14,42 M91,30 L87,27 M92,38 L87,37 M90,45 L86,42' stroke='#aeb6c0' stroke-width='2' stroke-linecap='round'/>` +
  `<circle cx='50' cy='54' r='29' fill='#aeb6c0' stroke='#4a545e' stroke-width='2.4'/>` +
  `<circle cx='39' cy='49' r='3.4' fill='#241710'/><circle cx='61' cy='49' r='3.4' fill='#241710'/>` +
  `<circle cx='40' cy='47.8' r='1.1' fill='#fff'/><circle cx='62' cy='47.8' r='1.1' fill='#fff'/>` +
  `<ellipse cx='50' cy='59' rx='5.6' ry='7.6' fill='#23262e'/><ellipse cx='48.4' cy='56.4' rx='1.6' ry='2.4' fill='#4a4f5a'/>` +
  `<path d='M45,70 Q50,73 55,70' fill='none' stroke='#23262e' stroke-width='2' stroke-linecap='round'/>` +
  `<ellipse cx='31' cy='61' rx='4.2' ry='2.8' fill='#f2a48a' opacity='0.6'/><ellipse cx='69' cy='61' rx='4.2' ry='2.8' fill='#f2a48a' opacity='0.6'/>` +
  `<path d='M55,71 L64,76' stroke='#2f8a4a' stroke-width='2.2' stroke-linecap='round'/>` +
  `<ellipse cx='67' cy='77.6' rx='5' ry='2.6' fill='#3fae5a' stroke='#1a5a2c' stroke-width='1.1' transform='rotate(28 67 77.6)'/>`);
// Roary — ROARING lion: two-tone spiked mane, fierce eyes, wide open jaw with fangs.
AN("skin_animal_lion", "Roary", "#e8a84a", BG("#8a2418") +
  `<path d='M50,8 L56,19 L66,11 L67,24 L80,20 L75,33 L88,35 L78,44 L88,54 L76,56 L82,69 L69,66 L69,80 L58,73 L50,84 L42,73 L31,80 L31,66 L18,69 L24,56 L12,54 L22,44 L12,35 L25,33 L20,20 L33,24 L34,11 L44,19 Z' fill='#7a3a0e' stroke='#4a2006' stroke-width='2' stroke-linejoin='round'/>` +
  `<circle cx='50' cy='50' r='31' fill='#9a5a1e'/>` +
  `<circle cx='50' cy='50' r='24' fill='#e8a84a' stroke='#7a3a0e' stroke-width='2.2'/>` +
  `<path d='M33,39 L45,44 M67,39 L55,44' stroke='#3a1c06' stroke-width='3.2' stroke-linecap='round'/>` +
  `<path d='M33,46 Q39,42.6 45,46.6 Q39,49.6 33,46 Z' fill='#fff' stroke='#3a1c06' stroke-width='1.5'/>` +
  `<path d='M67,46 Q61,42.6 55,46.6 Q61,49.6 67,46 Z' fill='#fff' stroke='#3a1c06' stroke-width='1.5'/>` +
  `<circle cx='39' cy='46.2' r='2.3' fill='#c87a1e'/><circle cx='39' cy='46.2' r='1.1' fill='#241710'/><circle cx='39.8' cy='45.4' r='0.6' fill='#fff'/>` +
  `<circle cx='61' cy='46.2' r='2.3' fill='#c87a1e'/><circle cx='61' cy='46.2' r='1.1' fill='#241710'/><circle cx='61.8' cy='45.4' r='0.6' fill='#fff'/>` +
  `<path d='M43,51 Q50,48.6 57,51' fill='none' stroke='#7a3a0e' stroke-width='1.6' opacity='0.7'/>` +
  `<path d='M45.5,54 L54.5,54 L50,58.6 Z' fill='#5a2a0c'/>` +
  `<path d='M39,61 C39,57 61,57 61,61 C62,72 55,79.6 50,79.6 C45,79.6 38,72 39,61 Z' fill='#5a1410' stroke='#3a0c08' stroke-width='2'/>` +
  `<path d='M42,59.4 L44.4,65.6 L47,59.6 Z' fill='#fff8ec' stroke='#c8b89a' stroke-width='0.8'/>` +
  `<path d='M53,59.6 L55.6,65.6 L58,59.4 Z' fill='#fff8ec' stroke='#c8b89a' stroke-width='0.8'/>` +
  `<path d='M44.6,77 L46,73 L47.6,76.6 Z' fill='#fff8ec'/><path d='M52.4,76.6 L54,73 L55.4,77 Z' fill='#fff8ec'/>` +
  `<path d='M44,71.6 C46,67 54,67 56,71.6 C54,75.6 46,75.6 44,71.6 Z' fill='#c2554a'/>`);
// Ribbit — determined frog: hooded eyes, set mouth, ready to fight for the pond.
AN("skin_animal_frog", "Ribbit", "#3fae5a", BG("#f2c230") +
  `<circle cx='31' cy='27' r='13' fill='#3fae5a' stroke='#1a5a2c' stroke-width='2.2'/>` +
  `<circle cx='69' cy='27' r='13' fill='#3fae5a' stroke='#1a5a2c' stroke-width='2.2'/>` +
  `<circle cx='31' cy='28' r='6.6' fill='#fff'/><circle cx='69' cy='28' r='6.6' fill='#fff'/>` +
  `<circle cx='32' cy='29' r='3.2' fill='#241710'/><circle cx='68' cy='29' r='3.2' fill='#241710'/>` +
  `<circle cx='33' cy='27.6' r='1' fill='#fff'/><circle cx='69' cy='27.6' r='1' fill='#fff'/>` +
  `<path d='M21,17.2 L40,22.2 M79,17.2 L60,22.2' stroke='#1a5a2c' stroke-width='3.4' stroke-linecap='round'/>` +
  `<ellipse cx='50' cy='58' rx='33' ry='26' fill='#3fae5a' stroke='#1a5a2c' stroke-width='2.4'/>` +
  `<path d='M58,38 C66,40 71,46 72,52 C68,46 62,42 56,41 Z' fill='#2f8a4a' opacity='0.7'/>` +
  `<circle cx='43' cy='48' r='1.6' fill='#1a5a2c'/><circle cx='57' cy='48' r='1.6' fill='#1a5a2c'/>` +
  `<path d='M30,60 Q50,70 70,60' fill='none' stroke='#1a5a2c' stroke-width='2.8' stroke-linecap='round'/>` +
  `<path d='M30,60 Q33,58 35,60 M70,60 Q67,58 65,60' fill='none' stroke='#1a5a2c' stroke-width='2' stroke-linecap='round'/>` +
  `<path d='M36,72 Q50,78 64,72' fill='none' stroke='#7ec88a' stroke-width='2.4' stroke-linecap='round' opacity='0.8'/>`);
// Hoots — great horned owl: sharp ear tufts, blazing radial eyes, V brows, chest chevrons.
AN("skin_animal_owl", "Hoots", "#9a7a52", BG("#2e3f63") +
  `<path d='M28,30 L21,7 L43,21 Z' fill='#7a5a3a' stroke='#3e2c18' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M72,30 L79,7 L57,21 Z' fill='#7a5a3a' stroke='#3e2c18' stroke-width='2.2' stroke-linejoin='round'/>` +
  `<path d='M30,26 L26,13 L38,20 Z' fill='#54391e'/><path d='M70,26 L74,13 L62,20 Z' fill='#54391e'/>` +
  `<circle cx='50' cy='52' r='30' fill='#9a7a52' stroke='#3e2c18' stroke-width='2.4'/>` +
  `<circle cx='37' cy='48' r='12' fill='#e8d8b8' stroke='#3e2c18' stroke-width='2'/>` +
  `<circle cx='63' cy='48' r='12' fill='#e8d8b8' stroke='#3e2c18' stroke-width='2'/>` +
  `<path d='M25,36 L44,41 M75,36 L56,41' stroke='#3e2c18' stroke-width='3.4' stroke-linecap='round'/>` +
  `<circle cx='37' cy='49' r='6.2' fill='#f2b63c'/><circle cx='63' cy='49' r='6.2' fill='#f2b63c'/>` +
  `<path d='M33,45 L35,47 M41,45 L39,47 M33,53 L35,51 M41,53 L39,51 M59,45 L61,47 M67,45 L65,47 M59,53 L61,51 M67,53 L65,51' stroke='#c8861e' stroke-width='1.1'/>` +
  `<circle cx='37' cy='49' r='2.9' fill='#241710'/><circle cx='63' cy='49' r='2.9' fill='#241710'/>` +
  `<circle cx='38.2' cy='47.6' r='1' fill='#fff'/><circle cx='64.2' cy='47.6' r='1' fill='#fff'/>` +
  `<path d='M46,57 L54,57 L50,66 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='1.4' stroke-linejoin='round'/>` +
  `<path d='M38,72 L42,68 L46,72 M54,72 L58,68 L62,72 M46,77 L50,73 L54,77' fill='none' stroke='#6e5436' stroke-width='1.7'/>`);
// Waddles — plucky penguin: determined brows + a little red scarf.
AN("skin_animal_penguin", "Waddles", "#2b3440", BG("#4ad0ff") +
  `<circle cx='50' cy='50' r='36' fill='#2b3440' stroke='#10151c' stroke-width='2.4'/>` +
  `<ellipse cx='50' cy='58' rx='22' ry='24' fill='#f4f6f8'/>` +
  `<path d='M32,38 L44,41.4 M68,38 L56,41.4' stroke='#10151c' stroke-width='2.8' stroke-linecap='round'/>` +
  `<circle cx='40' cy='45' r='5.6' fill='#fff' stroke='#10151c' stroke-width='1.4'/>` +
  `<circle cx='60' cy='45' r='5.6' fill='#fff' stroke='#10151c' stroke-width='1.4'/>` +
  `<circle cx='41' cy='46' r='2.9' fill='#241710'/><circle cx='61' cy='46' r='2.9' fill='#241710'/>` +
  `<circle cx='42' cy='44.8' r='0.9' fill='#fff'/><circle cx='62' cy='44.8' r='0.9' fill='#fff'/>` +
  `<path d='M44,54 L56,54 L50,61 Z' fill='#e8923a' stroke='#8a4a10' stroke-width='1.6' stroke-linejoin='round'/>` +
  `<path d='M36,64 C42,68 58,68 64,64 L64,69 C58,73 42,73 36,69 Z' fill='#d2453a' stroke='#7a1e1e' stroke-width='1.6'/>` +
  `<path d='M58,69.4 L61,78 L53.6,72.6 Z' fill='#d2453a' stroke='#7a1e1e' stroke-width='1.4' stroke-linejoin='round'/>` +
  `<ellipse cx='33' cy='53' rx='3.6' ry='2.4' fill='#f2a48a' opacity='0.55'/><ellipse cx='67' cy='53' rx='3.6' ry='2.4' fill='#f2a48a' opacity='0.55'/>`);
// Honey — grizzly snarl: claw-slash backdrop, low brows, bared bottom fangs.
AN("skin_animal_bear", "Honey", "#8a5a3a", BG("#2e3f63") +
  `<path d='M14,18 L24,46 M21,15 L31,43 M28,13 L38,41' stroke='#243352' stroke-width='3.4' stroke-linecap='round'/>` +
  `<circle cx='25' cy='29' r='10' fill='#6e4428' stroke='#3a200c' stroke-width='2.2'/><circle cx='75' cy='29' r='10' fill='#6e4428' stroke='#3a200c' stroke-width='2.2'/>` +
  `<circle cx='25' cy='29' r='4.4' fill='#c99a6e'/><circle cx='75' cy='29' r='4.4' fill='#c99a6e'/>` +
  `<circle cx='50' cy='53' r='31' fill='#8a5a3a' stroke='#3a200c' stroke-width='2.4'/>` +
  `<path d='M64,28 C72,34 74,46 71,56 C76,46 75,33 64,28 Z' fill='#6e4428' opacity='0.7'/>` +
  `<path d='M31,41 L45,45.4 M69,41 L55,45.4' stroke='#241008' stroke-width='3.2' stroke-linecap='round'/>` +
  `<circle cx='38' cy='49' r='2.8' fill='#241710'/><circle cx='62' cy='49' r='2.8' fill='#241710'/>` +
  `<circle cx='39' cy='47.8' r='0.9' fill='#fff'/><circle cx='63' cy='47.8' r='0.9' fill='#fff'/>` +
  `<ellipse cx='50' cy='66' rx='16' ry='12' fill='#c99a6e'/>` +
  `<path d='M44,58 Q50,55.6 56,58' fill='none' stroke='#3a200c' stroke-width='1.6' opacity='0.6'/>` +
  `<path d='M45,61 L55,61 L50,66 Z' fill='#241710'/>` +
  `<path d='M42,70.6 C46,67.6 54,67.6 58,70.6 C56,75.4 44,75.4 42,70.6 Z' fill='#4a1410' stroke='#2a0a06' stroke-width='1.6'/>` +
  `<path d='M44.6,72.8 L46,69.4 L47.6,72.4 Z' fill='#fff8ec'/><path d='M52.4,72.4 L54,69.4 L55.4,72.8 Z' fill='#fff8ec'/>`);

// ---------------------------------------------------------------------------
// Country flags — flagcdn.com (public-domain art, free commercial use).
// [iso2, name, territory tint (mid-tone, flag-dominant-ish)]
// ---------------------------------------------------------------------------
const R = "#d2453a", B = "#2f5fc4", G = "#2f8a4a", Y = "#e8c24a", O = "#e8923a", T = "#2a9a8a", S = "#7a8a9a";
const FLAGS = [
  // Africa
  ["dz","Algeria",G],["ao","Angola",R],["bj","Benin",G],["bw","Botswana",B],["bf","Burkina Faso",R],
  ["bi","Burundi",R],["cv","Cabo Verde",B],["cm","Cameroon",G],["cf","Central African Republic",B],["td","Chad",B],
  ["km","Comoros",G],["cg","Congo",G],["cd","DR Congo",B],["ci","Ivory Coast",O],["dj","Djibouti",B],
  ["eg","Egypt",R],["gq","Equatorial Guinea",G],["er","Eritrea",R],["sz","Eswatini",B],["et","Ethiopia",G],
  ["ga","Gabon",G],["gm","Gambia",R],["gh","Ghana",R],["gn","Guinea",R],["gw","Guinea-Bissau",Y],
  ["ke","Kenya",R],["ls","Lesotho",B],["lr","Liberia",R],["ly","Libya",G],["mg","Madagascar",R],
  ["mw","Malawi",R],["ml","Mali",G],["mr","Mauritania",G],["mu","Mauritius",R],["ma","Morocco",R],
  ["mz","Mozambique",G],["na","Namibia",B],["ne","Niger",O],["ng","Nigeria",G],["rw","Rwanda",B],
  ["st","Sao Tome and Principe",G],["sn","Senegal",G],["sc","Seychelles",B],["sl","Sierra Leone",G],["so","Somalia",B],
  ["za","South Africa",G],["ss","South Sudan",R],["sd","Sudan",R],["tz","Tanzania",G],["tg","Togo",G],
  ["tn","Tunisia",R],["ug","Uganda",Y],["zm","Zambia",G],["zw","Zimbabwe",G],
  // Americas
  ["ag","Antigua and Barbuda",R],["ar","Argentina",B],["bs","Bahamas",T],["bb","Barbados",B],["bz","Belize",B],
  ["bo","Bolivia",R],["br","Brazil",G],["ca","Canada",R],["cl","Chile",R],["co","Colombia",Y],
  ["cr","Costa Rica",R],["cu","Cuba",B],["dm","Dominica",G],["do","Dominican Republic",B],["ec","Ecuador",Y],
  ["sv","El Salvador",B],["gd","Grenada",R],["gt","Guatemala",B],["gy","Guyana",G],["ht","Haiti",B],
  ["hn","Honduras",B],["jm","Jamaica",G],["mx","Mexico",G],["ni","Nicaragua",B],["pa","Panama",R],
  ["py","Paraguay",R],["pe","Peru",R],["kn","Saint Kitts and Nevis",G],["lc","Saint Lucia",B],["vc","Saint Vincent",B],
  ["sr","Suriname",G],["tt","Trinidad and Tobago",R],["us","United States",B],["uy","Uruguay",B],["ve","Venezuela",Y],
  // Asia
  ["af","Afghanistan",G],["am","Armenia",R],["az","Azerbaijan",T],["bh","Bahrain",R],["bd","Bangladesh",G],
  ["bt","Bhutan",O],["bn","Brunei",Y],["kh","Cambodia",B],["cn","China",R],["cy","Cyprus",O],
  ["ge","Georgia",R],["in","India",O],["id","Indonesia",R],["ir","Iran",G],["iq","Iraq",R],
  ["il","Israel",B],["jp","Japan",R],["jo","Jordan",R],["kz","Kazakhstan",T],["kw","Kuwait",G],
  ["kg","Kyrgyzstan",R],["la","Laos",B],["lb","Lebanon",R],["my","Malaysia",B],["mv","Maldives",R],
  ["mn","Mongolia",R],["mm","Myanmar",Y],["np","Nepal",R],["kp","North Korea",B],["om","Oman",R],
  ["pk","Pakistan",G],["ph","Philippines",B],["qa","Qatar",R],["sa","Saudi Arabia",G],["sg","Singapore",R],
  ["kr","South Korea",B],["lk","Sri Lanka",O],["sy","Syria",R],["tj","Tajikistan",G],["th","Thailand",B],
  ["tl","Timor-Leste",R],["tr","Turkey",R],["tm","Turkmenistan",G],["ae","United Arab Emirates",G],["uz","Uzbekistan",T],
  ["vn","Vietnam",R],["ye","Yemen",R],
  // Europe
  ["al","Albania",R],["ad","Andorra",B],["at","Austria",R],["by","Belarus",R],["be","Belgium",Y],
  ["ba","Bosnia and Herzegovina",B],["bg","Bulgaria",G],["hr","Croatia",R],["cz","Czechia",B],["dk","Denmark",R],
  ["ee","Estonia",B],["fi","Finland",B],["fr","France",B],["de","Germany",Y],["gr","Greece",B],
  ["hu","Hungary",G],["is","Iceland",B],["ie","Ireland",G],["it","Italy",G],["lv","Latvia",R],
  ["li","Liechtenstein",B],["lt","Lithuania",Y],["lu","Luxembourg",T],["mt","Malta",R],["md","Moldova",B],
  ["mc","Monaco",R],["me","Montenegro",R],["nl","Netherlands",O],["mk","North Macedonia",Y],["no","Norway",R],
  ["pl","Poland",R],["pt","Portugal",G],["ro","Romania",Y],["ru","Russia",B],["sm","San Marino",T],
  ["rs","Serbia",R],["sk","Slovakia",B],["si","Slovenia",B],["es","Spain",R],["se","Sweden",B],
  ["ch","Switzerland",R],["ua","Ukraine",Y],["gb","United Kingdom",B],
  // Oceania
  ["au","Australia",B],["fj","Fiji",T],["ki","Kiribati",R],["mh","Marshall Islands",B],["fm","Micronesia",T],
  ["nr","Nauru",B],["nz","New Zealand",B],["pw","Palau",T],["pg","Papua New Guinea",R],["ws","Samoa",R],
  ["sb","Solomon Islands",G],["to","Tonga",R],["tv","Tuvalu",T],["vu","Vanuatu",G],
  // Widely recognised non-UN
  ["va","Vatican City",Y],["ps","Palestine",G],["xk","Kosovo",B],["tw","Taiwan",B],
];

// ---------------------------------------------------------------------------
// Emoji — Twemoji (CC-BY 4.0). Curated iconic set; extend by adding codepoints.
// [codepoint, name, optional tint] — art served as 72x72 PNG from jsDelivr.
// ---------------------------------------------------------------------------
const E_Y = "#f2c230";
const EMOJI = [
  ["1f600","Grinning"],["1f603","Smiley"],["1f604","Beaming"],["1f601","Grin"],["1f606","Laughing"],
  ["1f605","Sweat Smile"],["1f923","ROFL"],["1f602","Tears of Joy"],["1f642","Slight Smile"],["1f643","Upside Down"],
  ["1f609","Wink"],["1f60a","Blush"],["1f607","Halo Face"],["1f970","Hearts Face"],["1f60d","Heart Eyes"],
  ["1f929","Star Struck"],["1f618","Blow Kiss"],["1f60b","Yum"],["1f61b","Tongue Out"],["1f92a","Zany"],
  ["1f911","Money Mouth","#2f8a4a"],["1f917","Hugs"],["1f92b","Shush"],["1f914","Thinking"],["1f910","Zipper Mouth"],
  ["1f928","Raised Brow"],["1f610","Neutral"],["1f611","Expressionless"],["1f60f","Smirk"],["1f612","Unamused"],
  ["1f644","Eye Roll"],["1f62c","Grimace"],["1f925","Lying"],["1f60c","Relieved"],["1f614","Pensive"],
  ["1f62a","Sleepy"],["1f634","Sleeping"],["1f637","Mask"],["1f912","Thermometer"],["1f915","Bandage"],
  ["1f922","Nauseated","#3fae5a"],["1f92e","Vomiting","#3fae5a"],["1f927","Sneezing"],["1f975","Hot","#d2453a"],["1f976","Cold","#4ad0ff"],
  ["1f974","Woozy"],["1f635","Dizzy"],["1f92f","Mind Blown","#e8923a"],["1f920","Cowboy"],["1f973","Party"],
  ["1f60e","Sunglasses"],["1f913","Nerd"],["1f9d0","Monocle"],["1f615","Confused"],["1f61f","Worried"],
  ["1f641","Frown"],["1f62e","Open Mouth"],["1f632","Astonished"],["1f633","Flushed"],["1f97a","Pleading"],
  ["1f622","Crying"],["1f62d","Sobbing"],["1f631","Screaming"],["1f616","Confounded"],["1f623","Persevering"],
  ["1f61e","Disappointed"],["1f628","Fearful"],["1f630","Anxious"],["1f625","Sad Relief"],["1f620","Angry","#e8923a"],
  ["1f621","Rage","#d2453a"],["1f92c","Cursing","#d2453a"],["1f608","Smiling Imp","#8a4fd0"],["1f47f","Imp","#8a4fd0"],["1f480","Skull","#7a8a9a"],
  ["1f4a9","Pile of Poo","#9a6a42"],["1f921","Clown","#ff6ab0"],["1f479","Ogre","#d2453a"],["1f47a","Goblin","#d2453a"],["1f47b","Ghost","#7a8a9a"],
  ["1f47d","Alien","#3fae5a"],["1f916","Robot","#7a8a9a"],["1f383","Jack-o-Lantern","#e8923a"],["1f63a","Smiley Cat"],["1f639","Joy Cat"],
  ["1f63b","Heart Eyes Cat"],["1f63c","Smirk Cat"],["2764","Red Heart","#d2453a"],["1f525","Fire","#e8923a"],["1f4af","Hundred","#d2453a"],
  ["2b50","Star"],["1f308","Rainbow","#ff6ab0"],["1f355","Pizza","#e8923a"],["1f354","Burger","#e8923a"],["1f680","Rocket","#7a8a9a"],
  ["1f451","Crown"],["1f48e","Gem","#4ad0ff"],["26bd","Soccer Ball","#7a8a9a"],["1f3c0","Basketball","#e8923a"],["1f3ae","Game Pad","#5a5ae0"],
  ["1f4b0","Money Bag"],["1f409","Dragon","#3fae5a"],["1f984","Unicorn","#ff6ab0"],["1f31d","Full Moon Face"],["1f31e","Sun Face"],
];

// ---------------------------------------------------------------------------
// Animated GIF skins — files live in client/public/skins/ (served by the game
// host, so a relative URL works in dev and prod). business_monkey was
// recompressed from 31MB to ~0.5MB (112px, 48 colours) before shipping.
// [file, name, cost, rarity, tint]
// ---------------------------------------------------------------------------
const GIFS = [
  ["business_monkey", "Business Monkey", 2000, 0.03, "#9a6a42"],
  ["chill", "Chill", 1200, 0.06, "#4aa3ff"],
  ["duck_knife", "Duck Knife", 1200, 0.06, "#f2c230"],
  ["pixel_cat", "Pixel Cat", 900, 0.08, "#e8923a"],
  ["pixel_omen", "Pixel Omen", 900, 0.08, "#8a4fd0"],
];

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
const rows = [];
for (const s of ART) {
  rows.push(`  ('${s.id}', 'skin', '${esc(s.name)}', ${s.cost}, false, ${s.rarity}, 'image', '${s.color}', null, '${dataUrl(s.svg)}')`);
}
for (const [file, name, cost, rarity, color] of GIFS) {
  rows.push(`  ('skin_gif_${file}', 'skin', '${esc(name)}', ${cost}, false, ${rarity}, 'image', '${color}', null, '/skins/${file}.gif')`);
}
for (const [cc, name, col] of FLAGS) {
  rows.push(`  ('skin_flag_${cc}', 'skin', '${esc(name)}', 500, false, 0.02, 'image', '${col}', null, 'https://flagcdn.com/w320/${cc}.png')`);
}
for (const [cp, name, col] of EMOJI) {
  rows.push(`  ('skin_emoji_${cp}', 'skin', '${esc(name)}', 400, false, 0.03, 'image', '${col ?? E_Y}', null, 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${cp}.png')`);
}

const sql = `-- skin_pack.sql — GENERATED by tools/build-skin-pack.mjs; edit that file, not this one.
-- Run AFTER shop.sql. Idempotent (upsert by id).
--
-- Art sources & licensing:
--  * Original SVG skins (memes/faces/monkeys/animals): authored in-repo, embedded as data URLs.
--  * Country flags: https://flagcdn.com (public-domain flag art, free for commercial use).
--  * Emoji: Twemoji (https://github.com/jdecked/twemoji), CC-BY 4.0 — the game's credits must
--    include: "Emoji art by Twemoji, licensed CC-BY 4.0".

insert into public.cosmetics (id, type, name, medal_cost, free, rarity, kind, color, design, image_url) values
${rows.join(",\n")}
on conflict (id) do update set
  name = excluded.name, medal_cost = excluded.medal_cost, free = excluded.free,
  rarity = excluded.rarity, kind = excluded.kind, color = excluded.color,
  design = excluded.design, image_url = excluded.image_url, active = true;
`;

writeFileSync(out, sql);
console.log(`wrote ${out}: ${ART.length} art skins, ${GIFS.length} gifs, ${FLAGS.length} flags, ${EMOJI.length} emoji (${rows.length} rows)`);
