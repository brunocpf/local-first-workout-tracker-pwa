import { bodyweightOn, exerciseVolume, hasEffectiveLoad, isCounted, personalRecords, withEffectiveLoad } from "#lib/progress/metrics";
import { currentTimeZone, localDate } from "#lib/time";
import type { BodyMeasurement, ExerciseType, WorkoutSession } from "#lib/types";

/** One session's numbers for one exercise. Only counted sets (completed, non-warm-up) contribute. */
export type SeriesPoint = {
  /** Local calendar day ("YYYY-MM-DD") the session was performed on. */
  date: string;
  sessionId: string;
  /** Best Epley e1RM in the session (`weighted_reps`, or effective load of weighted/assisted bodyweight with a known bodyweight; undefined when no set is in 1..12 reps). */
  e1rm?: number;
  /** Heaviest weight lifted in the session (`weighted_reps`, or the effective load of weighted/assisted bodyweight with a known bodyweight). */
  maxWeight?: number;
  /** Session volume (weight x reps); weighted/assisted bodyweight use effective load and are 0 without a bodyweight; 0 for the other types. */
  volume: number;
  /** Most reps in one counted set (bodyweight-type exercises only). */
  bestReps?: number;
};

export type SeriesRange = { from?: string; to?: string };

export type SeriesOptions = SeriesRange & {
  /** Body measurements (any kinds, any order); the latest `bodyweight` on or before each session's local date makes weighted/assisted bodyweight exercises count. */
  measurements?: readonly BodyMeasurement[];
};

export type RangePreset = "1M" | "3M" | "1Y" | "All";

const BODYWEIGHT_TYPES: ReadonlySet<ExerciseType> = new Set([
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
]);

/**
 * Per-session points for one exercise, oldest first. Sessions without a counted set for the
 * exercise produce no point. `from`/`to` are inclusive local dates ("YYYY-MM-DD").
 */
export function exerciseSeries(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  { from, to, measurements = [] }: SeriesOptions = {},
): SeriesPoint[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const points: SeriesPoint[] = [];
  for (const session of ordered) {
    const entries = session.exercises.filter((e) => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;
    const date = localDate(session);
    if ((from && date < from) || (to && date > to)) continue;

    // A session may hold several entries for the same exercise; they count together.
    const type = entries[0].exerciseTypeSnapshot;
    const sets = entries.flatMap((e) => e.sets);
    const counted = sets.filter(isCounted);
    if (counted.length === 0) continue;

    const bodyweight = hasEffectiveLoad(type) ? bodyweightOn(measurements, date) : undefined;
    const point: SeriesPoint = { date, sessionId: session.id, volume: exerciseVolume(sets, type, bodyweight) };
    if (type === "weighted_reps" || bodyweight !== undefined) {
      const pr = personalRecords([withEffectiveLoad(sets, type, bodyweight)]);
      if (pr.maxWeight !== undefined) point.maxWeight = pr.maxWeight;
      if (pr.bestE1RM !== undefined) point.e1rm = pr.bestE1RM;
    }
    if (BODYWEIGHT_TYPES.has(type)) {
      const bestReps = Math.max(0, ...counted.map((s) => s.reps ?? 0));
      if (bestReps > 0) point.bestReps = bestReps;
    }
    points.push(point);
  }
  return points;
}

/**
 * Earliest local date ("YYYY-MM-DD") included by a range preset, counted back from `now` in
 * `timeZone`. Month arithmetic clamps to the end of a shorter month. `All` has no lower bound.
 */
export function rangeStart(preset: RangePreset, now: Date = new Date(), timeZone = currentTimeZone()): string | undefined {
  const months = { "1M": 1, "3M": 3, "1Y": 12, All: undefined }[preset];
  if (months === undefined) return undefined;
  const [y, m, d] = localDate({ startedAt: now.toISOString(), timeZone }).split("-").map(Number);
  const target = m - 1 - months;
  const lastDay = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, target, Math.min(d, lastDay))).toISOString().slice(0, 10);
}
