import { describe, expect, it } from "vitest";
import { exerciseSeries, rangeStart } from "#lib/progress/series";
import type { ExerciseType, LoggedSet, SessionExercise, WorkoutSession } from "#lib/types";

const DONE = "2026-01-10T10:00:00.000Z";
const set = (weight: number | undefined, reps: number | undefined, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  type: "normal",
  weight,
  reps,
  completedAt: DONE,
  ...over,
});

const entry = (exerciseId: string, sets: LoggedSet[], exerciseTypeSnapshot: ExerciseType = "weighted_reps"): SessionExercise => ({
  id: `e-${exerciseId}-${sets.length}`,
  exerciseId,
  exerciseNameSnapshot: exerciseId,
  exerciseTypeSnapshot,
  sets,
});

const session = (id: string, startedAt: string, exercises: SessionExercise[], timeZone = "UTC"): WorkoutSession => ({
  id,
  name: "Workout",
  status: "completed",
  startedAt,
  endedAt: startedAt,
  timeZone,
  exercises,
  exerciseIds: exercises.map((e) => e.exerciseId),
  createdAt: startedAt,
  updatedAt: startedAt,
});

const bench = "bench";

describe("exerciseSeries", () => {
  it("returns no points without sessions or matching exercise", () => {
    expect(exerciseSeries([], bench)).toEqual([]);
    expect(exerciseSeries([session("a", "2026-01-10T10:00:00.000Z", [entry("squat", [set(100, 5)])])], bench)).toEqual([]);
  });

  it("computes e1RM, max weight and volume per session, oldest first", () => {
    const sessions = [
      session("b", "2026-02-01T10:00:00.000Z", [entry(bench, [set(110, 5), set(100, 8)])]),
      session("a", "2026-01-10T10:00:00.000Z", [entry(bench, [set(100, 5)])]),
    ];
    const points = exerciseSeries(sessions, bench);
    expect(points.map((p) => p.sessionId)).toEqual(["a", "b"]);
    expect(points[0]).toEqual({ date: "2026-01-10", sessionId: "a", maxWeight: 100, e1rm: 100 * (1 + 5 / 30), volume: 500 });
    expect(points[1].maxWeight).toBe(110);
    expect(points[1].e1rm).toBeCloseTo(110 * (1 + 5 / 30), 5); // 128.33 beats 100 x 8 = 126.67
    expect(points[1].volume).toBe(110 * 5 + 100 * 8);
  });

  it("excludes warm-ups and incomplete sets; a session with only those yields no point", () => {
    const sessions = [
      session("a", "2026-01-10T10:00:00.000Z", [
        entry(bench, [set(60, 5, { type: "warmup" }), set(200, 1, { completedAt: undefined }), set(80, 5)]),
      ]),
      session("b", "2026-01-11T10:00:00.000Z", [entry(bench, [set(300, 1, { type: "warmup" })])]),
    ];
    const points = exerciseSeries(sessions, bench);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ sessionId: "a", maxWeight: 80, volume: 400 });
  });

  it("merges several entries for the same exercise in one session", () => {
    const sessions = [
      session("a", "2026-01-10T10:00:00.000Z", [entry(bench, [set(100, 5)]), entry(bench, [set(90, 5)]), entry("squat", [set(999, 9)])]),
    ];
    const [point] = exerciseSeries(sessions, bench);
    expect(point.volume).toBe(950);
    expect(point.maxWeight).toBe(100);
  });

  it("leaves e1RM undefined when no set is in 1..12 reps", () => {
    const [point] = exerciseSeries([session("a", "2026-01-10T10:00:00.000Z", [entry(bench, [set(100, 15)])])], bench);
    expect(point.e1rm).toBeUndefined();
    expect(point.maxWeight).toBe(100);
  });

  it("reports best reps and no strength metrics for bodyweight types", () => {
    const sessions = [session("a", "2026-01-10T10:00:00.000Z", [entry("pullup", [set(undefined, 8), set(undefined, 12)], "bodyweight_reps")])];
    const [point] = exerciseSeries(sessions, "pullup");
    expect(point).toEqual({ date: "2026-01-10", sessionId: "a", volume: 0, bestReps: 12 });
  });

  it("gives duration sets a volume-only point and no strength or rep metrics", () => {
    const sessions = [session("a", "2026-01-10T10:00:00.000Z", [entry("plank", [set(undefined, undefined, { durationSeconds: 60 })], "duration")])];
    expect(exerciseSeries(sessions, "plank")).toEqual([{ date: "2026-01-10", sessionId: "a", volume: 0 }]);
  });

  it("filters by inclusive local dates", () => {
    const sessions = [
      session("a", "2026-01-10T10:00:00.000Z", [entry(bench, [set(100, 5)])]),
      session("b", "2026-01-20T10:00:00.000Z", [entry(bench, [set(100, 5)])]),
      session("c", "2026-02-01T10:00:00.000Z", [entry(bench, [set(100, 5)])]),
    ];
    expect(exerciseSeries(sessions, bench, { from: "2026-01-10", to: "2026-01-20" }).map((p) => p.sessionId)).toEqual(["a", "b"]);
    expect(exerciseSeries(sessions, bench, { from: "2026-01-21" }).map((p) => p.sessionId)).toEqual(["c"]);
  });

  it("uses the session's own zone for the local date", () => {
    // 2026-01-10 23:30 UTC is already 2026-01-11 in Tokyo.
    const [point] = exerciseSeries(
      [session("a", "2026-01-10T23:30:00.000Z", [entry(bench, [set(100, 5)])], "Asia/Tokyo")],
      bench,
    );
    expect(point.date).toBe("2026-01-11");
  });
});

describe("rangeStart", () => {
  const now = new Date("2026-03-31T12:00:00.000Z");

  it("returns the local date counted back by the preset", () => {
    expect(rangeStart("1M", now, "UTC")).toBe("2026-02-28"); // clamped to the end of February
    expect(rangeStart("3M", now, "UTC")).toBe("2025-12-31");
    expect(rangeStart("1Y", new Date("2028-02-29T12:00:00.000Z"), "UTC")).toBe("2027-02-28");
  });

  it("counts back from the local date, not the UTC date", () => {
    // 2026-02-28 16:00 UTC is already 2026-03-01 in Tokyo, so one month back is 2026-02-01 (not 2026-01-28 from the UTC date).
    expect(rangeStart("1M", new Date("2026-02-28T16:00:00.000Z"), "Asia/Tokyo")).toBe("2026-02-01");
  });

  it("has no lower bound for All", () => {
    expect(rangeStart("All", now, "UTC")).toBeUndefined();
  });
});
