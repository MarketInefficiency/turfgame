-- Shop platform: full cosmetics catalog, admin roles, image storage, and 24h rotation.
-- Run AFTER schema.sql and medals.sql.
-- PREREQUISITE: enable the pg_cron extension first (Database -> Extensions -> search "pg_cron").

-- ============================================================================
-- 1. Grow the cosmetics table into the full catalog (built-in + admin items).
--    The three 'default' items stay in client code (their id repeats per type);
--    every other item lives here so admins can add to it.
-- ============================================================================
alter table public.cosmetics
  add column if not exists name text,
  add column if not exists rarity numeric not null default 0.5, -- daily rotation chance, 0..1
  add column if not exists kind text not null default 'builtin', -- 'builtin' (code-drawn) | 'image'
  add column if not exists image_url text, -- for kind='image' (png/webp/gif texture)
  add column if not exists color text, -- builtin skins/swords
  add column if not exists design text, -- builtin capital design id (e.g. cap_gold)
  add column if not exists is_default boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists flare_url text, -- sword tip flare texture (png/gif) shown when ganged
  add column if not exists created_at timestamptz not null default now();

-- Refresh the built-in (non-default) items with full data.
insert into public.cosmetics (id, type, name, medal_cost, free, rarity, kind, color, design) values
  ('skin_emerald', 'skin', 'Emerald', 0, true, 1, 'builtin', '#37c46e', null),
  ('skin_sky', 'skin', 'Sky', 0, true, 1, 'builtin', '#4aa3ff', null),
  ('skin_coral', 'skin', 'Coral', 300, false, 0.5, 'builtin', '#ff7a59', null),
  ('skin_gold', 'skin', 'Gold', 300, false, 0.4, 'builtin', '#f2b63c', null),
  ('skin_violet', 'skin', 'Violet', 300, false, 0.4, 'builtin', '#a96bff', null),
  ('skin_crimson', 'skin', 'Crimson', 300, false, 0.5, 'builtin', '#d2453a', null),
  ('skin_rose', 'skin', 'Rose', 300, false, 0.45, 'builtin', '#ff6ab0', null),
  ('skin_amber', 'skin', 'Amber', 300, false, 0.45, 'builtin', '#e8923a', null),
  ('skin_lime', 'skin', 'Lime', 300, false, 0.45, 'builtin', '#84c83a', null),
  ('skin_teal', 'skin', 'Teal', 300, false, 0.45, 'builtin', '#2ab8a8', null),
  ('skin_indigo', 'skin', 'Indigo', 400, false, 0.35, 'builtin', '#5a5ae0', null),
  ('skin_magenta', 'skin', 'Magenta', 400, false, 0.35, 'builtin', '#c84ad0', null),
  ('skin_slate', 'skin', 'Slate', 400, false, 0.3, 'builtin', '#7a8a9a', null),
  ('skin_mint', 'skin', 'Mint', 400, false, 0.3, 'builtin', '#4ad2a0', null),
  ('cap_gold', 'capital', 'Gold Keep', 700, false, 0.3, 'builtin', null, 'cap_gold'),
  ('cap_obsidian', 'capital', 'Obsidian Spire', 1200, false, 0.12, 'builtin', null, 'cap_obsidian'),
  ('cap_ember', 'capital', 'Ember Fortress', 1800, false, 0.06, 'builtin', null, 'cap_ember'),
  ('cap_crystal', 'capital', 'Crystal Spire', 1400, false, 0.12, 'builtin', null, 'cap_crystal'),
  ('cap_volcano', 'capital', 'Volcano Keep', 1600, false, 0.08, 'builtin', null, 'cap_volcano'),
  ('cap_emerald', 'capital', 'Emerald Citadel', 1300, false, 0.15, 'builtin', null, 'cap_emerald'),
  ('cap_bone', 'capital', 'Bonekeep', 1500, false, 0.1, 'builtin', null, 'cap_bone'),
  ('cap_sky', 'capital', 'Sky Palace', 2000, false, 0.04, 'builtin', null, 'cap_sky'),
  ('cap_shadow', 'capital', 'Shadow Spire', 1700, false, 0.07, 'builtin', null, 'cap_shadow'),
  ('cap_sand', 'capital', 'Sun Palace', 1200, false, 0.18, 'builtin', null, 'cap_sand'),
  ('cap_dragon', 'capital', 'Dragon''s Roost', 2200, false, 0.03, 'builtin', null, 'cap_dragon'),
  ('cap_coral', 'capital', 'Coral Throne', 1400, false, 0.12, 'builtin', null, 'cap_coral'),
  ('sword_crimson', 'sword', 'Crimson', 350, false, 0.45, 'builtin', '#ff5a52', null),
  ('sword_azure', 'sword', 'Azure', 350, false, 0.45, 'builtin', '#4aa3ff', null),
  ('sword_silver', 'sword', 'Silver', 350, false, 0.35, 'builtin', '#cfd6dd', null),
  -- Design swords: their own blade shape (code SWORD_SVGS by id); color is just the swoosh tint.
  ('sword_katana', 'sword', 'Bloodmoon Katana', 600, false, 0.3, 'builtin', '#e0473f', null),
  ('sword_flamberge', 'sword', 'Flameberge', 900, false, 0.12, 'builtin', '#ec6a1e', null),
  ('sword_broadsword', 'sword', 'Warlord''s Greatsword', 700, false, 0.25, 'builtin', '#9fc0e0', null),
  ('sword_rapier', 'sword', 'Duelist''s Rapier', 650, false, 0.3, 'builtin', '#dfe6ee', null),
  ('sword_obsidian', 'sword', 'Obsidian Edge', 1100, false, 0.08, 'builtin', '#a96bff', null),
  ('sword_frost', 'sword', 'Frostbite', 900, false, 0.12, 'builtin', '#9fdcff', null),
  ('sword_venom', 'sword', 'Venom Fang', 800, false, 0.15, 'builtin', '#6fe04a', null),
  ('sword_runic', 'sword', 'Runeblade', 1200, false, 0.06, 'builtin', '#38e0ff', null),
  ('sword_celestial', 'sword', 'Celestial Edge', 1800, false, 0.02, 'builtin', '#ffe9a8', null),
  -- Cloaks/wings are a MEMBERSHIP perk: they rotate like everything else (6/day), but only
  -- members may buy the rotated ones (buy_cosmetic enforces both gates).
  ('cloak_red', 'cloak', 'Crimson Cloak', 900, false, 0.3, 'builtin', '#c4302a', null),
  ('cloak_king', 'cloak', 'King''s Mantle', 1600, false, 0.15, 'builtin', '#5e2b91', null),
  ('cloak_queen', 'cloak', 'Queen''s Mantle', 1600, false, 0.15, 'builtin', '#e64aa0', null),
  ('cloak_void', 'cloak', 'Void Mantle', 2200, false, 0.06, 'builtin', '#1a1530', null),
  ('cloak_phoenix', 'cloak', 'Phoenix Cloak', 2400, false, 0.05, 'builtin', '#ec5a1e', null),
  ('cloak_storm', 'cloak', 'Storm Cloak', 2000, false, 0.1, 'builtin', '#3a78c8', null),
  ('cloak_emerald', 'cloak', 'Emerald Cloak', 1800, false, 0.12, 'builtin', '#1f9a5a', null),
  ('cloak_frost', 'cloak', 'Frost Cloak', 2000, false, 0.1, 'builtin', '#bfe6ff', null),
  ('wings_dragon', 'cloak', 'Dragon Wings', 2500, false, 0.04, 'builtin', '#7e1d1d', 'wings_dragon'),
  ('wings_angel', 'cloak', 'Angel Wings', 2500, false, 0.04, 'builtin', '#eef2f6', 'wings_angel')
on conflict (id) do update set
  name = excluded.name, medal_cost = excluded.medal_cost, free = excluded.free,
  rarity = excluded.rarity, kind = excluded.kind, color = excluded.color, design = excluded.design;

-- Recolourable wing variants: 10 colours x 2 wing types. The client recolours the SVG by `design`
-- (wings_dragon / wings_angel) + `color`, so these are just rows that point at the same shape.
insert into public.cosmetics (id, type, name, medal_cost, free, rarity, kind, color, design)
select b.base || '_' || c.key, 'cloak', c.name || ' ' || b.label, 2500, false, 0.04, 'builtin', c.color, b.base
from (values ('wings_dragon', 'Dragon Wings'), ('wings_angel', 'Angel Wings')) as b(base, label)
cross join (values
  ('crimson','Crimson','#d23a32'), ('ember','Ember','#ec6a1e'), ('gold','Gold','#e8c24a'),
  ('emerald','Emerald','#37c46e'), ('frost','Frost','#4ad0ff'), ('azure','Azure','#3a78ff'),
  ('amethyst','Amethyst','#a96bff'), ('rose','Rose','#ff6ab0'), ('pearl','Pearl','#f2f5f8'),
  ('obsidian','Obsidian','#23262e')
) as c(key, name, color)
on conflict (id) do update set name = excluded.name, color = excluded.color, design = excluded.design, rarity = excluded.rarity, active = true;

-- Members equip a cloak via this profile column; hat/hair/shirt are worn cosmetics.
alter table public.profiles add column if not exists equipped_cloak text not null default 'default';
alter table public.profiles add column if not exists equipped_hat   text not null default 'default';
alter table public.profiles add column if not exists equipped_hair  text not null default 'default';
alter table public.profiles add column if not exists equipped_shirt text not null default 'default';

-- Allow the new cosmetic types in entitlements (the original check only listed skin/capital/sword).
alter table public.entitlements drop constraint if exists entitlements_cosmetic_type_check;
alter table public.entitlements add constraint entitlements_cosmetic_type_check
  check (cosmetic_type in ('skin', 'capital', 'sword', 'cloak', 'hat', 'hair', 'shirt'));

-- Hats / hair / shirts (free pioneer items + starter set incl. iron/gold armour sets).
insert into public.cosmetics (id, type, name, medal_cost, free, rarity, kind, color, design) values
  ('hair_male', 'hair', 'Classic Cut', 0, true, 1, 'builtin', '#6b4423', null),
  ('hair_female', 'hair', 'Shoulder Length', 0, true, 1, 'builtin', '#7a4a2a', null),
  ('hair_spiky', 'hair', 'Spiky', 300, false, 0.4, 'builtin', '#2a2e3a', null),
  ('hair_long', 'hair', 'Golden Locks', 500, false, 0.3, 'builtin', '#e8c878', null),
  ('hair_mohawk', 'hair', 'Mohawk', 400, false, 0.3, 'builtin', '#c43a3a', null),
  ('hair_bun', 'hair', 'Top Knot', 300, false, 0.4, 'builtin', '#3a2412', null),
  ('hair_afro', 'hair', 'Afro', 400, false, 0.3, 'builtin', '#2a2018', null),
  ('hair_ponytail', 'hair', 'Ponytail', 300, false, 0.4, 'builtin', '#4a3018', null),
  ('hair_buzz', 'hair', 'Buzz Cut', 200, false, 0.5, 'builtin', '#3a3530', null),
  ('hair_curly', 'hair', 'Curly', 300, false, 0.4, 'builtin', '#5a3a1a', null),
  ('hair_pixie', 'hair', 'Pixie', 300, false, 0.4, 'builtin', '#1a1a1f', null),
  ('hair_braids', 'hair', 'Braids', 400, false, 0.3, 'builtin', '#2a1c10', null),
  ('hair_emo', 'hair', 'Side Sweep', 400, false, 0.3, 'builtin', '#15151a', null),
  ('hair_dreads', 'hair', 'Dreads', 500, false, 0.25, 'builtin', '#2a1c10', null),
  ('hair_pigtails', 'hair', 'Pigtails', 300, false, 0.4, 'builtin', '#6b4423', null),
  ('hair_wavy', 'hair', 'Wavy', 400, false, 0.3, 'builtin', '#7a4a2a', null),
  ('hair_pink', 'hair', 'Pink Dye', 600, false, 0.2, 'builtin', '#ff6ab0', null),
  ('hair_blue', 'hair', 'Blue Dye', 600, false, 0.2, 'builtin', '#4aa3ff', null),
  ('hair_white', 'hair', 'Silver Dye', 600, false, 0.2, 'builtin', '#eef2f6', null),
  ('hair_red', 'hair', 'Redhead', 400, false, 0.3, 'builtin', '#d2453a', null),
  ('hat_tg', 'hat', 'Pioneer Cap', 0, true, 1, 'builtin', '#2a6cd0', null),
  ('helmet_iron', 'hat', 'Iron Helm', 600, false, 0.25, 'builtin', '#9aa6b4', null),
  ('helmet_gold', 'hat', 'Gold Helm', 1200, false, 0.08, 'builtin', '#e8c24a', null),
  ('helmet_crimson', 'hat', 'Crimson Helm', 800, false, 0.15, 'builtin', '#b03a3a', null),
  ('helmet_obsidian', 'hat', 'Obsidian Helm', 1400, false, 0.06, 'builtin', '#3a3550', null),
  ('helmet_emerald', 'hat', 'Emerald Helm', 1000, false, 0.1, 'builtin', '#1f8a5a', null),
  ('helmet_diamond', 'hat', 'Diamond Helm', 1800, false, 0.03, 'builtin', '#bfe6ff', null),
  ('hat_wizard', 'hat', 'Wizard Hat', 700, false, 0.2, 'builtin', '#5a3a9a', null),
  ('hat_top', 'hat', 'Top Hat', 500, false, 0.3, 'builtin', '#1a1a1f', null),
  ('hat_beanie', 'hat', 'Beanie', 300, false, 0.4, 'builtin', '#c43a3a', null),
  ('hat_cowboy', 'hat', 'Cowboy Hat', 600, false, 0.2, 'builtin', '#9a6a3a', null),
  ('hat_pirate', 'hat', 'Pirate Tricorn', 700, false, 0.18, 'builtin', '#1f242c', null),
  ('hat_viking', 'hat', 'Viking Helm', 800, false, 0.15, 'builtin', '#8a96a4', null),
  ('hat_halo', 'hat', 'Halo', 1000, false, 0.08, 'builtin', '#f7d36c', null),
  ('hat_devil', 'hat', 'Devil Horns', 800, false, 0.15, 'builtin', '#c43a3a', null),
  ('hat_santa', 'hat', 'Santa Hat', 500, false, 0.3, 'builtin', '#c43a3a', null),
  ('hat_chef', 'hat', 'Chef Toque', 400, false, 0.3, 'builtin', '#f0f3f7', null),
  ('hat_grad', 'hat', 'Graduation Cap', 500, false, 0.3, 'builtin', '#1f242c', null),
  ('hat_flower', 'hat', 'Flower Crown', 600, false, 0.2, 'builtin', '#2f8a4a', null),
  ('hat_bandana', 'hat', 'Bandana', 300, false, 0.4, 'builtin', '#c43a3a', null),
  ('shirt_iron', 'shirt', 'Iron Plate', 600, false, 0.25, 'builtin', '#9aa6b4', null),
  ('shirt_gold', 'shirt', 'Gold Plate', 1200, false, 0.08, 'builtin', '#e8c24a', null),
  ('shirt_crimson', 'shirt', 'Crimson Plate', 800, false, 0.15, 'builtin', '#b03a3a', null),
  ('shirt_obsidian', 'shirt', 'Obsidian Plate', 1400, false, 0.06, 'builtin', '#3a3550', null),
  ('shirt_emerald', 'shirt', 'Emerald Plate', 1000, false, 0.1, 'builtin', '#1f8a5a', null),
  ('shirt_diamond', 'shirt', 'Diamond Plate', 1800, false, 0.03, 'builtin', '#bfe6ff', null),
  ('shirt_hoodie', 'shirt', 'Hoodie', 400, false, 0.35, 'builtin', '#5a6470', null),
  ('shirt_tee', 'shirt', 'Tee', 300, false, 0.4, 'builtin', '#3a86d0', null),
  ('shirt_suit', 'shirt', 'Sharp Suit', 800, false, 0.15, 'builtin', '#1f242c', null),
  ('shirt_tank', 'shirt', 'Tank Top', 300, false, 0.4, 'builtin', '#e0e4e8', null),
  ('shirt_jersey', 'shirt', 'Jersey', 400, false, 0.3, 'builtin', '#d23a32', null),
  ('shirt_flannel', 'shirt', 'Flannel', 400, false, 0.3, 'builtin', '#7a3030', null),
  ('shirt_stripes', 'shirt', 'Striped Shirt', 300, false, 0.4, 'builtin', '#3a4658', null),
  ('shirt_overalls', 'shirt', 'Overalls', 500, false, 0.25, 'builtin', '#3a5a8a', null),
  ('shirt_lab', 'shirt', 'Lab Coat', 500, false, 0.25, 'builtin', '#f0f3f7', null),
  ('shirt_vest', 'shirt', 'Vest', 500, false, 0.25, 'builtin', '#5a3a2a', null),
  ('shirt_polo', 'shirt', 'Polo', 300, false, 0.4, 'builtin', '#2f9a6a', null),
  ('shirt_turtleneck', 'shirt', 'Turtleneck', 400, false, 0.3, 'builtin', '#8a8a96', null),
  ('shirt_tactical', 'shirt', 'Tactical Vest', 700, false, 0.18, 'builtin', '#3a4030', null),
  ('shirt_robe', 'shirt', 'Wizard Robe', 700, false, 0.18, 'builtin', '#5a3a9a', null)
on conflict (id) do update set
  name = excluded.name, medal_cost = excluded.medal_cost, free = excluded.free,
  rarity = excluded.rarity, kind = excluded.kind, color = excluded.color, active = true;

-- Wearables batch 2: hair color matrix + colorful dyes, new hats (incl. samurai/spartan sets),
-- formalwear/dresses with a male/female balance.
insert into public.cosmetics (id, type, name, medal_cost, free, rarity, kind, color, design) values
  ('hair_male_blonde', 'hair', 'Classic Cut Blonde', 300, false, 0.4, 'builtin', '#e8c878', null),
  ('hair_male_black', 'hair', 'Classic Cut Black', 300, false, 0.4, 'builtin', '#23232b', null),
  ('hair_female_blonde', 'hair', 'Shoulder Length Blonde', 300, false, 0.4, 'builtin', '#e8c878', null),
  ('hair_female_red', 'hair', 'Shoulder Length Red', 400, false, 0.3, 'builtin', '#d2453a', null),
  ('hair_female_black', 'hair', 'Shoulder Length Black', 300, false, 0.4, 'builtin', '#23232b', null),
  ('hair_long_brown', 'hair', 'Chestnut Locks', 500, false, 0.25, 'builtin', '#6b4423', null),
  ('hair_long_red', 'hair', 'Crimson Locks', 500, false, 0.25, 'builtin', '#d2453a', null),
  ('hair_long_black', 'hair', 'Raven Locks', 500, false, 0.25, 'builtin', '#23232b', null),
  ('hair_wavy_blonde', 'hair', 'Wavy Blonde', 400, false, 0.3, 'builtin', '#e8c878', null),
  ('hair_wavy_red', 'hair', 'Wavy Red', 400, false, 0.3, 'builtin', '#d2453a', null),
  ('hair_curly_blonde', 'hair', 'Curly Blonde', 300, false, 0.4, 'builtin', '#e8c878', null),
  ('hair_curly_red', 'hair', 'Curly Red', 300, false, 0.4, 'builtin', '#d2453a', null),
  ('hair_ponytail_blonde', 'hair', 'Ponytail Blonde', 300, false, 0.4, 'builtin', '#e8c878', null),
  ('hair_ponytail_red', 'hair', 'Ponytail Red', 300, false, 0.4, 'builtin', '#d2453a', null),
  ('hair_bun_blonde', 'hair', 'Top Knot Blonde', 300, false, 0.4, 'builtin', '#e8c878', null),
  ('hair_green', 'hair', 'Lime Dye', 600, false, 0.2, 'builtin', '#3fae5a', null),
  ('hair_purple', 'hair', 'Violet Dye', 600, false, 0.2, 'builtin', '#8a4fd0', null),
  ('hair_teal', 'hair', 'Teal Dye', 600, false, 0.2, 'builtin', '#2ab8a8', null),
  ('hair_ombre', 'hair', 'Sunset Ombre', 900, false, 0.12, 'builtin', '#ff6ab0', null),
  ('hair_rainbow', 'hair', 'Rainbow Dye', 1200, false, 0.08, 'builtin', '#8a4fd0', null),
  ('hat_beret', 'hat', 'Beret', 400, false, 0.3, 'builtin', '#c43a3a', null),
  ('hat_sun', 'hat', 'Sun Hat', 500, false, 0.25, 'builtin', '#e6c87a', null),
  ('hat_bow', 'hat', 'Hair Bow', 400, false, 0.3, 'builtin', '#ff6ab0', null),
  ('hat_tiara', 'hat', 'Tiara', 900, false, 0.12, 'builtin', '#e8c24a', null),
  ('hat_headband', 'hat', 'Headband', 300, false, 0.4, 'builtin', '#3a86d0', null),
  ('hat_cat', 'hat', 'Cat Ears', 600, false, 0.2, 'builtin', '#2a2e3a', null),
  ('hat_bunny', 'hat', 'Bunny Ears', 600, false, 0.2, 'builtin', '#f0f3f7', null),
  ('hat_fedora', 'hat', 'Fedora', 500, false, 0.25, 'builtin', '#8a8a96', null),
  ('hat_bucket', 'hat', 'Bucket Hat', 400, false, 0.3, 'builtin', '#6a7a4a', null),
  ('hat_sombrero', 'hat', 'Sombrero', 700, false, 0.18, 'builtin', '#d2a85a', null),
  ('hat_party', 'hat', 'Party Hat', 400, false, 0.3, 'builtin', '#4aa3ff', null),
  ('hat_detective', 'hat', 'Deerstalker', 600, false, 0.2, 'builtin', '#8a6a42', null),
  ('hat_witch', 'hat', 'Witch Hat', 700, false, 0.18, 'builtin', '#2e2244', null),
  ('hat_sailor', 'hat', 'Sailor Cap', 400, false, 0.3, 'builtin', '#f0f3f7', null),
  ('hat_propeller', 'hat', 'Propeller Cap', 500, false, 0.25, 'builtin', '#c43a3a', null),
  ('hat_ushanka', 'hat', 'Ushanka', 500, false, 0.25, 'builtin', '#7a5a3a', null),
  ('helmet_samurai', 'hat', 'Samurai Kabuto', 1400, false, 0.05, 'builtin', '#3a3f4a', null),
  ('helmet_spartan', 'hat', 'Spartan Helm', 1600, false, 0.04, 'builtin', '#c89a4a', null),
  ('hat_mining', 'hat', 'Hard Hat', 400, false, 0.3, 'builtin', '#f2c230', null),
  ('hat_jester', 'hat', 'Jester Hat', 600, false, 0.2, 'builtin', '#8a4fd0', null),
  ('shirt_tuxedo', 'shirt', 'Classic Tuxedo', 900, false, 0.12, 'builtin', '#1a1d24', null),
  ('shirt_tux_white', 'shirt', 'White Tuxedo', 1000, false, 0.1, 'builtin', '#f0f3f7', null),
  ('shirt_suit_navy', 'shirt', 'Navy Suit', 800, false, 0.15, 'builtin', '#243a5e', null),
  ('shirt_pinstripe', 'shirt', 'Pinstripe Suit', 900, false, 0.12, 'builtin', '#2e3138', null),
  ('shirt_dress_red', 'shirt', 'Scarlet Gown', 800, false, 0.15, 'builtin', '#c2304e', null),
  ('shirt_dress_blue', 'shirt', 'Sapphire Gown', 800, false, 0.15, 'builtin', '#2f5fc4', null),
  ('shirt_dress_pink', 'shirt', 'Rose Dress', 600, false, 0.2, 'builtin', '#f06a9a', null),
  ('shirt_dress_floral', 'shirt', 'Sundress', 500, false, 0.25, 'builtin', '#f5ecd2', null),
  ('shirt_dress_black', 'shirt', 'Evening Dress', 900, false, 0.12, 'builtin', '#1c1c22', null),
  ('shirt_dress_gold', 'shirt', 'Golden Gown', 1200, false, 0.08, 'builtin', '#e0b13e', null),
  ('shirt_blouse', 'shirt', 'Silk Blouse', 400, false, 0.3, 'builtin', '#f6f8fa', null),
  ('shirt_cardigan', 'shirt', 'Cardigan', 400, false, 0.3, 'builtin', '#9a6a8a', null),
  ('shirt_kimono', 'shirt', 'Kimono', 700, false, 0.18, 'builtin', '#3a4a8a', null),
  ('shirt_sweater', 'shirt', 'Knit Sweater', 400, false, 0.3, 'builtin', '#e8dcc2', null),
  ('shirt_denim', 'shirt', 'Denim Jacket', 500, false, 0.25, 'builtin', '#4a72a8', null),
  ('shirt_leather', 'shirt', 'Leather Jacket', 700, false, 0.18, 'builtin', '#23252c', null),
  ('shirt_hawaiian', 'shirt', 'Hawaiian Shirt', 500, false, 0.25, 'builtin', '#2a9a8a', null),
  ('shirt_sequin', 'shirt', 'Sequin Top', 800, false, 0.15, 'builtin', '#7a3fc0', null),
  ('shirt_samurai', 'shirt', 'Samurai Armor', 1400, false, 0.05, 'builtin', '#3a3f4a', null),
  ('shirt_spartan', 'shirt', 'Spartan Cuirass', 1600, false, 0.04, 'builtin', '#c89a4a', null)
on conflict (id) do update set
  name = excluded.name, medal_cost = excluded.medal_cost, free = excluded.free,
  rarity = excluded.rarity, kind = excluded.kind, color = excluded.color, active = true;

-- ============================================================================
-- 2. Admin roles. One owner mints other admins; helpers gate every admin action.
--    After running this, make yourself owner:
--      insert into public.admin_roles (user_id, role) values ('<your-auth-user-id>', 'owner');
-- ============================================================================
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'item_creator', -- 'owner' | 'item_creator'
  created_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid());
$$;
create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid() and role = 'owner');
$$;

drop policy if exists "admins read roles" on public.admin_roles;
create policy "admins read roles" on public.admin_roles for select using (public.is_admin());
drop policy if exists "owner manages roles" on public.admin_roles;
create policy "owner manages roles" on public.admin_roles for all using (public.is_owner()) with check (public.is_owner());

-- Admins can create/edit/remove cosmetics (the public read policy from medals.sql stays).
drop policy if exists "admins write cosmetics" on public.cosmetics;
create policy "admins write cosmetics" on public.cosmetics for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 3. Storage bucket for cosmetic art (public read, admin-only write).
-- ============================================================================
insert into storage.buckets (id, name, public) values ('cosmetics', 'cosmetics', true)
  on conflict (id) do nothing;
drop policy if exists "cosmetic art public read" on storage.objects;
create policy "cosmetic art public read" on storage.objects for select using (bucket_id = 'cosmetics');
drop policy if exists "admins upload cosmetic art" on storage.objects;
create policy "admins upload cosmetic art" on storage.objects for insert with check (bucket_id = 'cosmetics' and public.is_admin());
drop policy if exists "admins change cosmetic art" on storage.objects;
create policy "admins change cosmetic art" on storage.objects for update using (bucket_id = 'cosmetics' and public.is_admin());

-- ============================================================================
-- 4. 24h rotation. 6 items per category, each weighted by its rarity chance.
-- ============================================================================
create table if not exists public.daily_shop (
  cosmetic_id text primary key references public.cosmetics (id) on delete cascade,
  rolled_at timestamptz not null default now()
);
create table if not exists public.shop_state (
  id int primary key default 1,
  rotation_ends_at timestamptz not null default (now() + interval '24 hours')
);
insert into public.shop_state (id) values (1) on conflict (id) do nothing;
alter table public.daily_shop enable row level security;
alter table public.shop_state enable row level security;
drop policy if exists "daily shop read" on public.daily_shop;
create policy "daily shop read" on public.daily_shop for select using (true);
drop policy if exists "shop state read" on public.shop_state;
create policy "shop state read" on public.shop_state for select using (true);

create or replace function public.roll_daily_shop() returns void
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.daily_shop where true; -- clear (the explicit WHERE avoids the no-WHERE guard)
  -- Feature 6 items PER CATEGORY (incl. cloaks — members-only to buy, but they rotate like the
  -- rest), weighted by rarity (commoner items more likely). Efraimidis-Spirakis weighted sampling
  -- without replacement, done in LOG space — key = ln(random())/weight — so tiny rarities don't
  -- underflow the way random()^(1/rarity) does. rarity 0 items never rotate.
  insert into public.daily_shop (cosmetic_id)
    select id from (
      select id, row_number() over (
        partition by type
        order by ln(greatest(random(), 1e-12)) / greatest(rarity, 0.00001) desc
      ) as rn
      from public.cosmetics
      where active and not is_default and not free and rarity > 0
    ) ranked
    where ranked.rn <= 6;
  update public.shop_state set rotation_ends_at = now() + interval '24 hours' where id = 1;
end;
$$;
select public.roll_daily_shop(); -- seed the first rotation now

-- Admin-only "reshuffle now" (the cron uses roll_daily_shop directly; this guards manual calls).
create or replace function public.admin_reshuffle() returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  perform public.roll_daily_shop();
end;
$$;

-- Rotation-aware purchase: you can only buy an item that's in the shop right now.
create or replace function public.buy_cosmetic(p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cost int; v_type text; v_free boolean; v_bal int; v_premium timestamptz;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', 'not signed in'); end if;
  select medal_cost, type, free into v_cost, v_type, v_free from public.cosmetics where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'unknown item'); end if;
  if v_free then return json_build_object('ok', false, 'error', 'that one is free'); end if;
  if exists (select 1 from public.entitlements where user_id = v_uid and cosmetic_id = p_id) then
    return json_build_object('ok', true, 'already', true);
  end if;
  if v_type = 'cloak' then
    -- Cloaks cost medals but are MEMBERS-ONLY to buy (and rotation-gated like everything else).
    select premium_until into v_premium from public.profiles where id = v_uid;
    if v_premium is null or v_premium <= now() then
      return json_build_object('ok', false, 'error', 'members only');
    end if;
  end if;
  if not exists (select 1 from public.daily_shop where cosmetic_id = p_id) then
    return json_build_object('ok', false, 'error', 'not in the shop right now');
  end if;
  select medals into v_bal from public.profiles where id = v_uid for update;
  if v_bal < v_cost then return json_build_object('ok', false, 'error', 'not enough medals'); end if;
  update public.profiles set medals = medals - v_cost where id = v_uid;
  insert into public.entitlements (user_id, cosmetic_id, cosmetic_type, source) values (v_uid, p_id, v_type, 'medals');
  insert into public.medal_ledger (user_id, delta, reason, ref) values (v_uid, -v_cost, 'spend', p_id);
  return json_build_object('ok', true, 'spent', v_cost);
end;
$$;

-- Roll every day at 00:00 UTC (requires the pg_cron extension to be enabled).
select cron.schedule('roll-daily-shop', '0 0 * * *', $$select public.roll_daily_shop();$$);
