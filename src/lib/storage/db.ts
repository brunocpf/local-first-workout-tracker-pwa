import Dexie, { type EntityTable } from "dexie";
import type { Exercise, Program, Routine, UserSettings, WorkoutSession } from "#lib/types";

// The app is served from github.io, whose IndexedDB namespace is shared by every project site of
// the same user (brunocpf.github.io). The name must stay app-specific, unique and STABLE: renaming
// it later would silently strand existing user data in the old database.
export const DB_NAME = "workout-tracker";

export const SETTINGS_KEY = "settings";
export type StoredSettings = UserSettings & { key: typeof SETTINGS_KEY };

export class AppDB extends Dexie {
  exercises!: EntityTable<Exercise, "id">;
  programs!: EntityTable<Program, "id">;
  routines!: EntityTable<Routine, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  settings!: EntityTable<StoredSettings, "key">;

  constructor(name = DB_NAME) {
    super(name);
    // Changing version(1) in place was fine only because no user data existed yet.
    // From now on NEVER edit a shipped version: add `this.version(n + 1).stores({ ...changed tables })`
    // (+ `.upgrade(tx => ...)` to transform existing rows), never drop data, and add a fixture test
    // in tests/migrations.test.ts. See docs/data-model.md "Migrations".
    this.version(1).stores({
      exercises: "id, name, *aliases, isCustom, archivedAt",
      programs: "id, name",
      routines: "id, programId, folderId",
      sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds",
      settings: "key",
    });
  }
}

export const db = new AppDB();
