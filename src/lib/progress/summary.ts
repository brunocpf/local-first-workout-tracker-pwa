import { exerciseVolume, isCounted } from "#lib/progress/metrics";
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
