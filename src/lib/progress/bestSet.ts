import type { ExerciseType, LoggedSet } from "#lib/types";
import { estimated1RM, isCounted } from "./metrics";

/** The most notable counted set of an exercise in one session, or undefined when none was completed. */
export function bestSet(sets: LoggedSet[], type: ExerciseType = "weighted_reps"): LoggedSet | undefined {
  const score = (s: LoggedSet): number => {
    if (type === "duration") return s.durationSeconds ?? 0;
    if (type === "distance") return s.distance ?? 0;
    if (type === "bodyweight_reps") return s.reps ?? 0;
    if (type === "assisted_bodyweight") return s.reps ?? 0;
    const w = s.weight ?? 0;
    return (s.reps ? estimated1RM(w, s.reps) : undefined) ?? w;
  };
  let best: LoggedSet | undefined;
  for (const s of sets) {
    if (!isCounted(s)) continue;
    if (!best || score(s) > score(best)) best = s;
  }
  return best;
}
