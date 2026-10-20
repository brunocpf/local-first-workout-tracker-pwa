import { MUSCLES, type Muscle } from "#lib/catalog/vocab";
import { isCounted } from "#lib/progress/metrics";
import { localWeekStart } from "#lib/time";
import type { Exercise, WorkoutSession } from "#lib/types";

/** Weight of one counted set per muscle: primary = 1, secondary = 0.5. */
export const PRIMARY_SET_WEIGHT = 1;
export const SECONDARY_SET_WEIGHT = 0.5;

/** Weekly sets per muscle for one week, keyed by muscle. Absent muscles had no sets. */
export type MuscleSets = Partial<Record<Muscle, number>>;

const KNOWN_MUSCLES = new Set<string>(MUSCLES);

/**
 * Weekly working sets per muscle group, keyed by the week's start date ("YYYY-MM-DD", local to each
 * session's `timeZone`). Attribution rule (an estimate, not a measurement):
 *
 * - Each counted set (completed, not a warm-up; see `isCounted`) adds 1 set to every primary muscle
 *   of its exercise and 0.5 to every secondary muscle. A muscle listed as both counts as primary only.
 * - Muscles are read from the *current* catalog metadata (`exercisesById`), not a snapshot, so
 *   editing an exercise's muscles changes past weeks too. Session exercises whose id is not in the
 *   map (e.g. removed custom exercises) contribute nothing, as do unknown muscle names.
 * - Set counts are not filtered by exercise type; bodyweight and duration sets count as sets.
 */
export function weeklySetsByMuscle(
  sessions: readonly WorkoutSession[],
  exercisesById: ReadonlyMap<string, Pick<Exercise, "primaryMuscles" | "secondaryMuscles">>,
  weekStartsOn: 0 | 1 | 6,
): Record<string, MuscleSets> {
  const weeks: Record<string, MuscleSets> = {};
  for (const session of sessions) {
    for (const ex of session.exercises) {
      const meta = exercisesById.get(ex.exerciseId);
      if (!meta) continue;
      const counted = ex.sets.filter(isCounted).length;
      if (counted === 0) continue;
      const week = (weeks[localWeekStart(session, weekStartsOn)] ??= {});
      for (const [muscles, weight] of [
        [meta.primaryMuscles, PRIMARY_SET_WEIGHT],
        [meta.secondaryMuscles, SECONDARY_SET_WEIGHT],
      ] as const) {
        for (const m of new Set(muscles)) {
          if (!KNOWN_MUSCLES.has(m) || (weight === SECONDARY_SET_WEIGHT && meta.primaryMuscles.includes(m))) continue;
          const muscle = m as Muscle;
          week[muscle] = (week[muscle] ?? 0) + counted * weight;
        }
      }
    }
  }
  return weeks;
}
