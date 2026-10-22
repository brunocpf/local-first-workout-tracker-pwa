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

// ---- Substitutions (T8.21) ----

export type ReplaceResult = {
  /** The session exercise now holding the replacement (the original one, or a new one inserted after it). */
  replacement: SessionExercise;
  /** True when completed sets stayed with the original and the rest moved to `replacement`. */
  split: boolean;
};

/** How many sets are done / still to do, to decide whether a replacement needs confirming. */
export function setProgress(se: SessionExercise): { completed: number; remaining: number } {
  const completed = se.sets.filter((s) => s.completedAt).length;
  return { completed, remaining: se.sets.length - completed };
}

/**
 * Swaps the exercise for another one without losing the plan. Prescription, rest and notes are kept.
 * With no completed sets the exercise changes in place (same row, same sets). Otherwise the completed
 * sets stay with the original exercise (so history shows what was actually performed) and the uncompleted
 * ones move to a new exercise right after it, in the same superset group; an exercise whose sets are all
 * completed gets one empty set instead.
 */
export function replaceExercise(
  session: WorkoutSession,
  id: string,
  to: Pick<Exercise, "id" | "name" | "exerciseType">,
): ReplaceResult | undefined {
  const index = session.exercises.findIndex((e) => e.id === id);
  if (index < 0) return undefined;
  const se = session.exercises[index];
  if (!se.sets.some((s) => s.completedAt)) {
    se.exerciseId = to.id;
    se.exerciseNameSnapshot = to.name;
    se.exerciseTypeSnapshot = to.exerciseType;
    return { replacement: se, split: false };
  }
  const moved = se.sets.filter((s) => !s.completedAt);
  se.sets = se.sets.filter((s) => s.completedAt);
  const replacement = createSessionExercise(to, {
    prescribedSets: se.prescribedSets,
    restSeconds: se.restSeconds,
    supersetGroupId: se.supersetGroupId,
  });
  // `createSessionExercise` clones the prescription; the sets are the ones the user already shaped.
  replacement.sets = moved.length > 0 ? moved : [{ id: newId(), type: "normal" }];
  session.exercises.splice(index + 1, 0, replacement);
  return { replacement, split: true };
}

// ---- Supersets (T8.06): members are consecutive exercises sharing a `supersetGroupId`. ----

export type SupersetInfo = {
  /** Group letter, in order of appearance: A, B, … */
  letter: string;
  /** 0-based position in the group; the label is `letter + (position + 1)`. */
  position: number;
  size: number;
};

/** A, B, … Z, AA, AB, … */
function letterFor(n: number): string {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

/**
 * Runs of two or more adjacent exercises with the same group id. Singletons and non-adjacent leftovers
 * (after a reorder) are not supersets, so a stale id never shows a group of one.
 */
export function supersetRuns(exercises: readonly SessionExercise[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  exercises.forEach((e, i) => {
    const prev = exercises[i - 1];
    if (!e.supersetGroupId || prev?.supersetGroupId !== e.supersetGroupId) flush();
    if (e.supersetGroupId) run.push(i);
  });
  flush();
  return runs;
}

/** Superset membership by exercise index (absent = not in a superset). */
export function supersetInfo(exercises: readonly SessionExercise[]): Map<number, SupersetInfo> {
  const info = new Map<number, SupersetInfo>();
  supersetRuns(exercises).forEach((run, g) =>
    run.forEach((index, position) => info.set(index, { letter: letterFor(g), position, size: run.length })),
  );
  return info;
}

/** Drops group ids left on exercises that no longer have an adjacent partner. */
function clearStaleGroups(session: WorkoutSession): void {
  const grouped = new Set(supersetRuns(session.exercises).flat());
  session.exercises.forEach((e, k) => {
    if (e.supersetGroupId && !grouped.has(k)) delete e.supersetGroupId;
  });
}

/**
 * Joins the exercise with its neighbour above (`-1`) or below (`1`), reusing the neighbour's group or creating one.
 * An exercise that was in another group leaves it (it sits at that group's edge, so the rest stays adjacent).
 */
export function joinSuperset(session: WorkoutSession, id: string, direction: -1 | 1): boolean {
  const i = session.exercises.findIndex((e) => e.id === id);
  const neighbour = session.exercises[i + direction];
  if (i < 0 || !neighbour) return false;
  const groupId = neighbour.supersetGroupId ?? newId();
  neighbour.supersetGroupId = groupId;
  session.exercises[i].supersetGroupId = groupId;
  clearStaleGroups(session);
  return true;
}

/** Removes the exercise from its superset; a member in the middle splits the group in two. */
export function leaveSuperset(session: WorkoutSession, id: string): boolean {
  const i = session.exercises.findIndex((e) => e.id === id);
  if (i < 0 || !session.exercises[i].supersetGroupId) return false;
  const groupId = session.exercises[i].supersetGroupId;
  delete session.exercises[i].supersetGroupId;
  // Members after it become their own group so the two halves never rejoin by accident.
  const next = newId();
  for (let k = i + 1; k < session.exercises.length && session.exercises[k].supersetGroupId === groupId; k++) {
    session.exercises[k].supersetGroupId = next;
  }
  clearStaleGroups(session);
  return true;
}
