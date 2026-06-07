// Generates server/src/bots/names.ts — 5000 unique, random-feeling USERNAMES (1–8 chars)
// for the AI players. The goal is handles that read like real people picked them: made-up
// pronounceable words, gamer/internet slang, leetspeak, doubled letters, short tags,
// underscores and numbers — mixed across many patterns so nothing looks templated/AI.
// Real names are deliberately RARE (and usually dressed up with extra characters).
import fs from "node:fs";

// Deterministic RNG (xorshift) so the file is stable across regenerations.
let seed = 0x1a2b3c4d;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1e7) / 1e7; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;

const ONSET = "b bl br c ch cl cr d dr f fl fr g gl gr h j k kl kr l m n p ph pl pr qu r s sh sk sl sn sp st sw t th tr v w wh x z zz".split(" ");
const NUC = "a e i o u a e i o u y oo ee ai ou ya yo".split(" ");
const CODA = ["", "", "", "n", "r", "k", "p", "t", "x", "z", "ng", "sh", "ck", "ff", "zz", "b", "g", "m", "s", "d", "ll", "mp", "nk"];
const SLANG = `pog yeet uwu owo lol kek sus vibe slay drip rizz sigma npc afk simp noob pwn frag clutch sweaty
cracked goated mid copium ratio oof bruh bonk boop blep derp smol beeg chonk thicc yikes sheesh lit swag dank
emo goth hype juicy kewl meme moist nerd salty weeb woke zoomer zesty snacc gamer sussy baka nya rawr blah meh
ugh hmm pew zap boom pow wham splat blob goo glob nub scrub ez gg wp rekt clap yolo fomo bet cap deadass lowkey
vibin chill goblin gremlin skibidi gyatt huzz pls plz thx smh fr ngl idk imo grind farm camp rush peek flick
whiff ace tilt smurf doodle noodle wabi snoo zorp kazoo plink kork muffn boba mochi tofu sushi ramen`.split(/\s+/).filter(Boolean);
const PRE = ["x", "xX", "im", "its", "o", "lil", "big", "the", "da", "ya", "ur", "mc", "yo", "v"];
const SUF = ["x", "xx", "z", "zz", "_", "_x", "_z", "y", "ie", "o", "oo", "er", "ster", "ish", "yt", "tv", "boi", "bro", "pls", "uwu", "___"];
const NUM = ["7", "9", "13", "21", "23", "42", "69", "88", "99", "00", "420", "360", "666", "101", "1", "2", "3", "4", "5", "8", "11", "22", "33", "77", "27", "64", "12", "007", "187", "247"];
const REAL = "mike dave joe sam alex max tom ben jake kyle ryan luke nick zoe mia ava lily kate emma luca leo finn kai nina cleo theo".split(" ");
const KEYS = ["asdf", "qwer", "zxcv", "hjkl", "wasd", "qwop", "lkjh", "poiu", "yuiop", "gfds", "mnbv", "qaz", "wsx", "edc"];
const STRETCH = ["ze", "wo", "br", "hm", "oo", "aa", "ee", "mm", "gr", "ah", "no", "yo", "ye", "uh", "ow"];

const LEET = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", l: "1", g: "9", b: "8" };
const leet = (s, p) => s.split("").map((ch) => (LEET[ch] && chance(p) ? LEET[ch] : ch)).join("");
const mash = () => {
  let s = "";
  for (let i = 0, n = ri(1, 3); i < n; i++) s += pick(ONSET) + pick(NUC);
  return s + pick(CODA);
};
const shortTag = () => {
  const cs = "bcdfghjklmnpqrstvwxz".split("");
  const vs = "aeiouy".split("");
  let s = "";
  for (let i = 0, n = ri(1, 3); i < n; i++) s += chance(0.5) ? pick(cs) : pick(vs);
  return chance(0.3) ? leet(s, 0.6) : s;
};
const stretch = () => (chance(0.5) ? pick("zmaeohns".split("")).repeat(ri(2, 5)) : pick(STRETCH) + pick("eoarh".split("")).repeat(ri(1, 3)));

// [weight, generator] — nonsense + slang dominate; real names are rare.
const RECIPES = [
  [22, () => mash()],
  [10, () => mash() + pick(SUF)],
  [10, () => mash() + pick(NUM)],
  [8, () => leet(mash(), 0.4)],
  [4, () => pick(PRE) + mash()],
  [10, () => pick(SLANG)],
  [6, () => pick(SLANG) + pick(SUF)],
  [6, () => pick(SLANG) + pick(NUM)],
  [4, () => leet(pick(SLANG), 0.5)],
  [3, () => pick(PRE) + pick(SLANG)],
  [3, () => pick(SLANG) + pick(SLANG)],
  [5, () => stretch()],
  [6, () => shortTag()],
  [3, () => shortTag() + pick(NUM)],
  [2, () => pick(KEYS)],
  [2, () => pick(REAL) + pick(SUF)],
  [2, () => pick(REAL) + pick(NUM)],
  [1, () => leet(pick(REAL), 0.5)],
  [1, () => pick(REAL)],
];
const WTOTAL = RECIPES.reduce((s, r) => s + r[0], 0);
const rollRecipe = () => {
  let r = rnd() * WTOTAL;
  for (const [w, fn] of RECIPES) { if ((r -= w) <= 0) return fn; }
  return RECIPES[0][1];
};
const casevary = (s) => {
  const r = rnd();
  if (r < 0.1 && s.length <= 5) return s.toUpperCase();
  if (r < 0.38) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
};

// Profanity screen (normalizes leet + strips non-letters before matching).
const BLOCK = ["nigg", "niga", "nigr", "fagg", "fagot", "cunt", "kike", "chink", "retard", "rapist", "molest",
  "tranny", "beaner", "gook", "kkk", "fuck", "fuk", "phuck", "shit", "pussy", "twat", "wank", "whore", "slut",
  "bitch", "asshole", "dyke", "spick", "jizz", "negro", "ass", "cum", "sex", "penis", "vagin", "boob", "porn"];
const isClean = (s) => {
  const norm = s.toLowerCase().replace(/1/g, "i").replace(/3/g, "e").replace(/0/g, "o").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g").replace(/[^a-z]/g, "");
  return !BLOCK.some((b) => norm.includes(b));
};

const set = new Set();
const add = (s) => {
  if (!s || s.length < 1 || s.length > 8) return;
  if (!/[a-z0-9]/i.test(s) || /^_+$/.test(s)) return; // not all-underscores; needs a real char
  if (!isClean(s)) return;
  set.add(s);
};

let attempts = 0;
while (set.size < 9000 && attempts < 400000) {
  attempts++;
  add(casevary(rollRecipe()()));
}

let names = [...set];
for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
names = names.slice(0, 5000);
console.log(`generated ${names.length} usernames (pool ${set.size}, ${attempts} attempts)`);

const body = names.map((n) => JSON.stringify(n)).join(", ");
fs.writeFileSync(
  "server/src/bots/names.ts",
  `// AUTO-GENERATED by generate-names.mjs — do not edit by hand. ${names.length} random-style\n` +
    `// usernames (1–8 chars) for AI players, made to read like handles real people picked.\n` +
    `export const BOT_NAMES: readonly string[] = [\n  ${body},\n];\n`,
);
console.log("wrote server/src/bots/names.ts");
