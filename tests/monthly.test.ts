import { describe, expect, it } from "vitest";
import { monthlyStats } from "#lib/progress/monthly";
import type { LoggedSet, WorkoutSession } from "#lib/types";

const set = (weight: number, reps: number, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  type: "normal",
  weight,
  reps,
  completedAt: "2026-03-05T10:00:00.000Z",
  ...over,
});

const session = (over: Partial<WorkoutSession> & Pick<WorkoutSession, "id" | "startedAt">): WorkoutSession => ({
  name: "Workout",
  status: "completed",
  endedAt: over.startedAt,
  timeZone: "UTC",
  exercises: [],
  exerciseIds: [],
  createdAt: over.startedAt,
  updatedAt: over.startedAt,
  ...over,
});

describe("monthlyStats", () => {
  it("is empty without sessions", () => {
    expect(monthlyStats([])).toEqual([]);
  });

  it("aggregates count, duration, volume and completed sets per month, sorted ascending", () => {
    const march = session({
      id: "m1",
      startedAt: "2026-03-05T10:00:00.000Z",
      endedAt: "2026-03-05T11:00:00.000Z",
      exercises: [
        {
          id: "e1",
          exerciseId: "x",
          exerciseNameSnapshot: "Squat",
          exerciseTypeSnapshot: "weighted_reps",
          sets: [set(100, 5), set(60, 5, { type: "warmup" }), set(80, 8, { completedAt: undefined })],
        },
        {
          id: "e2",
          exerciseId: "y",
          exerciseNameSnapshot: "Push-up",
          exerciseTypeSnapshot: "bodyweight_reps",
          sets: [set(0, 20)],
        },
      ],
    });
    const march2 = session({ id: "m2", startedAt: "2026-03-20T10:00:00.000Z", endedAt: "2026-03-20T10:30:00.000Z" });
    const feb = session({ id: "f1", startedAt: "2026-02-28T09:00:00.000Z", endedAt: "2026-02-28T09:45:00.000Z" });

    expect(monthlyStats([march, march2, feb])).toEqual([
      { month: "2026-02", sessions: 1, durationSeconds: 2700, volume: 0, completedSets: 0 },
      { month: "2026-03", sessions: 2, durationSeconds: 5400, volume: 500, completedSets: 3 },
    ]);
  });

  it("uses each session's own time zone for month boundaries", () => {
    // 2026-04-01 03:30 UTC is 2026-03-31 23:30 in New York (EDT, UTC-4): March.
    const ny = session({ id: "ny", startedAt: "2026-04-01T03:30:00.000Z", timeZone: "America/New_York" });
    // 2026-03-31 23:30 UTC is 2026-04-01 00:30 in Lisbon (WEST, UTC+1): April.
    const lisbon = session({ id: "lis", startedAt: "2026-03-31T23:30:00.000Z", timeZone: "Europe/Lisbon" });
    expect(monthlyStats([ny, lisbon]).map((s) => [s.month, s.sessions])).toEqual([
      ["2026-03", 1],
      ["2026-04", 1],
    ]);
  });

  it("ignores active sessions", () => {
    const active = session({ id: "a", startedAt: "2026-05-01T10:00:00.000Z", status: "active", endedAt: undefined });
    expect(monthlyStats([active])).toEqual([]);
  });
});
