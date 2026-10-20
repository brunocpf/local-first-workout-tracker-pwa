import Dexie, { type EntityTable } from "dexie";
import type { Exercise, Program, Routine, WorkoutSession } from "#lib/types";

export class AppDB extends Dexie {
  exercises!: EntityTable<Exercise, "id">;
  programs!: EntityTable<Program, "id">;
  routines!: EntityTable<Routine, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;

  constructor(name = "app") {
    super(name);
    // Explicit versions only; never drop user data. See docs/data-model.md.
    this.version(1).stores({
      exercises: "id, name, *aliases, isCustom, archivedAt",
      programs: "id, name",
      routines: "id, programId, folderId",
      sessions: "id, status, startedAt, routineId",
    });
  }
}

export const db = new AppDB();
