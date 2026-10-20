import { newId } from "#lib/ids";
import type { ProgramImportV1 } from "#lib/imports/programSchema";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import type { Exercise, ExerciseType, PrescribedSet, Program, Routine, RoutineExercise } from "#lib/types";

/** Keyed by exercise path, the same paths `unresolvedExercises` returns. References with a catalog id need no entry. */
export type ExerciseResolution =
  | { kind: "exercise"; exerciseId: string }
  | { kind: "create"; name: string; exerciseType: ExerciseType; equipment?: string }
  | { kind: "drop" };

export type ProgramDraft = {
  program: Program;
  routines: Routine[];
  /** Custom exercises to create together with the program. */
  newExercises: Exercise[];
  /** Paths of exercise references that still have no resolution; saving is refused while any remain. */
  unresolved: string[];
  warnings: string[];
};

type ImportSet = {
  setType?: PrescribedSet["type"];
  repRange?: [number, number];
  targetWeight?: number;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  rpe?: number;
  rir?: number;
};

const prescribed = (s: ImportSet): PrescribedSet => ({
  id: newId(),
  type: s.setType ?? "normal",
  ...(s.repRange && { repRange: [s.repRange[0], s.repRange[1]] as [number, number] }),
  ...(s.targetWeight !== undefined && { targetWeight: s.targetWeight }),
  ...(s.targetDurationSeconds !== undefined && { targetDurationSeconds: s.targetDurationSeconds }),
  ...(s.targetDistanceMeters !== undefined && { targetDistance: s.targetDistanceMeters }),
  ...(s.rpe !== undefined && { targetRpe: s.rpe }),
  ...(s.rir !== undefined && { targetRir: s.rir }),
});

/** Pure: turns a validated import plus the user's resolutions into domain entities with fresh ids. */
export function buildProgramDraft(
  data: ProgramImportV1,
  resolutions: Record<string, ExerciseResolution>,
  options: { programName?: string } = {},
): ProgramDraft {
  const now = new Date().toISOString();
  const p = data.program;
  const warnings: string[] = [];
  const unresolved: string[] = [];
  const newExercises: Exercise[] = [];
  const programId = newId();
  const routineIds = new Map<string, string>(); // file-local id -> new id
  const routines: Routine[] = [];

  p.routines.forEach((r, ri) => {
    const exercises: RoutineExercise[] = [];
    const groups = new Map<string, string>();
    r.exercises.forEach((e, ei) => {
      const path = `program.routines[${ri}].exercises[${ei}].exercise`;
      const res = resolutions[path];
      let exerciseId: string;
      if (res?.kind === "drop") {
        warnings.push(`${path}: exercise dropped`);
        return;
      } else if (res?.kind === "exercise") {
        exerciseId = res.exerciseId;
      } else if (res?.kind === "create") {
        exerciseId = newId();
        newExercises.push({
          id: exerciseId,
          name: res.name.trim(),
          aliases: [],
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: res.equipment ? [res.equipment] : [],
          exerciseType: res.exerciseType,
          isCustom: true,
          createdAt: now,
          updatedAt: now,
        });
      } else if (e.exercise.id !== undefined) {
        exerciseId = e.exercise.id;
      } else {
        unresolved.push(path);
        return;
      }
      let group: string | undefined;
      if (e.supersetGroup !== undefined) {
        group = groups.get(e.supersetGroup) ?? newId();
        groups.set(e.supersetGroup, group);
      }
      exercises.push({
        id: newId(),
        exerciseId,
        prescribedSets: e.setList ? e.setList.map(prescribed) : Array.from({ length: e.sets ?? 0 }, () => prescribed(e)),
        ...(e.restSeconds !== undefined && { restSeconds: e.restSeconds }),
        ...(e.notes !== undefined && { notes: e.notes }),
        ...(group !== undefined && { supersetGroupId: group }),
      });
    });

    if (exercises.length === 0 && !r.exercises.some((_, ei) => unresolved.includes(`program.routines[${ri}].exercises[${ei}].exercise`))) {
      warnings.push(`program.routines[${ri}]: routine "${r.name}" has no exercises left and was dropped`);
      return;
    }
    const id = newId();
    routineIds.set(r.id, id);
    routines.push({ id, programId, programOrder: routines.length, name: r.name, exercises, createdAt: now, updatedAt: now });
  });

  let schedule: Program["schedule"];
  if (p.schedule) {
    const days = p.schedule.days.flatMap((d) => {
      const routineId = routineIds.get(d.routine);
      if (routineId === undefined) {
        warnings.push(`program.schedule: ${d.day} removed because its routine was dropped`);
        return [];
      }
      return [{ day: d.day, routineId }];
    });
    if (days.length > 0) schedule = { type: "weekly", days };
  }

  const program: Program = {
    id: programId,
    name: options.programName?.trim() || p.name,
    ...(p.description !== undefined && { description: p.description }),
    ...(p.goal !== undefined && { goal: p.goal }),
    ...(p.experienceLevel !== undefined && { experienceLevel: p.experienceLevel }),
    ...(p.daysPerWeek !== undefined && { daysPerWeek: p.daysPerWeek }),
    ...(schedule && { schedule }),
    ...(p.source && { source: { ...p.source } }),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  return { program, routines, newExercises, unresolved, warnings };
}

/**
 * Writes the exercises, program and routines in one transaction: all or nothing.
 * Refuses while anything is unresolved or a referenced exercise does not exist.
 */
export async function saveProgramImport(draft: ProgramDraft, database: AppDB = defaultDb): Promise<void> {
  if (draft.unresolved.length > 0) throw new Error(`Unresolved exercises: ${draft.unresolved.join(", ")}`);
  if (draft.routines.length === 0) throw new Error("Nothing to save: no routines left");
  // Plain copy: drafts may have passed through `$state` proxies.
  const plain = JSON.parse(JSON.stringify(draft)) as ProgramDraft;
  await database.transaction("rw", database.exercises, database.programs, database.routines, async () => {
    const created = new Set(plain.newExercises.map((e) => e.id));
    const needed = [...new Set(plain.routines.flatMap((r) => r.exercises.map((e) => e.exerciseId)))].filter((id) => !created.has(id));
    const found = await database.exercises.bulkGet(needed);
    const missing = needed.filter((_, i) => found[i] === undefined);
    if (missing.length > 0) throw new Error(`Unknown exercises: ${missing.join(", ")}`);
    await database.exercises.bulkAdd(plain.newExercises);
    await database.programs.add(plain.program);
    await database.routines.bulkAdd(plain.routines);
  });
}
