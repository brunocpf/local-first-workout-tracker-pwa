import { newId } from "#lib/ids";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import type { Program, Routine, RoutineFolder } from "#lib/types";

// Routine, program and folder repository. Membership lives only on the routine (`programId` + `programOrder`,
// `folderId`), see docs/data-model.md. Sessions are never read or written here: history is self-describing.

export type ProgramWithRoutines = { program: Program; routines: Routine[] };
export type RoutinesGrouped = { programs: ProgramWithRoutines[]; standalone: Routine[]; folders: RoutineFolder[] };
export type FolderWithRoutines = { folder: RoutineFolder; routines: Routine[] };

/** Same bound as the backup schema's names, so an export never fails on a folder name. */
export const FOLDER_NAME_MAX = 200;

/** Deep-copy into plain JSON data so `$state` proxies from components can be written to Dexie. */
const toPlain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const orderOf = (r: Routine) => r.programOrder ?? Number.MAX_SAFE_INTEGER;
const byProgramOrder = (a: Routine, b: Routine) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Programs with their routines (sorted by `programOrder`) plus the standalone routines (every routine not in a
 * program, whatever its folder) and the folders, all sorted by name. A routine whose `programId` matches no stored
 * program is listed as standalone so it is never hidden. `groupByFolder` splits `standalone` by folder.
 */
export async function listRoutinesGrouped(database: AppDB = defaultDb): Promise<RoutinesGrouped> {
  return database.transaction("r", database.programs, database.routines, database.folders, async () => {
    const [programs, routines, folders] = await Promise.all([
      database.programs.toArray(),
      database.routines.toArray(),
      database.folders.toArray(),
    ]);
    const programIds = new Set(programs.map((p) => p.id));
    const members = new Map<string, Routine[]>();
    const standalone: Routine[] = [];
    for (const r of routines) {
      if (r.programId !== undefined && programIds.has(r.programId)) {
        const list = members.get(r.programId) ?? [];
        list.push(r);
        members.set(r.programId, list);
      } else {
        standalone.push(r);
      }
    }
    return {
      programs: programs
        .sort(byName)
        .map((program) => ({ program, routines: (members.get(program.id) ?? []).sort(byProgramOrder) })),
      standalone: standalone.sort(byName),
      folders: folders.sort(byName),
    };
  });
}

/**
 * Splits the standalone routines by folder: every folder (empty ones too, so they can be renamed or deleted)
 * in `grouped.folders` order, and the routines in no folder. A `folderId` that matches no folder counts as
 * no folder, so the routine is never hidden. Routines in a program stay under their program.
 */
export function groupByFolder({ standalone, folders }: RoutinesGrouped): {
  folders: FolderWithRoutines[];
  unfiled: Routine[];
} {
  const members = new Map(folders.map((f) => [f.id, [] as Routine[]]));
  const unfiled: Routine[] = [];
  for (const r of standalone) {
    const list = r.folderId === undefined ? undefined : members.get(r.folderId);
    if (list) list.push(r);
    else unfiled.push(r);
  }
  return { folders: folders.map((folder) => ({ folder, routines: members.get(folder.id)! })), unfiled };
}

/**
 * Home quick-start order: favorite routines first (by name), then the rest as listed (standalone routines,
 * then each program's routines in order).
 */
export function quickStartRoutines({ programs, standalone }: RoutinesGrouped, max: number): Routine[] {
  const all = [...standalone, ...programs.flatMap((p) => p.routines)];
  const favorites = all.filter((r) => r.favorite).sort(byName);
  return [...favorites, ...all.filter((r) => !r.favorite)].slice(0, max);
}

export async function getRoutine(id: string, database: AppDB = defaultDb): Promise<Routine | undefined> {
  return database.routines.get(id);
}

export async function getProgram(id: string, database: AppDB = defaultDb): Promise<Program | undefined> {
  return database.programs.get(id);
}

/** Writes a plain copy of the routine and bumps `updatedAt`. Sessions are not touched. */
export async function saveRoutine(routine: Routine, database: AppDB = defaultDb): Promise<Routine> {
  const saved: Routine = { ...toPlain(routine), updatedAt: new Date().toISOString() };
  await database.routines.put(saved);
  return saved;
}

/**
 * Copies a routine as a STANDALONE routine (no program membership, so it can't collide with a
 * `programOrder` or a schedule). The copy gets fresh ids for the routine, its exercises and their
 * prescribed sets, and the name suffix " (copy)". It stays in the same folder but is not a favorite.
 */
export async function duplicateRoutine(id: string, database: AppDB = defaultDb): Promise<Routine> {
  return database.transaction("rw", database.routines, async () => {
    const source = await database.routines.get(id);
    if (!source) throw new Error(`Routine ${id} not found`);
    const now = new Date().toISOString();
    const { programId: _programId, programOrder: _programOrder, favorite: _favorite, ...rest } = toPlain(source);
    const copy: Routine = {
      ...rest,
      id: newId(),
      name: `${source.name} (copy)`,
      exercises: rest.exercises.map((e) => ({
        ...e,
        id: newId(),
        prescribedSets: e.prescribedSets.map((s) => ({ ...s, id: newId() })),
      })),
      createdAt: now,
      updatedAt: now,
    };
    await database.routines.add(copy);
    return copy;
  });
}

/** Deletes a routine and removes it from its program's weekly schedule. Sessions are untouched (history keeps its snapshots). */
export async function deleteRoutine(id: string, database: AppDB = defaultDb): Promise<void> {
  await database.transaction("rw", database.routines, database.programs, async () => {
    const routine = await database.routines.get(id);
    if (!routine) return;
    await database.routines.delete(id);
    if (routine.programId === undefined) return;
    const program = await database.programs.get(routine.programId);
    if (!program?.schedule) return;
    const days = program.schedule.days.filter((d) => d.routineId !== id);
    if (days.length === program.schedule.days.length) return;
    await database.programs.put({
      ...program,
      schedule: { ...program.schedule, days },
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Deletes a program. By default its routines become standalone (membership cleared, `updatedAt` bumped);
 * with `deleteRoutines: true` they are deleted too. Sessions are untouched.
 */
export async function deleteProgram(
  id: string,
  { deleteRoutines = false }: { deleteRoutines?: boolean } = {},
  database: AppDB = defaultDb,
): Promise<void> {
  await database.transaction("rw", database.programs, database.routines, async () => {
    const members = await database.routines.where("programId").equals(id).toArray();
    const now = new Date().toISOString();
    if (deleteRoutines) {
      await database.routines.bulkDelete(members.map((r) => r.id));
    } else {
      await database.routines.bulkPut(
        members.map(({ programId: _programId, programOrder: _programOrder, ...r }) => ({ ...r, updatedAt: now })),
      );
    }
    await database.programs.delete(id);
  });
}

/** Creates an empty program. The name is trimmed; an empty name is rejected. */
export async function createProgram(name: string, database: AppDB = defaultDb): Promise<Program> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Program name is required");
  const now = new Date().toISOString();
  const program: Program = { id: newId(), name: trimmed, schemaVersion: 1, createdAt: now, updatedAt: now };
  await database.programs.add(program);
  return program;
}

export async function renameProgram(id: string, name: string, database: AppDB = defaultDb): Promise<Program> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Program name is required");
  return database.transaction("rw", database.programs, async () => {
    const program = await database.programs.get(id);
    if (!program) throw new Error(`Program ${id} not found`);
    const renamed = { ...program, name: trimmed, updatedAt: new Date().toISOString() };
    await database.programs.put(renamed);
    return renamed;
  });
}

/**
 * Adds a routine to a program (appended at the end) or, with no `programId`, makes it standalone. Moving a
 * routine out of its previous program also removes it from that program's weekly schedule. Re-adding to the
 * same program is a no-op.
 */
export async function setRoutineProgram(
  routineId: string,
  programId?: string,
  database: AppDB = defaultDb,
): Promise<void> {
  await database.transaction("rw", database.programs, database.routines, async () => {
    const routine = await database.routines.get(routineId);
    if (!routine) throw new Error(`Routine ${routineId} not found`);
    if (routine.programId === programId) return;
    const now = new Date().toISOString();
    if (programId !== undefined && !(await database.programs.get(programId))) {
      throw new Error(`Program ${programId} not found`);
    }
    const { programId: previous, programOrder: _programOrder, ...rest } = routine;
    if (previous !== undefined) {
      const old = await database.programs.get(previous);
      if (old?.schedule) {
        const days = old.schedule.days.filter((d) => d.routineId !== routineId);
        if (days.length !== old.schedule.days.length) {
          await database.programs.put({ ...old, schedule: { ...old.schedule, days }, updatedAt: now });
        }
      }
    }
    if (programId === undefined) {
      await database.routines.put({ ...rest, updatedAt: now });
      return;
    }
    const members = await database.routines.where("programId").equals(programId).toArray();
    const next = members.reduce((max, r) => Math.max(max, r.programOrder ?? -1), -1) + 1;
    await database.routines.put({ ...rest, programId, programOrder: next, updatedAt: now });
  });
}

/**
 * Sets `programOrder` to the position in `routineIds`. The list must contain exactly the program's current
 * routines (no extras, no missing, no duplicates) so a stale view can't drop or adopt routines.
 */
export async function reorderProgramRoutines(
  programId: string,
  routineIds: string[],
  database: AppDB = defaultDb,
): Promise<void> {
  await database.transaction("rw", database.routines, async () => {
    const members = await database.routines.where("programId").equals(programId).toArray();
    const ids = new Set(routineIds);
    if (ids.size !== routineIds.length || ids.size !== members.length || members.some((r) => !ids.has(r.id))) {
      throw new Error("Routine list does not match the program's routines");
    }
    const byId = new Map(members.map((r) => [r.id, r]));
    const now = new Date().toISOString();
    await database.routines.bulkPut(routineIds.map((id, i) => ({ ...byId.get(id)!, programOrder: i, updatedAt: now })));
  });
}

/** Marks a routine as a favorite (listed first in Home quick-start) or clears it. */
export async function setRoutineFavorite(routineId: string, favorite: boolean, database: AppDB = defaultDb): Promise<void> {
  await database.transaction("rw", database.routines, async () => {
    const routine = await database.routines.get(routineId);
    if (!routine) throw new Error(`Routine ${routineId} not found`);
    if (!!routine.favorite === favorite) return;
    const { favorite: _favorite, ...rest } = routine;
    await database.routines.put({ ...rest, ...(favorite ? { favorite: true } : {}), updatedAt: new Date().toISOString() });
  });
}

const folderName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required");
  if (trimmed.length > FOLDER_NAME_MAX) throw new Error(`Folder name is longer than ${FOLDER_NAME_MAX} characters`);
  return trimmed;
};

export async function listFolders(database: AppDB = defaultDb): Promise<RoutineFolder[]> {
  return (await database.folders.toArray()).sort(byName);
}

/** Creates an empty folder. The name is trimmed; an empty or overlong name is rejected. */
export async function createFolder(name: string, database: AppDB = defaultDb): Promise<RoutineFolder> {
  const trimmed = folderName(name);
  const now = new Date().toISOString();
  const folder: RoutineFolder = { id: newId(), name: trimmed, createdAt: now, updatedAt: now };
  await database.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string, database: AppDB = defaultDb): Promise<RoutineFolder> {
  const trimmed = folderName(name);
  return database.transaction("rw", database.folders, async () => {
    const folder = await database.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);
    const renamed = { ...folder, name: trimmed, updatedAt: new Date().toISOString() };
    await database.folders.put(renamed);
    return renamed;
  });
}

/** Deletes a folder in one transaction; its routines are kept and move to no folder (`updatedAt` bumped). */
export async function deleteFolder(id: string, database: AppDB = defaultDb): Promise<void> {
  await database.transaction("rw", database.folders, database.routines, async () => {
    const members = await database.routines.where("folderId").equals(id).toArray();
    const now = new Date().toISOString();
    await database.routines.bulkPut(members.map(({ folderId: _folderId, ...r }) => ({ ...r, updatedAt: now })));
    await database.folders.delete(id);
  });
}

/** Moves a routine into a folder or, with no `folderId`, out of any folder. Program membership is unchanged. */
export async function setRoutineFolder(routineId: string, folderId?: string, database: AppDB = defaultDb): Promise<void> {
  await database.transaction("rw", database.folders, database.routines, async () => {
    const routine = await database.routines.get(routineId);
    if (!routine) throw new Error(`Routine ${routineId} not found`);
    if (routine.folderId === folderId) return;
    if (folderId !== undefined && !(await database.folders.get(folderId))) throw new Error(`Folder ${folderId} not found`);
    const { folderId: _previous, ...rest } = routine;
    await database.routines.put({ ...rest, ...(folderId !== undefined ? { folderId } : {}), updatedAt: new Date().toISOString() });
  });
}
