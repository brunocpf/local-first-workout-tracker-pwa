import { SEED_EXERCISES } from "#lib/catalog/seed";
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
