import { backupV2, BACKUP_VERSION, type BackupV2 } from "#lib/backup/format";
import { SEED_EXERCISES_BY_ID } from "#lib/catalog/seed";
import { db as defaultDb, SETTINGS_KEY, type AppDB } from "#lib/storage/db";
import { DEFAULT_SETTINGS } from "#lib/storage/settings";
import type { Exercise, UserSettings } from "#lib/types";

export const APP_NAME = "workout-tracker";
// Keep in sync with package.json `version` (no build-time version plumbing exists yet).
export const APP_VERSION = "0.0.0";

type BuiltinState = BackupV2["data"]["builtinExerciseState"][number];

/** Only what the user changed on a built-in exercise; null if nothing is worth saving. */
function builtinState(row: Exercise): BuiltinState | null {
  const seedAliases = new Set(SEED_EXERCISES_BY_ID.get(row.id)?.aliases ?? []);
  const aliases = row.aliases.filter((a) => !seedAliases.has(a));
  const state: BuiltinState = { id: row.id };
  if (row.favorite !== undefined) state.favorite = row.favorite;
  if (row.archivedAt !== undefined) state.archivedAt = row.archivedAt;
  if (aliases.length) state.aliases = aliases;
  return Object.keys(state).length > 1 ? state : null;
}

/** Reads every table in ONE read transaction (a consistent snapshot) and returns a validated backup. */
export async function buildBackup(
  {
    now = new Date(),
    appVersion = APP_VERSION,
  }: { now?: Date; appVersion?: string } = {},
  database: AppDB = defaultDb,
): Promise<BackupV2> {
  const { exercises, programs, routines, sessions, settings, measurements } =
    await database.transaction(
      "r",
      [
        database.exercises,
        database.programs,
        database.routines,
        database.sessions,
        database.settings,
        database.measurements,
      ],
      async () => ({
        exercises: await database.exercises.toArray(),
        programs: await database.programs.toArray(),
        routines: await database.routines.toArray(),
        sessions: await database.sessions.toArray(),
        settings: await database.settings.get(SETTINGS_KEY),
        measurements: await database.measurements.orderBy("measuredAt").toArray(),
      }),
    );
  const { key: _key, ...storedSettings } = settings ?? { key: SETTINGS_KEY };
  const mergedSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
  };

  const backup = {
    backupVersion: BACKUP_VERSION,
    app: { name: APP_NAME, version: appVersion },
    exportedAt: now.toISOString(),
    data: {
      customExercises: exercises.filter((e) => e.isCustom),
      builtinExerciseState: exercises
        .filter((e) => !e.isCustom)
        .map(builtinState)
        .filter((s): s is BuiltinState => s !== null),
      programs,
      routines,
      // `exerciseIds` is a derived index; restore recomputes it.
      sessions: sessions.map(({ exerciseIds: _ids, ...s }) => s),
      settings: mergedSettings,
      measurements,
    },
  };
  // Parsing also strips unknown keys; failing here beats writing a file restore would reject.
  return backupV2.parse(backup);
}

export function serializeBackup(backup: BackupV2): Blob {
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

/** `workout-backup-YYYY-MM-DD.json`, using the device's local date. */
export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `workout-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
