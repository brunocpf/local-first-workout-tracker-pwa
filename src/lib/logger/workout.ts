// Pure mutation helpers for sessions (PRD §8.3, §8.5). They mutate the passed object in place so they
// work on Svelte `$state` proxies, return what they created/removed (for undo), and never touch Dexie.
import { newId } from "#lib/ids";
import type { Exercise, LoggedSet, PrescribedSet, SessionExercise, WorkoutSession } from "#lib/types";

export type RemovedExercise = { exercise: SessionExercise; index: number };
export type RemovedSet = { set: LoggedSet; index: number };
export type SetValues = Pick<LoggedSet, "weight" | "reps">;
export type SetPatch = Partial<Omit<LoggedSet, "id" | "completedAt">>;

const clamp = (i: number, length: number) => Math.max(0, Math.min(i, length));

/** Fresh, empty, uncompleted rows: one per prescribed set. */
export function setsFromPrescription(prescribed: readonly PrescribedSet[]): LoggedSet[] {
  return prescribed.map((p) => ({ id: newId(), prescribedSetId: p.id, type: p.type }));
}

export function createSessionExercise(
  exercise: Pick<Exercise, "id" | "name" | "exerciseType">,
  opts: { prescribedSets?: PrescribedSet[]; restSeconds?: number; supersetGroupId?: string; notes?: string } = {},
): SessionExercise {
  const se: SessionExercise = {
    id: newId(),
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    exerciseTypeSnapshot: exercise.exerciseType,
    sets: setsFromPrescription(opts.prescribedSets ?? []),
  };
  if (opts.prescribedSets) se.prescribedSets = structuredClone(opts.prescribedSets);
  if (opts.restSeconds !== undefined) se.restSeconds = opts.restSeconds;
  if (opts.supersetGroupId !== undefined) se.supersetGroupId = opts.supersetGroupId;
  if (opts.notes !== undefined) se.notes = opts.notes;
  return se;
}

export function addExercise(session: WorkoutSession, se: SessionExercise): SessionExercise {
  session.exercises.push(se);
  return se;
}

export function removeExercise(session: WorkoutSession, id: string): RemovedExercise | undefined {
  const index = session.exercises.findIndex((e) => e.id === id);
  if (index < 0) return undefined;
  const [exercise] = session.exercises.splice(index, 1);
  return { exercise, index };
}

export function restoreExercise(session: WorkoutSession, removed: RemovedExercise): void {
  session.exercises.splice(clamp(removed.index, session.exercises.length), 0, removed.exercise);
}

export function moveExercise(session: WorkoutSession, id: string, toIndex: number): boolean {
  const from = session.exercises.findIndex((e) => e.id === id);
  if (from < 0) return false;
  const [e] = session.exercises.splice(from, 1);
  session.exercises.splice(clamp(toIndex, session.exercises.length), 0, e);
  return true;
}

/** Appends a set copying type and weight/reps of the last set (never completion). */
export function addSet(se: SessionExercise): LoggedSet {
  const last = se.sets.at(-1);
  const set: LoggedSet = { id: newId(), type: last?.type ?? "normal" };
  if (last?.weight !== undefined) set.weight = last.weight;
  if (last?.reps !== undefined) set.reps = last.reps;
  se.sets.push(set);
  return set;
}

/** Inserts a copy after the source set, without completion or prescription link. */
export function duplicateSet(se: SessionExercise, setId: string): LoggedSet | undefined {
  const index = se.sets.findIndex((s) => s.id === setId);
  if (index < 0) return undefined;
  // A shallow copy (all fields are primitives): `structuredClone` throws on `$state` proxies.
  const { completedAt: _c, prescribedSetId: _p, ...rest } = { ...se.sets[index] };
  const copy: LoggedSet = { ...rest, id: newId() };
  se.sets.splice(index + 1, 0, copy);
  return copy;
}

export function removeSet(se: SessionExercise, setId: string): RemovedSet | undefined {
  const index = se.sets.findIndex((s) => s.id === setId);
  if (index < 0) return undefined;
  const [set] = se.sets.splice(index, 1);
  return { set, index };
}

export function restoreSet(se: SessionExercise, removed: RemovedSet): void {
  se.sets.splice(clamp(removed.index, se.sets.length), 0, removed.set);
}

/** Edits values only; completion is never changed here. */
export function updateSet(se: SessionExercise, setId: string, patch: SetPatch): LoggedSet | undefined {
  const set = se.sets.find((s) => s.id === setId);
  if (!set) return undefined;
  const { id: _i, completedAt: _c, ...safe } = patch as SetPatch & { id?: string; completedAt?: string };
  for (const [k, v] of Object.entries(safe)) {
    if (v === undefined) delete (set as Record<string, unknown>)[k];
    else (set as Record<string, unknown>)[k] = v;
  }
  return set;
}

/** Fills missing weight/reps from `values` and marks completed. Idempotent: a completed set keeps its `completedAt`. */
export function completeSet(set: LoggedSet, values: SetValues, now: string): LoggedSet {
  if (set.weight === undefined && values.weight !== undefined) set.weight = values.weight;
  if (set.reps === undefined && values.reps !== undefined) set.reps = values.reps;
  set.completedAt ??= now;
  return set;
}

export function uncompleteSet(set: LoggedSet): LoggedSet {
  delete set.completedAt;
  return set;
}
