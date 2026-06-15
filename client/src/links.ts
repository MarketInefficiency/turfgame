/**
 * Donation link (Ko-fi). After you create your Ko-fi page, put its URL here — or set
 * VITE_KOFI_URL in client/.env to override at build time. Format: https://ko-fi.com/<yourname>
 */
export const KOFI_URL: string = import.meta.env.VITE_KOFI_URL ?? "https://ko-fi.com/turfgameio";

/**
 * App store links for the home footer. Left empty until each app is approved; while empty the
 * badge shows a "Coming soon" state instead of a dead link. Fill the URL here (or set
 * VITE_APP_STORE_URL / VITE_PLAY_STORE_URL at build time) once the listing is live.
 */
export const APP_STORE_URL: string = import.meta.env.VITE_APP_STORE_URL ?? "";
export const PLAY_STORE_URL: string = import.meta.env.VITE_PLAY_STORE_URL ?? "";
