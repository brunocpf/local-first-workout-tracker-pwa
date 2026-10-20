import { SEED_EXERCISES, SEED_EXERCISES_BY_ID } from "#lib/catalog/seed";
import { newId } from "#lib/ids";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import type { Exercise, ExerciseType } from "#lib/types";

// Every function takes an optional database so tests can use a uniquely named one.
const seeding = new WeakMap<AppDB, Promise<void>>();

const union = (a: string[], b: string[]): string[] => [
  ...new Set([...a, ...b]),
];

/**
 * Upserts every seed exercise. Seed fields win, but user state on existing rows is kept:
 * `favorite`, `archivedAt`, and user-added aliases (union with the seed's). Never deletes.
 * Memoized per database; a failed attempt is retried on the next call.
 */
export function ensureCatalogSeeded(
  database: AppDB = defaultDb,
): Promise<void> {
  let p = seeding.get(database);
  if (!p) {
    p = seed(database).catch((err) => {
      seeding.delete(database);
      throw err;
    });
    seeding.set(database, p);
  }
  return p;
}

async function seed(database: AppDB): Promise<void> {
  await database.transaction("rw", database.exercises, async () => {
    const existing = new Map(
      (await database.exercises.bulkGet(SEED_EXERCISES.map((s) => s.id))).map(
        (r) => [r?.id, r],
      ),
    );
    const now = new Date().toISOString();
    const rows: Exercise[] = SEED_EXERCISES.map((s) => {
      const prev = existing.get(s.id);
      const row: Exercise = JSON.parse(
        JSON.stringify({ ...s, isCustom: false }),
      );
      row.aliases = union(s.aliases, prev?.aliases ?? []);
      row.createdAt = prev?.createdAt ?? now;
      row.updatedAt = prev ? prev.updatedAt : now;
      if (prev?.favorite !== undefined) row.favorite = prev.favorite;
      if (prev?.archivedAt !== undefined) row.archivedAt = prev.archivedAt;
      return row;
    });
    await database.exercises.bulkPut(rows);
  });
}

export async function listExercises(
  { includeArchived = false }: { includeArchived?: boolean } = {},
  database: AppDB = defaultDb,
): Promise<Exercise[]> {
  await ensureCatalogSeeded(database);
  const all = await database.exercises.toArray();
  return includeArchived ? all : all.filter((e) => !e.archivedAt);
}

export async function getExercise(
  id: string,
  database: AppDB = defaultDb,
): Promise<Exercise | undefined> {
  await ensureCatalogSeeded(database);
  return database.exercises.get(id);
}

/** Returns the found exercises in the order of `ids` (unknown ids are skipped). */
export async function getExercisesByIds(
  ids: string[],
  database: AppDB = defaultDb,
): Promise<Exercise[]> {
  await ensureCatalogSeeded(database);
  return (await database.exercises.bulkGet(ids)).filter(
    (e): e is Exercise => e !== undefined,
  );
}

export async function createCustomExercise(
  input: {
    name: string;
    exerciseType: ExerciseType;
    equipment?: string[];
    primaryMuscles?: string[];
    aliases?: string[];
  },
  database: AppDB = defaultDb,
): Promise<Exercise> {
  await ensureCatalogSeeded(database);
  const now = new Date().toISOString();
  const exercise: Exercise = {
    id: newId(),
    name: input.name.trim(),
    aliases: [...(input.aliases ?? [])],
    primaryMuscles: [...(input.primaryMuscles ?? [])],
    secondaryMuscles: [],
    equipment: [...(input.equipment ?? [])],
    exerciseType: input.exerciseType,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  };
  await database.exercises.add(exercise);
  return exercise;
}

async function patch(
  id: string,
  changes: (e: Exercise) => void,
  database: AppDB,
): Promise<void> {
  await ensureCatalogSeeded(database);
  await database.transaction("rw", database.exercises, async () => {
    const e = await database.exercises.get(id);
    if (!e) throw new Error(`Unknown exercise: ${id}`);
    changes(e);
    e.updatedAt = new Date().toISOString();
    await database.exercises.put(e);
  });
}

export const setFavorite = (
  id: string,
  favorite: boolean,
  database: AppDB = defaultDb,
): Promise<void> => patch(id, (e) => void (e.favorite = favorite), database);

export const setArchived = (
  id: string,
  archived: boolean,
  database: AppDB = defaultDb,
): Promise<void> =>
  patch(
    id,
    (e) => {
      if (archived) e.archivedAt = new Date().toISOString();
      else delete e.archivedAt;
    },
    database,
  );

/** Thrown when deleting a custom exercise that a session or routine still references. Callers should archive instead. */
export class ExerciseInUseError extends Error {
  constructor(public readonly exerciseId: string) {
    super(`Exercise ${exerciseId} is referenced by a session or routine; archive it instead`);
    this.name = "ExerciseInUseError";
  }
}

export type ExercisePatch = {
  name?: string;
  aliases?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string[];
  exerciseType?: ExerciseType;
  favorite?: boolean;
  archived?: boolean;
};

/**
 * Edits an exercise. Custom exercises accept every field. Built-ins accept only `favorite`, `archived`
 * and `aliases` (user aliases are unioned with the seed's, so seed aliases always stay).
 * Past sessions keep their own name and type snapshots, so editing never rewrites history.
 */
export async function updateCustomExercise(
  id: string,
  patch: ExercisePatch,
  database: AppDB = defaultDb,
): Promise<Exercise> {
  await ensureCatalogSeeded(database);
  return database.transaction("rw", database.exercises, async () => {
    const e = await database.exercises.get(id);
    if (!e) throw new Error(`Unknown exercise: ${id}`);
    if (!e.isCustom) {
      const rejected = (["name", "primaryMuscles", "secondaryMuscles", "equipment", "exerciseType"] as const).filter(
        (k) => patch[k] !== undefined,
      );
      if (rejected.length > 0) {
        throw new Error(`Built-in exercise ${id} cannot change ${rejected.join(", ")}`);
      }
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Exercise name cannot be empty");
      e.name = name;
    }
    if (patch.exerciseType !== undefined) e.exerciseType = patch.exerciseType;
    if (patch.primaryMuscles !== undefined) e.primaryMuscles = [...patch.primaryMuscles];
    if (patch.secondaryMuscles !== undefined) e.secondaryMuscles = [...patch.secondaryMuscles];
    if (patch.equipment !== undefined) e.equipment = [...patch.equipment];
    if (patch.aliases !== undefined) {
      const seedAliases = e.isCustom ? [] : (SEED_EXERCISES_BY_ID.get(id)?.aliases ?? []);
      e.aliases = union(seedAliases, [...new Set(patch.aliases)]);
    }
    if (patch.favorite !== undefined) e.favorite = patch.favorite;
    if (patch.archived !== undefined) {
      if (patch.archived) e.archivedAt ??= new Date().toISOString();
      else delete e.archivedAt;
    }
    e.updatedAt = new Date().toISOString();
    await database.exercises.put(e);
    return e;
  });
}

/** True if any session (index lookup on `exerciseIds`) or any routine (scan) uses the exercise. */
export async function isExerciseReferenced(id: string, database: AppDB = defaultDb): Promise<boolean> {
  const inSession = (await database.sessions.where("exerciseIds").equals(id).count()) > 0;
  if (inSession) return true;
  const inRoutine = (await database.routines.filter((r) => r.exercises.some((x) => x.exerciseId === id)).count()) > 0;
  return inRoutine;
}

/** Deletes a custom exercise that nothing references. Built-ins are never deleted; referenced ones must be archived. */
export async function deleteCustomExercise(id: string, database: AppDB = defaultDb): Promise<void> {
  await ensureCatalogSeeded(database);
  await database.transaction("rw", database.exercises, database.sessions, database.routines, async () => {
    const e = await database.exercises.get(id);
    if (!e) throw new Error(`Unknown exercise: ${id}`);
    if (!e.isCustom) throw new Error(`Built-in exercise ${id} cannot be deleted; archive it instead`);
    if (await isExerciseReferenced(id, database)) throw new ExerciseInUseError(id);
    await database.exercises.delete(id);
  });
}
