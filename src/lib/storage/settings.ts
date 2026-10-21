import type { UserSettings } from "#lib/types";
import { db, SETTINGS_KEY } from "#lib/storage/db";
import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";

export const DEFAULT_SETTINGS: UserSettings = {
  weightUnit: "kg",
  lengthUnit: "cm",
  defaultRestSeconds: 90,
  autoStartRestTimer: true,
  timerSound: true,
  previousValuesMode: "exercise",
  effortInput: "off",
  weekStartsOn: 1,
  theme: "system",
  backupReminderDays: 14,
  backupReminderSessions: 10,
  barWeightKg: DEFAULT_BAR_KG,
  plateInventory: DEFAULT_PLATE_INVENTORY,
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
