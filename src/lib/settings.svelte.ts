import type { UserSettings } from "#lib/types";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "#lib/storage/settings";

export const THEME_STORAGE_KEY = "workout-tracker:theme";
const THEME_COLORS = { light: "#f4f4f5", dark: "#0b0b0f" } as const;

/** Reactive settings; starts as defaults until `initSettings()` resolves. */
export const settings: UserSettings = $state({ ...DEFAULT_SETTINGS });

/** Sets `data-theme` (removed for system), mirrors it to localStorage and syncs the theme-color metas. */
export function applyTheme(theme: UserSettings["theme"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage unavailable: the OS default still applies on next load
  }

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = theme === "system" ? (meta.media.includes("dark") ? "dark" : "light") : theme;
    meta.content = THEME_COLORS[scheme];
  }
}

export async function initSettings() {
  try {
    Object.assign(settings, await getSettings());
  } catch (error) {
    console.error("Failed to load settings", error);
  }
  applyTheme(settings.theme);
}

/** Optimistic: the UI updates first, then the change is written through to Dexie. */
export async function updateSettings(patch: Partial<UserSettings>) {
  const plain = $state.snapshot(patch) as Partial<UserSettings>;
  Object.assign(settings, plain);
  if (plain.theme) applyTheme(plain.theme);
  await saveSettings(plain);
}
