import { describe, expect, it } from "vitest";
import { prSummary } from "#lib/progress/prSummary";
import type { LoggedSet, WorkoutSession } from "#lib/types";

const set = (weight: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `${weight}x${reps}`, type: "normal", weight, reps, completedAt: "2026-01-01T10:00:00.000Z", ...extra,
});
const session = (id: string, startedAt: string, sets: LoggedSet[], type = "weighted_reps" as const): WorkoutSession =>
  ({
    id, name: id, status: "completed", startedAt, timeZone: "UTC", exerciseIds: ["ex"],
    exercises: [{ id: "se", exerciseId: "ex", exerciseNameSnapshot: "X", exerciseTypeSnapshot: type, sets }],
    createdAt: startedAt, updatedAt: startedAt,
  }) as WorkoutSession;

describe("prSummary", () => {
  it("finds PRs with the first session that achieved them, ignoring warm-ups and incomplete sets", () => {
    const sessions = [
      session("b", "2026-02-01T10:00:00.000Z", [set(100, 5), set(200, 5, { type: "warmup" }), set(300, 1, { completedAt: undefined })]),
      session("a", "2026-01-01T10:00:00.000Z", [set(100, 5), set(80, 8)]),
    ];
    const pr = prSummary(sessions, "ex", "weighted_reps");
    expect(pr.maxWeight).toEqual({ value: 100, date: "2026-01-01", sessionId: "a" });
    expect(pr.repPRs.map((r) => r.reps)).toEqual([5, 8]);
    expect(pr.bestSessionVolume?.value).toBe(1140);
  });
  it("reports best reps for bodyweight exercises", () => {
    const pr = prSummary([session("a", "2026-01-01T10:00:00.000Z", [set(0, 9), set(0, 12)], "bodyweight_reps" as never)], "ex", "bodyweight_reps");
    expect(pr.bestReps?.value).toBe(12);
    expect(pr.maxWeight).toBeUndefined();
  });
});
