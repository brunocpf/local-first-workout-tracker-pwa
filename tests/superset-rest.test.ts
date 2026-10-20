import { describe, expect, it } from "vitest";
import { joinSuperset, leaveSuperset, supersetInfo, supersetRuns } from "#lib/logger/workout";
import { restAfterSet } from "#lib/restTimer";
import type { SessionExercise, WorkoutSession } from "#lib/types";

const settings = { defaultRestSeconds: 90 };

function ex(id: string, sets: number, opts: { group?: string; rest?: number; done?: number } = {}): SessionExercise {
  return {
    id,
    exerciseId: id,
    exerciseNameSnapshot: id,
    exerciseTypeSnapshot: "weighted_reps",
    ...(opts.group && { supersetGroupId: opts.group }),
    ...(opts.rest !== undefined && { restSeconds: opts.rest }),
    sets: Array.from({ length: sets }, (_, i) => ({
      id: `${id}-s${i}`,
      type: "normal" as const,
      ...(i < (opts.done ?? 0) && { completedAt: "2026-01-01T10:00:00.000Z" }),
    })),
  };
}

const session = (exercises: SessionExercise[]) => ({ exercises }) as WorkoutSession;

describe("restAfterSet", () => {
  it("is unchanged outside supersets", () => {
    const list = [ex("a", 3, { rest: 120 }), ex("b", 3)];
    expect(restAfterSet(list, 0, "a-s0", settings)).toBe(120);
    expect(restAfterSet(list, 1, "b-s0", settings)).toBe(90);
  });

  it("starts no timer until the last member's set of the round is done", () => {
    // A1 just completed its first set; A2's first set is still open.
    const list = [ex("a", 3, { group: "g", rest: 30, done: 1 }), ex("b", 3, { group: "g", rest: 150 })];
    expect(restAfterSet(list, 0, "a-s0", settings)).toBe(0);
  });

  it("uses the last member's rest once the round completes", () => {
    const list = [ex("a", 3, { group: "g", rest: 30, done: 1 }), ex("b", 3, { group: "g", rest: 150, done: 1 })];
    expect(restAfterSet(list, 1, "b-s0", settings)).toBe(150);
  });

  it("falls back to the default when the last member has no override", () => {
    const list = [ex("a", 2, { group: "g", rest: 30, done: 1 }), ex("b", 2, { group: "g", done: 1 })];
    expect(restAfterSet(list, 1, "b-s0", settings)).toBe(90);
  });

  it("handles later rounds independently", () => {
    const list = [ex("a", 3, { group: "g", rest: 30, done: 2 }), ex("b", 3, { group: "g", rest: 60, done: 1 })];
    expect(restAfterSet(list, 0, "a-s1", settings)).toBe(0); // b's second set is open
    const full = [ex("a", 3, { group: "g", rest: 30, done: 2 }), ex("b", 3, { group: "g", rest: 60, done: 2 })];
    expect(restAfterSet(full, 1, "b-s1", settings)).toBe(60);
  });

  it("fires when completing out of order (the last pending set closes the round)", () => {
    const list = [ex("a", 2, { group: "g", rest: 30, done: 1 }), ex("b", 2, { group: "g", rest: 150, done: 1 })];
    expect(restAfterSet(list, 0, "a-s0", settings)).toBe(150);
  });

  it("ignores members that have no set in the round", () => {
    const list = [ex("a", 3, { group: "g", rest: 30, done: 3 }), ex("b", 2, { group: "g", rest: 150, done: 2 })];
    expect(restAfterSet(list, 0, "a-s2", settings)).toBe(30); // b has no third set: a is the last of round 3
  });

  it("treats a lone stale group id as a normal exercise", () => {
    const list = [ex("a", 2, { group: "g", rest: 45 }), ex("b", 2)];
    expect(restAfterSet(list, 0, "a-s0", settings)).toBe(45);
  });
});

describe("supersetRuns / supersetInfo", () => {
  it("labels groups A, B and members 1, 2, … in order", () => {
    const list = [ex("a", 1, { group: "x" }), ex("b", 1, { group: "x" }), ex("c", 1), ex("d", 1, { group: "y" }), ex("e", 1, { group: "y" }), ex("f", 1, { group: "y" })];
    expect(supersetRuns(list)).toEqual([[0, 1], [3, 4, 5]]);
    const info = supersetInfo(list);
    expect(info.get(0)).toEqual({ letter: "A", position: 0, size: 2 });
    expect(info.get(1)).toEqual({ letter: "A", position: 1, size: 2 });
    expect(info.has(2)).toBe(false);
    expect(info.get(5)).toEqual({ letter: "B", position: 2, size: 3 });
  });

  it("does not group non-adjacent exercises that share an id", () => {
    expect(supersetRuns([ex("a", 1, { group: "x" }), ex("b", 1), ex("c", 1, { group: "x" })])).toEqual([]);
  });
});

describe("joinSuperset / leaveSuperset", () => {
  it("creates a group with the next exercise, and reuses it for a third", () => {
    const s = session([ex("a", 1), ex("b", 1), ex("c", 1)]);
    expect(joinSuperset(s, "a", 1)).toBe(true);
    expect(s.exercises[0].supersetGroupId).toBeDefined();
    expect(s.exercises[0].supersetGroupId).toBe(s.exercises[1].supersetGroupId);
    expect(joinSuperset(s, "c", -1)).toBe(true);
    expect(supersetRuns(s.exercises)).toEqual([[0, 1, 2]]);
  });

  it("refuses without a neighbour", () => {
    const s = session([ex("a", 1), ex("b", 1)]);
    expect(joinSuperset(s, "a", -1)).toBe(false);
    expect(joinSuperset(s, "b", 1)).toBe(false);
    expect(joinSuperset(s, "nope", 1)).toBe(false);
  });

  it("removing an end member keeps the rest; a pair dissolves entirely", () => {
    const s = session([ex("a", 1), ex("b", 1), ex("c", 1)]);
    joinSuperset(s, "a", 1);
    joinSuperset(s, "c", -1);
    leaveSuperset(s, "c");
    expect(supersetRuns(s.exercises)).toEqual([[0, 1]]);
    leaveSuperset(s, "a");
    expect(s.exercises.every((e) => e.supersetGroupId === undefined)).toBe(true);
  });

  it("removing a middle member splits the group, leaving a single and a pair", () => {
    const s = session([ex("a", 1), ex("b", 1), ex("c", 1), ex("d", 1)]);
    joinSuperset(s, "a", 1);
    joinSuperset(s, "c", -1);
    joinSuperset(s, "d", -1);
    expect(supersetRuns(s.exercises)).toEqual([[0, 1, 2, 3]]);
    leaveSuperset(s, "b");
    expect(supersetRuns(s.exercises)).toEqual([[2, 3]]);
    expect(s.exercises[0].supersetGroupId).toBeUndefined();
  });

  it("moves an exercise from its old group to the neighbour's", () => {
    const s = session([ex("a", 1), ex("b", 1), ex("c", 1), ex("d", 1)]);
    joinSuperset(s, "a", 1); // a+b
    joinSuperset(s, "c", 1); // c+d
    joinSuperset(s, "b", 1); // b leaves a+b, joins c+d
    expect(supersetRuns(s.exercises)).toEqual([[1, 2, 3]]);
    expect(s.exercises[0].supersetGroupId).toBeUndefined();
  });
});
