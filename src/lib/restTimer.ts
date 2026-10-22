import { supersetRuns } from "#lib/logger/workout";
import type { RestTimer, SessionExercise } from "#lib/types";

/** Timer state is a stored end instant, never interval ticks; the UI just re-reads `remainingSeconds`. */
export function startRestTimer(durationSeconds: number, now = Date.now()): RestTimer {
  return { endsAt: new Date(now + durationSeconds * 1000).toISOString(), durationSeconds };
}

export function remainingMs(t: RestTimer, now = Date.now()): number {
  return Math.max(0, t.pausedRemainingMs ?? Date.parse(t.endsAt) - now);
}

export const remainingSeconds = (t: RestTimer, now = Date.now()) => Math.ceil(remainingMs(t, now) / 1000);

export const isPaused = (t: RestTimer) => t.pausedRemainingMs !== undefined;

export function pauseRestTimer(t: RestTimer, now = Date.now()): RestTimer {
  return isPaused(t) ? t : { ...t, pausedRemainingMs: remainingMs(t, now) };
}

export function resumeRestTimer(t: RestTimer, now = Date.now()): RestTimer {
  if (!isPaused(t)) return t;
  const { pausedRemainingMs, ...rest } = t;
  return { ...rest, endsAt: new Date(now + pausedRemainingMs!).toISOString() };
}

/** Add (or subtract) seconds, e.g. the +15s button. Works while running or paused. */
export function adjustRestTimer(t: RestTimer, deltaSeconds: number, now = Date.now()): RestTimer {
  const ms = deltaSeconds * 1000;
  if (isPaused(t)) return { ...t, pausedRemainingMs: Math.max(0, t.pausedRemainingMs! + ms) };
  return { ...t, endsAt: new Date(Math.max(now, Date.parse(t.endsAt) + ms)).toISOString() };
}

/** Rest after completing a set of this exercise: its own override, else the default from settings. */
export function restDurationFor(
  exercise: { restSeconds?: number },
  settings: { defaultRestSeconds: number },
): number {
  return exercise.restSeconds ?? settings.defaultRestSeconds;
}

/**
 * Seconds of rest to start after completing `setId` of `exercises[exerciseIndex]`, or 0 for none.
 * Outside a superset this is `restDurationFor`. In a superset, rounds are the sets at the same position of each
 * member: the timer starts only once every member that has a set in that round is done, and uses the rest of
 * the last such member in group order.
 */
export function restAfterSet(
  exercises: readonly SessionExercise[],
  exerciseIndex: number,
  setId: string,
  settings: { defaultRestSeconds: number },
): number {
  const exercise = exercises[exerciseIndex];
  const run = supersetRuns(exercises).find((r) => r.includes(exerciseIndex));
  if (!run) return restDurationFor(exercise, settings);
  const round = exercise.sets.findIndex((s) => s.id === setId);
  const members = run.map((i) => exercises[i]).filter((e) => e.sets[round]);
  if (round < 0 || members.some((e) => !e.sets[round].completedAt)) return 0;
  return restDurationFor(members.at(-1)!, settings);
}
