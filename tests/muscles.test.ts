import { describe, expect, it } from "vitest";
import { weeklySetsByMuscle } from "#lib/progress/muscles";
import type { Exercise, LoggedSet, SessionExercise, WorkoutSession } from "#lib/types";

const DONE = "2026-03-04T10:00:00.000Z"; // Wednesday, UTC

const set = (over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  type: "normal",
  weight: 100,
  reps: 5,
  completedAt: DONE,
  ...over,
});

const sessionExercise = (exerciseId: string, sets: LoggedSet[]): SessionExercise => ({
  id: `se-${exerciseId}`,
  exerciseId,
  exerciseNameSnapshot: exerciseId,
  exerciseTypeSnapshot: "weighted_reps",
  sets,
});

const session = (over: Partial<WorkoutSession> & { exercises: SessionExercise[] }): WorkoutSession => ({
  id: "w",
  name: "Session",
  status: "completed",
  startedAt: DONE,
  timeZone: "UTC",
  exerciseIds: over.exercises.map((e) => e.exerciseId),
  createdAt: DONE,
  updatedAt: DONE,
  ...over,
});

const meta = (primaryMuscles: Exercise["primaryMuscles"], secondaryMuscles: Exercise["secondaryMuscles"] = []) => ({
  primaryMuscles,
  secondaryMuscles,
});

const catalog = new Map([
  ["bench", meta(["chest"], ["front_delts", "triceps"])],
  ["row", meta(["lats"], ["biceps"])],
  ["squat", meta(["quads"], ["glutes", "lower_back"])],
  ["odd", meta(["chest"], ["chest", "not_a_muscle"])],
]);

describe("weeklySetsByMuscle", () => {
  it("counts 1 set per primary muscle and 0.5 per secondary muscle", () => {
    const weeks = weeklySetsByMuscle(
      [session({ exercises: [sessionExercise("bench", [set(), set(), set()])] })],
      catalog,
      1,
    );
    expect(weeks).toEqual({ "2026-03-02": { chest: 3, front_delts: 1.5, triceps: 1.5 } });
  });

  it("excludes warm-ups and incomplete sets", () => {
    const weeks = weeklySetsByMuscle(
      [
        session({
          exercises: [
            sessionExercise("row", [
              set({ type: "warmup" }),
              set({ completedAt: undefined }),
              set(),
              set({ type: "drop" }),
            ]),
          ],
        }),
      ],
      catalog,
      1,
    );
    expect(weeks["2026-03-02"]).toEqual({ lats: 2, biceps: 1 });
  });

  it("omits weeks whose sets are all excluded", () => {
    const weeks = weeklySetsByMuscle(
      [session({ exercises: [sessionExercise("row", [set({ type: "warmup" })])] })],
      catalog,
      1,
    );
    expect(weeks).toEqual({});
  });

  it("counts a muscle listed as both primary and secondary once, as primary", () => {
    const weeks = weeklySetsByMuscle([session({ exercises: [sessionExercise("odd", [set()])] })], catalog, 1);
    expect(weeks["2026-03-02"]).toEqual({ chest: 1 });
  });

  it("ignores exercises missing from the catalog and unknown muscle names", () => {
    const weeks = weeklySetsByMuscle(
      [session({ exercises: [sessionExercise("gone", [set()]), sessionExercise("odd", [set()])] })],
      catalog,
      1,
    );
    expect(weeks["2026-03-02"]).toEqual({ chest: 1 });
  });

  it("groups by week using weekStartsOn", () => {
    // 2026-03-04 is a Wednesday; Sunday-start week begins 2026-03-01, Monday-start 2026-03-02.
    const s = [session({ exercises: [sessionExercise("squat", [set()])] })];
    expect(Object.keys(weeklySetsByMuscle(s, catalog, 0))).toEqual(["2026-03-01"]);
    expect(Object.keys(weeklySetsByMuscle(s, catalog, 1))).toEqual(["2026-03-02"]);
  });

  it("buckets by the session's own timeZone, not UTC", () => {
    // 2026-03-08T05:00Z is Sunday in UTC but Saturday 19:00 in Honolulu (UTC-10), so the
    // Sunday-start week differs: it belongs to the week of 2026-03-01 locally, 2026-03-08 in UTC.
    const late = "2026-03-08T05:00:00.000Z";
    const s = session({ startedAt: late, timeZone: "Pacific/Honolulu", exercises: [sessionExercise("row", [set()])] });
    expect(Object.keys(weeklySetsByMuscle([s], catalog, 0))).toEqual(["2026-03-01"]);
    const utc = session({ startedAt: late, timeZone: "UTC", exercises: [sessionExercise("row", [set()])] });
    expect(Object.keys(weeklySetsByMuscle([utc], catalog, 0))).toEqual(["2026-03-08"]);
  });

  it("sums across sessions and exercises in the same week", () => {
    const weeks = weeklySetsByMuscle(
      [
        session({ exercises: [sessionExercise("bench", [set(), set()])] }),
        session({ id: "w2", startedAt: "2026-03-06T10:00:00.000Z", exercises: [sessionExercise("bench", [set()])] }),
      ],
      catalog,
      1,
    );
    expect(weeks["2026-03-02"]).toEqual({ chest: 3, front_delts: 1.5, triceps: 1.5 });
  });
});
