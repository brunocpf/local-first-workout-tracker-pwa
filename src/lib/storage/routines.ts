import { newId } from "#lib/ids";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import type { Program, Routine } from "#lib/types";

// Routine and program repository. Membership lives only on the routine (`programId` + `programOrder`),
// see docs/data-model.md. Sessions are never read or written here: history is self-describing.

export type ProgramWithRoutines = { program: Program; routines: Routine[] };
export type RoutinesGrouped = { programs: ProgramWithRoutines[]; standalone: Routine[] };

/** Deep-copy into plain JSON data so `$state` proxies from components can be written to Dexie. */
const toPlain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const orderOf = (r: Routine) => r.programOrder ?? Number.MAX_SAFE_INTEGER;
const byProgramOrder = (a: Routine, b: Routine) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Programs with their routines (sorted by `programOrder`) plus the standalone routines, both sorted by name.
 * A routine whose `programId` matches no stored program is listed as standalone so it is never hidden.
 */
export async function listRoutinesGrouped(database: AppDB = defaultDb): Promise<RoutinesGrouped> {
  return database.transaction("r", database.programs, database.routines, async () => {
    const [programs, routines] = await Promise.all([database.programs.toArray(), database.routines.toArray()]);
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
    };
  });
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
 * prescribed sets, and the name suffix " (copy)".
 */
export async function duplicateRoutine(id: string, database: AppDB = defaultDb): Promise<Routine> {
  return database.transaction("rw", database.routines, async () => {
    const source = await database.routines.get(id);
    if (!source) throw new Error(`Routine ${id} not found`);
    const now = new Date().toISOString();
    const { programId: _programId, programOrder: _programOrder, ...rest } = toPlain(source);
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
