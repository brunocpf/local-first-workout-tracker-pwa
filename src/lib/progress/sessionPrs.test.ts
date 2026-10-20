import { describe, expect, it } from "vitest";
import { describePr, newPrs, priorPrSessions, prSetIds } from "#lib/progress/sessionPrs";
import type { LoggedSet, WorkoutSession } from "#lib/types";

const set = (id: string, weight: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id, type: "normal", weight, reps, completedAt: "2026-01-01T10:00:00.000Z", ...extra,
});
const session = (id: string, startedAt: string, sets: LoggedSet[]): WorkoutSession =>
  ({
    id, name: id, status: "completed", startedAt, timeZone: "UTC", exerciseIds: ["ex"],
    exercises: [{ id: `se-${id}`, exerciseId: "ex", exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets }],
    createdAt: startedAt, updatedAt: startedAt,
  }) as WorkoutSession;

const old = session("old", "2026-01-01T10:00:00.000Z", [set("o1", 80, 8)]);
const now = { id: "now", startedAt: "2026-02-01T10:00:00.000Z" };
const prior = priorPrSessions([old], "ex", now);

describe("prSetIds", () => {
  it("flags a completed set that beats earlier sessions, and not a tie", () => {
    expect(prSetIds(prior, { startedAt: now.startedAt, sets: [set("a", 80, 8)] }).size).toBe(0);
    expect([...prSetIds(prior, { startedAt: now.startedAt, sets: [set("a", 100, 8)] })]).toEqual(["a"]);
  });

  it("drops the badge when the set is uncompleted", () => {
    const sets = [set("a", 100, 8)];
    expect(prSetIds(prior, { startedAt: now.startedAt, sets }).has("a")).toBe(true);
    delete sets[0].completedAt;
    expect(prSetIds(prior, { startedAt: now.startedAt, sets }).size).toBe(0);
  });

  it("ignores warm-ups and flags nothing without earlier history", () => {
    expect(prSetIds(prior, { startedAt: now.startedAt, sets: [set("w", 200, 5, { type: "warmup" })] }).size).toBe(0);
    expect(prSetIds([], { startedAt: now.startedAt, sets: [set("a", 100, 8)] }).size).toBe(0);
  });
});

describe("priorPrSessions", () => {
  it("keeps only completed sessions that started strictly before, other than the session itself", () => {
    const later = session("later", "2026-03-01T10:00:00.000Z", [set("l", 200, 1)]);
    const self = session("now", now.startedAt, [set("s", 200, 1)]);
    const active = { ...session("act", "2026-01-15T10:00:00.000Z", [set("x", 200, 1)]), status: "active" } as WorkoutSession;
    expect(priorPrSessions([old, later, self, active], "ex", now).map((p) => p.startedAt)).toEqual([old.startedAt]);
  });
});

describe("describePr", () => {
  it("formats each kind in the display unit", () => {
    const [max, rep] = newPrs(prior, { startedAt: now.startedAt, sets: [set("a", 100, 8)] });
    expect(describePr(max, "kg")).toBe("Max weight 100 kg");
    expect(describePr(rep, "kg")).toBe("8-rep max 100 kg");
    expect(describePr(max, "lb")).toBe("Max weight 220.46 lb");
  });
});
