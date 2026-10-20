import { describe, expect, it } from "vitest";
import { sessionSummary } from "#lib/progress/summary";
import type { LoggedSet, SessionExercise, SetType, WorkoutSession } from "#lib/types";

const T = "2026-01-01T10:00:00.000Z";
const set = (type: SetType, weight: number, reps: number, done = true): LoggedSet => ({
  id: crypto.randomUUID(), type, weight, reps, ...(done ? { completedAt: T } : {}),
});
const ex = (exerciseTypeSnapshot: SessionExercise["exerciseTypeSnapshot"], sets: LoggedSet[]): SessionExercise => ({
  id: crypto.randomUUID(), exerciseId: "x", exerciseNameSnapshot: "X", exerciseTypeSnapshot, sets,
});
const session = (exercises: SessionExercise[], endedAt?: string): WorkoutSession => ({
  id: "s", name: "S", status: "completed", startedAt: T, endedAt, timeZone: "UTC",
  exercises, exerciseIds: [], createdAt: T, updatedAt: T,
});

describe("sessionSummary", () => {
  it("counts only completed non-warm-up sets and sums weighted volume", () => {
    const s = sessionSummary(session([
      ex("weighted_reps", [set("warmup", 20, 10), set("normal", 100, 5), set("normal", 100, 5, false)]),
      ex("weighted_reps", [set("normal", 50, 10)]),
    ], "2026-01-01T11:05:00.000Z"));
    expect(s).toEqual({ durationMs: 65 * 60_000, exerciseCount: 2, completedSets: 2, volumeKg: 1000 });
  });
  it("skips exercises with no counted sets", () => {
    expect(sessionSummary(session([ex("weighted_reps", [set("warmup", 20, 10), set("normal", 1, 1, false)])])).exerciseCount).toBe(0);
  });
  it("gives no volume for non-weighted_reps exercises but still counts their sets", () => {
    const s = sessionSummary(session([ex("bodyweight_reps", [set("normal", 0, 12)]), ex("duration", [set("normal", 0, 0)])]));
    expect(s).toMatchObject({ completedSets: 2, exerciseCount: 2, volumeKg: 0 });
  });
  it("uses 0 duration without a valid endedAt", () => {
    expect(sessionSummary(session([])).durationMs).toBe(0);
    expect(sessionSummary(session([], "nope")).durationMs).toBe(0);
  });
});
