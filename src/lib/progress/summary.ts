import { exerciseVolume, isCounted } from "#lib/progress/metrics";
import { currentTimeZone, localWeekStart } from "#lib/time";
import type { WorkoutSession } from "#lib/types";

export type SessionSummary = {
  durationMs: number;
  /** Exercises with at least one counted set. */
  exerciseCount: number;
  completedSets: number;
  /** kg; only `weighted_reps` exercises contribute. */
  volumeKg: number;
};

/** Warm-ups and incomplete sets are excluded everywhere. A missing/invalid `endedAt` gives a 0 duration. */
export function sessionSummary(session: WorkoutSession): SessionSummary {
  let exerciseCount = 0;
  let completedSets = 0;
  let volumeKg = 0;
  for (const e of session.exercises) {
    const counted = e.sets.filter(isCounted).length;
    if (counted === 0) continue;
    exerciseCount++;
    completedSets += counted;
    volumeKg += exerciseVolume(e.sets, e.exerciseTypeSnapshot);
  }
  const ms = session.endedAt ? Date.parse(session.endedAt) - Date.parse(session.startedAt) : 0;
  return { durationMs: Number.isFinite(ms) && ms > 0 ? ms : 0, exerciseCount, completedSets, volumeKg };
}

/**
 * Sessions whose local start date falls in the same week as `now`. Each session is placed in the week of
 * the date it was performed (its own `timeZone`); `now` is read in `timeZone` (default: the device's).
 */
export function countSessionsThisWeek(
  sessions: Pick<WorkoutSession, "startedAt" | "timeZone">[],
  now: Date,
  weekStartsOn: 0 | 1 | 6,
  timeZone = currentTimeZone(),
): number {
  const current = localWeekStart({ startedAt: now.toISOString(), timeZone }, weekStartsOn);
  return sessions.filter((s) => localWeekStart(s, weekStartsOn) === current).length;
}
