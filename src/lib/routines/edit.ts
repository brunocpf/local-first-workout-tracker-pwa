// Pure in-place mutators behind the routine builder (PRD §7.2). Like the logger helpers they work on
// Svelte `$state` proxies, never touch Dexie and never touch sessions (history keeps its own snapshots).
import { newId } from "#lib/ids";
import type { PrescribedSet, Routine, RoutineExercise } from "#lib/types";

export type RoutineDefaults = { sets: number; repRange: [number, number]; restSeconds?: number };
export const ROUTINE_EXERCISE_DEFAULTS: RoutineDefaults = { sets: 3, repRange: [8, 12] };

export type RoutineIssue = { path: string; message: string };
export type RoutineValidation = { errors: RoutineIssue[]; warnings: RoutineIssue[] };

const clamp = (i: number, length: number) => Math.max(0, Math.min(i, length));

export function newRoutine(name: string, now: Date = new Date()): Routine {
  const iso = now.toISOString();
  return { id: newId(), name: name.trim(), exercises: [], createdAt: iso, updatedAt: iso };
}

export function renameRoutine(routine: Routine, name: string): void {
  routine.name = name.trim();
}

export function addRoutineExercise(
  routine: Routine,
  exerciseId: string,
  defaults: Partial<RoutineDefaults> = {},
): RoutineExercise {
  const d = { ...ROUTINE_EXERCISE_DEFAULTS, ...defaults };
  const re: RoutineExercise = {
    id: newId(),
    exerciseId,
    prescribedSets: Array.from({ length: d.sets }, () => ({
      id: newId(),
      type: "normal" as const,
      repRange: [d.repRange[0], d.repRange[1]] as [number, number],
    })),
  };
  if (d.restSeconds !== undefined) re.restSeconds = d.restSeconds;
  routine.exercises.push(re);
  return re;
}

export function removeRoutineExercise(routine: Routine, id: string): RoutineExercise | undefined {
  const index = routine.exercises.findIndex((e) => e.id === id);
  if (index < 0) return undefined;
  return routine.exercises.splice(index, 1)[0];
}

export function moveRoutineExercise(routine: Routine, from: number, to: number): boolean {
  if (!Number.isInteger(from) || from < 0 || from >= routine.exercises.length) return false;
  const [e] = routine.exercises.splice(from, 1);
  routine.exercises.splice(clamp(to, routine.exercises.length), 0, e);
  return true;
}

/** Swaps the exercise but keeps prescription, rest, notes and superset membership. */
export function replaceRoutineExercise(routine: Routine, id: string, exerciseId: string): boolean {
  const re = routine.exercises.find((e) => e.id === id);
  if (!re) return false;
  re.exerciseId = exerciseId;
  return true;
}

/** Grows by appending copies of the last set (fresh ids) or trims from the end. */
export function setSetCount(re: RoutineExercise, n: number): void {
  const count = Math.max(0, Math.floor(n));
  if (count < re.prescribedSets.length) {
    re.prescribedSets.splice(count);
    return;
  }
  while (re.prescribedSets.length < count) {
    const last = re.prescribedSets.at(-1);
    re.prescribedSets.push(
      last ? { ...$snap(last), id: newId() } : { id: newId(), type: "normal", repRange: [8, 12] },
    );
  }
}

// `structuredClone` can't clone Svelte proxies; JSON round-trip is safe for plain prescription data.
function $snap<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function updatePrescribedSet(
  re: RoutineExercise,
  setId: string,
  patch: Partial<Omit<PrescribedSet, "id">>,
): boolean {
  const set = re.prescribedSets.find((s) => s.id === setId);
  if (!set) return false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (set as Record<string, unknown>)[k];
    else (set as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
  }
  return true;
}

export function setRest(re: RoutineExercise, restSeconds: number | undefined): void {
  if (restSeconds === undefined) delete re.restSeconds;
  else re.restSeconds = restSeconds;
}

export function setNotes(re: RoutineExercise, notes: string | undefined): void {
  if (notes === undefined || notes.trim() === "") delete re.notes;
  else re.notes = notes;
}

/**
 * Puts the given exercises into one superset group and makes them adjacent (members follow the first
 * member, keeping the order given). `groupId` undefined removes the exercises from their group; groups
 * left with a single member are dissolved.
 */
export function setSupersetGroup(routine: Routine, exerciseIds: string[], groupId: string | undefined): void {
  const members = exerciseIds
    .map((id) => routine.exercises.find((e) => e.id === id))
    .filter((e): e is RoutineExercise => !!e);
  if (members.length === 0) return;
  if (groupId === undefined) {
    for (const m of members) delete m.supersetGroupId;
  } else {
    for (const m of members) m.supersetGroupId = groupId;
    const rest = members.slice(1);
    routine.exercises = routine.exercises.filter((e) => !rest.includes(e));
    routine.exercises.splice(routine.exercises.indexOf(members[0]) + 1, 0, ...rest);
  }
  dissolveSingletons(routine);
}

function dissolveSingletons(routine: Routine): void {
  const counts = new Map<string, number>();
  for (const e of routine.exercises) {
    if (e.supersetGroupId) counts.set(e.supersetGroupId, (counts.get(e.supersetGroupId) ?? 0) + 1);
  }
  for (const e of routine.exercises) {
    if (e.supersetGroupId && counts.get(e.supersetGroupId)! < 2) delete e.supersetGroupId;
  }
}

export function validateRoutine(routine: Routine): RoutineValidation {
  const errors: RoutineIssue[] = [];
  const warnings: RoutineIssue[] = [];
  if (routine.name.trim() === "") errors.push({ path: "name", message: "Name is required." });
  if (routine.exercises.length === 0) warnings.push({ path: "exercises", message: "Routine has no exercises." });
  const positive = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v > 0);
  routine.exercises.forEach((e, i) => {
    const p = `exercises[${i}]`;
    if (!positive(e.restSeconds)) errors.push({ path: `${p}.restSeconds`, message: "Rest must be positive." });
    if (e.prescribedSets.length === 0) warnings.push({ path: `${p}.prescribedSets`, message: "No sets." });
    e.prescribedSets.forEach((s, j) => {
      const sp = `${p}.prescribedSets[${j}]`;
      if (s.repRange) {
        const [min, max] = s.repRange;
        if (!(min > 0) || !(max > 0)) errors.push({ path: `${sp}.repRange`, message: "Reps must be positive." });
        else if (min > max) errors.push({ path: `${sp}.repRange`, message: "Min reps exceed max reps." });
      }
      for (const key of ["targetWeight", "targetDurationSeconds", "targetDistance", "targetRpe"] as const) {
        if (!positive(s[key])) errors.push({ path: `${sp}.${key}`, message: "Value must be positive." });
      }
      if (s.targetRir !== undefined && !(s.targetRir >= 0)) {
        errors.push({ path: `${sp}.targetRir`, message: "RIR cannot be negative." });
      }
    });
  });
  return { errors, warnings };
}
