/**
 * Medals — the soft currency. Earned in tiny amounts on defeat (scaled to peak power), spent on
 * cosmetics. Balance is server-authoritative (see the Supabase award/spend functions); this module
 * just holds the shared icon + the earn formula so client and server agree.
 */
import { CONFIG } from "./config.js";

/** Custom medal icon (gold star-medallion on a ribbon) — used wherever a medal count is shown. */
export const MEDAL_SVG =
  `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<path d="M9.4 2 L11 8.6 L8 8.6 Z" fill="#4f7cff"/>` +
  `<path d="M14.6 2 L16 8.6 L13 8.6 Z" fill="#ff5a52"/>` +
  `<circle cx="12" cy="15" r="7" fill="#f2c14e" stroke="#9a6b1a" stroke-width="1.4"/>` +
  `<circle cx="12" cy="15" r="4.8" fill="none" stroke="#d8a23a" stroke-width="0.8"/>` +
  `<polygon points="12,11.6 12.9,13.8 15.2,14 13.4,15.5 14,17.8 12,16.5 10,17.8 10.6,15.5 8.8,14 11.1,13.8" fill="#9a6b1a"/>` +
  `</svg>`;

/** Medals awarded for a defeat at the given peak power (lean economy; tune via the divisor). */
export function medalsForPower(peakPower: number): number {
  return Math.floor(Math.max(0, peakPower) / CONFIG.MEDAL_DEFEAT_DIVISOR);
}

/** A purchasable medal bundle. Bigger packs give more medals per dollar (see packSavings). */
export interface MedalPack {
  id: string;
  medals: number;
  priceUsd: number;
}

export const MEDAL_PACKS: MedalPack[] = [
  { id: "pack_500", medals: 500, priceUsd: 1.99 },
  { id: "pack_1400", medals: 1400, priceUsd: 4.99 },
  { id: "pack_3200", medals: 3200, priceUsd: 9.99 },
  { id: "pack_7000", medals: 7000, priceUsd: 19.99 },
  { id: "pack_16000", medals: 16000, priceUsd: 39.99 },
];

/** Percent saved on price-per-medal versus the smallest pack (0 for the base pack). */
export function packSavings(pack: MedalPack): number {
  const base = MEDAL_PACKS[0]!;
  const baseRate = base.medals / base.priceUsd;
  const rate = pack.medals / pack.priceUsd;
  return Math.max(0, Math.round((1 - baseRate / rate) * 100));
}

/** Premium subscription + the one-time ad-removal — the upsells on the Premium screen. */
export const PREMIUM = {
  priceUsd: 15,
  monthlyMedals: 2000,
  perks: [
    "No popup ads",
    "2,000 medals every month",
    "Experimental game modes",
    "Host private lobbies",
    "Exclusive special sword",
  ],
} as const;

export const REMOVE_ADS = {
  priceUsd: 14.99,
  bonusMedals: 3000,
} as const;
