import {
  CAPITALS,
  CLOAKS,
  HAIRS,
  HATS,
  MEMBER_SWORD_ID,
  SHIRTS,
  SWORDS,
  type Cosmetic,
} from "@territory/shared";
import type { BotCosmetics } from "./brain.js";

/**
 * Bot dress-up. Purely cosmetic: some AI players spawn wearing the same cosmetics real players can
 * own, so the arena looks populated by people who've kitted out their avatar. Three looks:
 *  - an IMAGE SKIN (animal / face / meme / emoji) — the most eye-catching, so most decorated bots get one;
 *  - a themed COSTUME (samurai, king, dragon, ...) — a coordinated layered outfit, now and then;
 *  - a GEARED look — a few odd hats/hair/shirt/sword pieces, like a casually decorated player.
 * No gameplay effect whatsoever.
 */

const DEFAULT = "default";
const chance = (p: number): boolean => Math.random() < p;
const blank = (): BotCosmetics => ({
  skinId: DEFAULT, capSkin: DEFAULT, swordSkin: DEFAULT, cloakSkin: DEFAULT,
  hatSkin: DEFAULT, hairSkin: DEFAULT, shirtSkin: DEFAULT,
});

/**
 * Pick a cosmetic weighted toward the RAREST (priciest) items, so bots show off the best of the
 * catalog — celestial blades, dragon wings, diamond plate — far more than the cheap basics, while
 * still wearing the odd mid-tier piece for variety. medalCost is the rarity proxy.
 */
function pickRare(arr: Cosmetic[]): string {
  const opts = arr.filter((c) => c.id !== DEFAULT && c.id !== MEMBER_SWORD_ID && c.medalCost > 0);
  if (!opts.length) return DEFAULT;
  const weight = (c: Cosmetic): number => Math.pow(c.medalCost, 1.4); // steep skew to the expensive end
  let total = 0;
  for (const c of opts) total += weight(c);
  let r = Math.random() * total;
  for (const c of opts) if ((r -= weight(c)) < 0) return c.id;
  return opts[opts.length - 1]!.id;
}

// Curated image skins by category. We pick a CATEGORY by weight first, then a skin within it, so
// the animated GIFs and animals show up regularly instead of being drowned out by faces and emoji.
const SKIN_GIFS = [
  "skin_gif_business_monkey", "skin_gif_chill", "skin_gif_duck_knife", "skin_gif_pixel_cat", "skin_gif_pixel_omen",
];
const SKIN_ANIMALS = [
  "skin_animal_bear", "skin_animal_cat", "skin_animal_dog", "skin_animal_fox", "skin_animal_frog",
  "skin_animal_koala", "skin_animal_lion", "skin_animal_owl", "skin_animal_panda", "skin_animal_penguin",
];
const SKIN_MEMES = [
  "skin_monkey_banana", "skin_monkey_cheeky", "skin_monkey_king", "skin_monkey_seeno", "skin_monkey_space",
  "skin_teddy_monkey", "skin_clip_pal", "skin_smug", "skin_stonks",
];
const SKIN_FACES = [
  "skin_face_m1", "skin_face_m2", "skin_face_m3", "skin_face_m5", "skin_face_m7", "skin_face_m9",
  "skin_face_f1", "skin_face_f2", "skin_face_f4", "skin_face_f6", "skin_face_f8", "skin_face_f10",
];
const SKIN_EMOJI = [
  "skin_emoji_1f409", "skin_emoji_1f451", "skin_emoji_1f60e", "skin_emoji_1f608", "skin_emoji_1f47f",
  "skin_emoji_1f47d", "skin_emoji_1f47b", "skin_emoji_1f480", "skin_emoji_1f525", "skin_emoji_1f4af",
  "skin_emoji_1f4b0", "skin_emoji_1f479", "skin_emoji_1f47a", "skin_emoji_1f48e", "skin_emoji_1f383",
  "skin_emoji_1f4a9",
];
// [pool, weight] — memes lead, with GIFs/animals close behind; faces are rare; emoji modest.
const SKIN_CATEGORIES: Array<[string[], number]> = [
  [SKIN_GIFS, 24],
  [SKIN_ANIMALS, 24],
  [SKIN_MEMES, 36],
  [SKIN_FACES, 6],
  [SKIN_EMOJI, 12],
];

/** Pick an image skin by weighted category, so animated GIFs and animals appear regularly. */
function pickImageSkin(): string {
  let total = 0;
  for (const [, w] of SKIN_CATEGORIES) total += w;
  let r = Math.random() * total;
  for (const [pool, w] of SKIN_CATEGORIES) {
    if ((r -= w) < 0) return pool[Math.floor(Math.random() * pool.length)]!;
  }
  return SKIN_ANIMALS[Math.floor(Math.random() * SKIN_ANIMALS.length)]!;
}

/**
 * Coordinated themed outfits, layered from the cosmetic catalog (no image skin under them). These
 * are the best advertisement we have for cosmetics, so the marquee themes the player called out
 * (samurai, cute girl, cool guy, king, queen, monster, angel, santa) carry extra `weight` and show
 * up several times an arena. Each is a fresh combo — many mix in wings/capes to flaunt combinations.
 */
const COSTUMES: Array<{ weight: number; look: Partial<BotCosmetics> }> = [
  // --- SAMURAI (incl. a winged variant) ---
  { weight: 4, look: { hatSkin: "helmet_samurai", shirtSkin: "shirt_samurai", swordSkin: "sword_katana", hairSkin: "hair_bun" } },
  { weight: 3, look: { hatSkin: "helmet_samurai", shirtSkin: "shirt_samurai", swordSkin: "sword_katana", cloakSkin: "wings_dragon" } },
  // --- CUTE GIRL ---
  { weight: 3, look: { hatSkin: "hat_bow", shirtSkin: "shirt_dress_floral", hairSkin: "hair_wavy_blonde" } },
  { weight: 3, look: { hatSkin: "hat_flower", shirtSkin: "shirt_dress_pink", hairSkin: "hair_long", cloakSkin: "wings_angel" } },
  { weight: 2, look: { hatSkin: "hat_tiara", shirtSkin: "shirt_dress_red", hairSkin: "hair_wavy_red" } },
  // --- COOL GUY ---
  { weight: 3, look: { hatSkin: "hat_fedora", shirtSkin: "shirt_leather", swordSkin: "sword_silver", hairSkin: "hair_spiky" } },
  { weight: 3, look: { hatSkin: "hat_top", shirtSkin: "shirt_suit", swordSkin: "sword_obsidian", cloakSkin: "cloak_storm", hairSkin: "hair_emo" } },
  // --- KING ---
  { weight: 4, look: { hatSkin: "helmet_gold", shirtSkin: "shirt_gold", cloakSkin: "cloak_king", swordSkin: "sword_celestial", hairSkin: "hair_long" } },
  // --- QUEEN ---
  { weight: 4, look: { hatSkin: "hat_tiara", shirtSkin: "shirt_dress_gold", cloakSkin: "cloak_queen", hairSkin: "hair_long" } },
  // --- MONSTER (a couple of flavors) ---
  { weight: 3, look: { hatSkin: "hat_devil", shirtSkin: "shirt_obsidian", swordSkin: "sword_venom", cloakSkin: "wings_dragon", hairSkin: "hair_red" } },
  { weight: 2, look: { hatSkin: "helmet_obsidian", shirtSkin: "shirt_emerald", swordSkin: "sword_venom", cloakSkin: "cloak_void" } },
  // --- ANGEL ---
  { weight: 4, look: { hatSkin: "hat_halo", cloakSkin: "wings_angel", shirtSkin: "shirt_blouse", swordSkin: "sword_celestial", hairSkin: "hair_white" } },
  // --- SANTA ---
  { weight: 3, look: { hatSkin: "hat_santa", shirtSkin: "shirt_crimson", cloakSkin: "cloak_red", hairSkin: "hair_white" } },
  // --- DRAGON LORD ---
  { weight: 2, look: { hatSkin: "helmet_crimson", shirtSkin: "shirt_crimson", cloakSkin: "wings_dragon", swordSkin: "sword_flamberge" } },
  // --- bonus creative themes (lower weight, for spice) ---
  { weight: 2, look: { hatSkin: "hat_wizard", shirtSkin: "shirt_robe", swordSkin: "sword_runic", hairSkin: "hair_white" } }, // wizard
  { weight: 2, look: { hatSkin: "hat_pirate", shirtSkin: "shirt_vest", swordSkin: "sword_rapier", hairSkin: "hair_dreads" } }, // pirate
  { weight: 2, look: { hatSkin: "helmet_spartan", shirtSkin: "shirt_spartan", swordSkin: "sword_broadsword", cloakSkin: "cloak_red" } }, // spartan
  { weight: 2, look: { hatSkin: "hat_viking", shirtSkin: "shirt_iron", swordSkin: "sword_broadsword", cloakSkin: "cloak_frost", hairSkin: "hair_braids" } }, // viking
  { weight: 1, look: { hatSkin: "hat_propeller", shirtSkin: "shirt_hawaiian", hairSkin: "hair_rainbow" } }, // goofy
];

/** Image-skin look: the skin is the statement, but often paired with a flashy blade or cape too. */
function imageSkinLook(): BotCosmetics {
  const c = blank();
  c.skinId = pickImageSkin();
  if (chance(0.5)) c.swordSkin = pickRare(SWORDS);
  if (chance(0.35)) c.cloakSkin = pickRare(CLOAKS);
  if (chance(0.3)) c.capSkin = pickRare(CAPITALS);
  return c;
}

/** A themed costume, weighted toward the marquee themes (returns a fresh object). */
function costumeLook(): BotCosmetics {
  let total = 0;
  for (const c of COSTUMES) total += c.weight;
  let r = Math.random() * total;
  for (const c of COSTUMES) if ((r -= c.weight) < 0) return { ...blank(), ...c.look };
  return { ...blank(), ...COSTUMES[0]!.look };
}

/** Decked-out player: layered pieces leaning hard on the rarest, flashiest catalog gear. */
function gearedLook(): BotCosmetics {
  const c = blank();
  if (chance(0.4)) c.capSkin = pickRare(CAPITALS);
  c.swordSkin = chance(0.1) ? MEMBER_SWORD_ID : chance(0.7) ? pickRare(SWORDS) : DEFAULT;
  if (chance(0.4)) c.cloakSkin = pickRare(CLOAKS);
  if (chance(0.6)) c.hatSkin = pickRare(HATS);
  if (chance(0.6)) c.hairSkin = pickRare(HAIRS);
  if (chance(0.65)) c.shirtSkin = pickRare(SHIRTS);
  // A geared bot must actually show something, even if every roll above whiffed.
  const wearing = [c.capSkin, c.swordSkin, c.cloakSkin, c.hatSkin, c.hairSkin, c.shirtSkin].some((v) => v !== DEFAULT);
  if (!wearing) c.swordSkin = pickRare(SWORDS);
  return c;
}

/**
 * Roll a bot's look. ~60% of bots are decorated (within the 50–70% asked for). Of those: ~40% wear
 * a themed COSTUME (the marquee outfits that sell cosmetics — samurai, king, queen, angel, santa,
 * monster, cute girl, cool guy...), ~35% an image skin (usually with a flashy blade/cape), and the
 * rest a decked-out look heavy on the rarest gear. The other ~40% stay plain.
 */
export function rollBotCosmetics(): BotCosmetics | null {
  if (Math.random() >= 0.6) return null;
  if (Math.random() < 0.4) return costumeLook();
  if (Math.random() < 0.6) return imageSkinLook();
  return gearedLook();
}
