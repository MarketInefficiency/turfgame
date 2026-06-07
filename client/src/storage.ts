/**
 * Client-side persistence (ui-ux.md §5). The player's name survives across sessions
 * and is pre-filled on the start screen — including after death (M3). localStorage is
 * fine here: this is a real web app, not a sandboxed artifact.
 */
const NAME_KEY = "territory.name";

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
