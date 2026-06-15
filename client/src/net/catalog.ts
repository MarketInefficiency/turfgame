/**
 * Runtime cosmetics catalog, fetched from Supabase so admin-created items (and the 24h rotation)
 * show up live. It merges the three code "default" items with everything in the `cosmetics` table,
 * and tracks which ids are in today's rotation + when the rotation ends. Falls back to the built-in
 * shared catalog if Supabase is unreachable, so the shop is never empty.
 */
import { CAPITALS, CLOAKS, HAIRS, HATS, MEMBER_SWORD_ID, SHIRTS, SKINS, SWORDS, type CosmeticType } from "@territory/shared";
import { supabase } from "./supabase";

export interface ShopItem {
  id: string;
  type: CosmeticType;
  name: string;
  free: boolean;
  medalCost: number;
  color: string; // builtin skins/swords ("" = the random default skin)
  design: string | null; // builtin capital design id
  kind: "builtin" | "image";
  imageUrl: string | null;
  flareUrl: string | null; // sword tip flare texture (shown when the wielder is ganged by 2+)
  rarity: number; // daily rotation chance
  isDefault: boolean;
}

export interface Group {
  type: CosmeticType;
  label: string;
  items: ShopItem[];
}

const LABELS: Record<CosmeticType, string> = {
  skin: "Skins", hat: "Hats", hair: "Hair", shirt: "Shirts", capital: "Capitals", sword: "Swords", cloak: "Cloaks",
};
const TYPES: CosmeticType[] = ["skin", "hat", "hair", "shirt", "capital", "sword", "cloak"];

let index = new Map<string, ShopItem>(); // key `${type}:${id}`
let groupsCache: Group[] = [];
let rotation = new Set<string>();
let endsAt = 0;

/** The three "default" looks live in code (their id 'default' repeats per type). */
function codeDefaults(): ShopItem[] {
  return [
    { id: "default", type: "skin", name: SKINS[0]!.name, free: true, medalCost: 0, color: "", design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "capital", name: CAPITALS[0]!.name, free: true, medalCost: 0, color: "", design: "default", kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "sword", name: SWORDS[0]!.name, free: true, medalCost: 0, color: SWORDS[0]!.color, design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "cloak", name: "None", free: true, medalCost: 0, color: "", design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "hat", name: "None", free: true, medalCost: 0, color: "", design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "hair", name: "None", free: true, medalCost: 0, color: "", design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
    { id: "default", type: "shirt", name: "None", free: true, medalCost: 0, color: "", design: null, kind: "builtin", imageUrl: null, flareUrl: null, rarity: 1, isDefault: true },
  ];
}

/** The builtin hats/hair/shirts live in code (their SVG art is shared), so they show pre-seed. */
function codeWearables(): ShopItem[] {
  return [...HATS, ...HAIRS, ...SHIRTS]
    .filter((c) => c.id !== "default")
    .map((c) => ({
      id: c.id, type: c.type, name: c.name, free: c.free, medalCost: c.medalCost,
      color: c.color, design: c.design ?? null, kind: "builtin" as const, imageUrl: null, flareUrl: null,
      rarity: 0.5, isDefault: false,
    }));
}

/** Fallback catalog from the shared built-ins (used only if the DB can't be reached). */
function sharedFallback(): ShopItem[] {
  return [...SKINS, ...CAPITALS, ...SWORDS]
    .filter((c) => c.id !== "default")
    .map((c) => ({
      id: c.id, type: c.type, name: c.name, free: c.free, medalCost: c.medalCost,
      color: c.color, design: c.type === "capital" ? c.id : null,
      kind: "builtin" as const, imageUrl: null, flareUrl: null, rarity: 1, isDefault: false,
    }));
}

/**
 * The builtin members-only cloaks live in code (their SVG art is shared), so the shop shows them
 * even before the DB rows are seeded. The DB seed is still needed to BUY them (buy_cosmetic reads
 * price/type from the cosmetics table); a seeded row overrides this code entry.
 */
function codeCloaks(): ShopItem[] {
  return CLOAKS.filter((c) => c.id !== "default").map((c) => ({
    id: c.id, type: "cloak" as const, name: c.name, free: c.free, medalCost: c.medalCost,
    color: c.color, design: c.design ?? null, kind: "builtin" as const, imageUrl: null, flareUrl: null,
    rarity: 0, isDefault: false,
  }));
}

/**
 * The members-only Sovereign's Edge. Lives only in code (never a DB/shop row) with rarity 0 and a
 * dedicated flare texture, so it renders and can be equipped from the membership screen but never
 * appears in the shop or owned lists. The server allows it only for active members.
 */
function codeMemberSword(): ShopItem {
  const s = SWORDS.find((c) => c.id === MEMBER_SWORD_ID)!;
  return {
    id: s.id, type: "sword", name: s.name, free: false, medalCost: 0, color: s.color,
    design: null, kind: "builtin", imageUrl: null, flareUrl: "/flares/sovereign.png", rarity: 0, isDefault: false,
  };
}

function rebuild(dbItems: ShopItem[]): void {
  // Dedupe by type:id; DB items come last so a seeded row overrides the code builtin.
  const map = new Map<string, ShopItem>();
  for (const i of [...codeDefaults(), ...codeCloaks(), ...codeWearables(), codeMemberSword(), ...dbItems]) map.set(`${i.type}:${i.id}`, i);
  index = map;
  const merged = [...map.values()];
  groupsCache = TYPES.map((t) => ({ type: t, label: LABELS[t], items: merged.filter((i) => i.type === t) }));
}

interface CosmeticRow {
  id: string; type: string; name: string | null; medal_cost: number | null; free: boolean;
  rarity: number | null; kind: string | null; image_url: string | null; color: string | null;
  design: string | null; is_default: boolean; flare_url: string | null;
}

/** Load the catalog + today's rotation. Call once at boot (and re-call to refresh). */
export async function loadCatalog(): Promise<void> {
  if (!supabase) {
    rebuild(sharedFallback());
    return;
  }
  try {
    const [cos, roll, st] = await Promise.all([
      supabase.from("cosmetics").select("id,type,name,medal_cost,free,rarity,kind,image_url,color,design,is_default,flare_url").eq("active", true),
      supabase.from("daily_shop").select("cosmetic_id"),
      supabase.from("shop_state").select("rotation_ends_at").eq("id", 1).single(),
    ]);
    const db: ShopItem[] = ((cos.data as CosmeticRow[] | null) ?? [])
      .filter((r) => !r.is_default)
      .map((r) => ({
        id: r.id, type: r.type as CosmeticType, name: r.name ?? r.id, free: r.free,
        medalCost: r.medal_cost ?? 0, color: r.color ?? "", design: r.design,
        kind: r.kind === "image" ? "image" : "builtin", imageUrl: r.image_url,
        flareUrl: r.flare_url, rarity: Number(r.rarity ?? 0), isDefault: false,
      }));
    rebuild(db);
    rotation = new Set(((roll.data as { cosmetic_id: string }[] | null) ?? []).map((r) => r.cosmetic_id));
    const ra = (st.data as { rotation_ends_at: string } | null)?.rotation_ends_at;
    endsAt = ra ? Date.parse(ra) : 0;
  } catch {
    rebuild(sharedFallback());
  }
}

export function groups(): Group[] {
  return groupsCache;
}
export function byId(type: CosmeticType, id: string): ShopItem | undefined {
  return index.get(`${type}:${id}`);
}
export function canUse(type: CosmeticType, id: string, owned: ReadonlySet<string>): boolean {
  const c = byId(type, id);
  return c ? c.free || owned.has(id) : false;
}
/** In the Shop tab right now: free/default always, the rest only while rolled (6 per category).
 *  Cloaks rotate like everything else — membership only gates BUYING them. */
export function inShop(c: ShopItem): boolean {
  return c.free || c.isDefault || rotation.has(c.id);
}
export function rotationEndsAt(): number {
  return endsAt;
}

/** Map a raw rotation chance to a player-facing tier + colour. */
export function rarityTier(r: number): { name: string; color: string } {
  if (r >= 0.4) return { name: "Common", color: "#9fb0c3" };
  if (r >= 0.15) return { name: "Rare", color: "#4aa3ff" };
  if (r >= 0.04) return { name: "Epic", color: "#a96bff" };
  if (r >= 0.005) return { name: "Legendary", color: "#f2b63c" };
  return { name: "Mythic", color: "#ff5a52" };
}
