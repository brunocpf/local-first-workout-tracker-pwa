import type { UserSettings } from "#lib/types";
import { db, SETTINGS_KEY } from "#lib/storage/db";

export const DEFAULT_SETTINGS: UserSettings = {
  weightUnit: "kg",
  defaultRestSeconds: 90,
  autoStartRestTimer: true,
  previousValuesMode: "exercise",
  weekStartsOn: 1,
  theme: "system",
};

/** Stored settings merged over defaults, so fields added later get a value for existing users. */
export async function getSettings(): Promise<UserSettings> {
  const { key: _key, ...stored } = (await db.settings.get(SETTINGS_KEY)) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Read-modify-write in one transaction, so overlapping saves (rapid changes, other tabs) can't overwrite each other's fields. */
export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return db.transaction("rw", db.settings, async () => {
    const next = { ...(await getSettings()), ...JSON.parse(JSON.stringify(patch)) };
    await db.settings.put({ ...next, key: SETTINGS_KEY });
    return next;
  });
}
