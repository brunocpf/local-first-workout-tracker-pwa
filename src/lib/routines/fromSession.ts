// Structure-only diff between a finished session and the routine it started from (PRD §7.1), and the
// edit that applies it. Target weights, reps and rest are never touched (progression is T8.22).
import { addRoutineExercise, moveRoutineExercise, replaceRoutineExercise, setSetCount } from "#lib/routines/edit";
import type { Routine, WorkoutSession } from "#lib/types";

export type SessionRoutineDiff = {
  /** Session exercises with no counterpart in the routine. */
  added: { sessionExerciseId: string; exerciseId: string; name: string; sets: number }[];
  /** Routine exercises dropped from the session (ids only; the routine has no names). */
  removed: { routineExerciseId: string; exerciseId: string }[];
  /** Routine exercise swapped for another one at the same position. */
  replaced: { routineExerciseId: string; fromExerciseId: string; toExerciseId: string; toName: string }[];
  setCountChanges: { routineExerciseId: string; exerciseId: string; name: string; from: number; to: number }[];
  /** True when kept exercises are in a different relative order. */
  reordered: boolean;
  /** Final exercise sequence: a routine exercise id, or the session exercise id of a new one. */
  order: { routineExerciseId?: string; sessionExerciseId: string }[];
};

export const isDiffEmpty = (d: SessionRoutineDiff): boolean =>
  d.added.length === 0 &&
  d.removed.length === 0 &&
  d.replaced.length === 0 &&
  d.setCountChanges.length === 0 &&
  !d.reordered;

/** Warm-ups are session-only, so they don't count towards the prescribed set count. */
const sessionSetCount = (e: WorkoutSession["exercises"][number]) => e.sets.filter((s) => s.type !== "warmup").length;
const routineSetCount = (e: Routine["exercises"][number]) => e.prescribedSets.filter((s) => s.type !== "warmup").length;

export function diffSessionAgainstRoutine(session: WorkoutSession, routine: Routine): SessionRoutineDiff {
  // Session exercises carry no routine-exercise id, so match by exercise, first occurrence first.
  const pool = new Map<string, number[]>();
  routine.exercises.forEach((re, i) => pool.set(re.exerciseId, [...(pool.get(re.exerciseId) ?? []), i]));
  const matchOf = new Map<number, number>(); // session index -> routine index
  const used = new Set<number>();
  session.exercises.forEach((se, si) => {
    const ri = pool.get(se.exerciseId)?.shift();
    if (ri !== undefined) {
      matchOf.set(si, ri);
      used.add(ri);
    }
  });

  const unmatchedSession = session.exercises.map((_, si) => si).filter((si) => !matchOf.has(si));
  const unmatchedRoutine = routine.exercises.map((_, ri) => ri).filter((ri) => !used.has(ri));

  // A removed + added pair at the same position reads as a replacement.
  const pairs = new Map<number, number>(); // session index -> routine index
  for (const si of unmatchedSession) {
    if (unmatchedRoutine.includes(si) && !pairs.has(si)) pairs.set(si, si);
  }
  const pairedRoutine = new Set(pairs.values());

  const diff: SessionRoutineDiff = { added: [], removed: [], replaced: [], setCountChanges: [], reordered: false, order: [] };
  for (const ri of unmatchedRoutine) {
    if (!pairedRoutine.has(ri)) {
      diff.removed.push({ routineExerciseId: routine.exercises[ri].id, exerciseId: routine.exercises[ri].exerciseId });
    }
  }

  const keptRoutineOrder: number[] = [];
  session.exercises.forEach((se, si) => {
    const ri = matchOf.get(si) ?? pairs.get(si);
    if (ri === undefined) {
      diff.added.push({ sessionExerciseId: se.id, exerciseId: se.exerciseId, name: se.exerciseNameSnapshot, sets: sessionSetCount(se) });
      diff.order.push({ sessionExerciseId: se.id });
      return;
    }
    const re = routine.exercises[ri];
    keptRoutineOrder.push(ri);
    diff.order.push({ routineExerciseId: re.id, sessionExerciseId: se.id });
    if (pairs.has(si)) {
      diff.replaced.push({ routineExerciseId: re.id, fromExerciseId: re.exerciseId, toExerciseId: se.exerciseId, toName: se.exerciseNameSnapshot });
    }
    const from = routineSetCount(re);
    const to = sessionSetCount(se);
    if (from !== to) {
      diff.setCountChanges.push({ routineExerciseId: re.id, exerciseId: se.exerciseId, name: se.exerciseNameSnapshot, from, to });
    }
  });

  // Reordered unless the kept routine exercises appear in ascending routine order.
  const sortedKept = [...keptRoutineOrder].sort((a, b) => a - b);
  diff.reordered = keptRoutineOrder.some((ri, i) => ri !== sortedKept[i]);
  return diff;
}

/** Applies the diff in place with the routine edit helpers. Returns the routine for convenience. */
export function applySessionToRoutine(routine: Routine, diff: SessionRoutineDiff): Routine {
  const removed = new Set(diff.removed.map((r) => r.routineExerciseId));
  routine.exercises = routine.exercises.filter((e) => !removed.has(e.id));
  for (const r of diff.replaced) replaceRoutineExercise(routine, r.routineExerciseId, r.toExerciseId);
  for (const c of diff.setCountChanges) {
    const re = routine.exercises.find((e) => e.id === c.routineExerciseId);
    if (!re) continue;
    // Count only normal-ish sets: keep any prescribed warm-ups, resize the rest.
    const warmups = re.prescribedSets.filter((s) => s.type === "warmup").length;
    setSetCount(re, c.to + warmups);
  }
  const newIds = new Map<string, string>();
  for (const a of diff.added) {
    const re = addRoutineExercise(routine, a.exerciseId, { sets: a.sets });
    newIds.set(a.sessionExerciseId, re.id);
  }
  diff.order.forEach((o, target) => {
    const id = o.routineExerciseId ?? newIds.get(o.sessionExerciseId);
    const from = routine.exercises.findIndex((e) => e.id === id);
    if (from >= 0 && from !== target) moveRoutineExercise(routine, from, target);
  });
  return routine;
}
