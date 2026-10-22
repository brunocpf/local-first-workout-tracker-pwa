import { describe, expect, it } from "vitest";
import {
  addExercise,
  addSet,
  completeSet,
  createSessionExercise,
  duplicateSet,
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  restoreExercise,
  restoreSet,
  setProgress,
  setsFromPrescription,
  uncompleteSet,
  updateSet,
} from "#lib/logger/workout";
import type { PrescribedSet, WorkoutSession } from "#lib/types";

const bench = { id: "bench", name: "Bench Press", exerciseType: "weighted_reps" as const };
const squat = { id: "squat", name: "Squat", exerciseType: "weighted_reps" as const };
const rx: PrescribedSet[] = [
  { id: "p1", type: "warmup" },
  { id: "p2", type: "normal", repRange: [5, 8] },
];
const session = (): WorkoutSession => ({
  id: "s",
  name: "W",
  status: "active",
  startedAt: "2026-01-01T00:00:00.000Z",
  timeZone: "UTC",
  exercises: [],
  exerciseIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const NOW = "2026-01-01T10:00:00.000Z";

describe("setsFromPrescription / createSessionExercise", () => {
  it("creates empty uncompleted sets linked to the prescription", () => {
    const sets = setsFromPrescription(rx);
    expect(sets.map((s) => [s.prescribedSetId, s.type])).toEqual([["p1", "warmup"], ["p2", "normal"]]);
    expect(sets.every((s) => s.completedAt === undefined && s.weight === undefined && s.reps === undefined)).toBe(true);
    expect(new Set(sets.map((s) => s.id)).size).toBe(2);
  });
  it("snapshots names and copies the prescription", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx, restSeconds: 90, supersetGroupId: "g", notes: "n" });
    expect(se).toMatchObject({ exerciseId: "bench", exerciseNameSnapshot: "Bench Press", exerciseTypeSnapshot: "weighted_reps", restSeconds: 90, supersetGroupId: "g", notes: "n" });
    expect(se.prescribedSets).toEqual(rx);
    expect(se.prescribedSets).not.toBe(rx);
    expect(se.sets).toHaveLength(2);
  });
  it("has no sets or prescription by default", () => {
    const se = createSessionExercise(bench);
    expect(se.sets).toEqual([]);
    expect("prescribedSets" in se).toBe(false);
  });
});

describe("exercises", () => {
  it("adds, moves, removes and restores exactly", () => {
    const s = session();
    const a = addExercise(s, createSessionExercise(bench, { prescribedSets: rx }));
    const b = addExercise(s, createSessionExercise(squat));
    const c = addExercise(s, createSessionExercise(bench));
    const before = structuredClone(s.exercises);
    const removed = removeExercise(s, b.id)!;
    expect(removed.index).toBe(1);
    expect(s.exercises.map((e) => e.id)).toEqual([a.id, c.id]);
    restoreExercise(s, removed);
    expect(s.exercises).toEqual(before);
  });
  it("returns undefined for unknown ids", () => {
    expect(removeExercise(session(), "x")).toBeUndefined();
    expect(moveExercise(session(), "x", 0)).toBe(false);
  });
  it("moves to an index, clamped", () => {
    const s = session();
    const [a, b, c] = [bench, squat, bench].map((e) => addExercise(s, createSessionExercise(e)));
    moveExercise(s, c.id, 0);
    expect(s.exercises.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
    moveExercise(s, c.id, 99);
    expect(s.exercises.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("sets", () => {
  it("addSet copies type and weight/reps of the last set, not completion", () => {
    const se = createSessionExercise(bench, { prescribedSets: [{ id: "p", type: "drop" }] });
    updateSet(se, se.sets[0].id, { weight: 50, reps: 8 });
    completeSet(se.sets[0], {}, NOW);
    const s = addSet(se);
    expect(s).toMatchObject({ type: "drop", weight: 50, reps: 8 });
    expect(s.completedAt).toBeUndefined();
    expect(s.prescribedSetId).toBeUndefined();
    expect(se.sets).toHaveLength(2);
  });
  it("addSet on an empty exercise adds a normal set", () => {
    const se = createSessionExercise(bench);
    expect(addSet(se)).toMatchObject({ type: "normal" });
  });
  it("duplicateSet inserts a fresh uncompleted copy after the source", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    updateSet(se, se.sets[0].id, { weight: 20, reps: 10, notes: "x" });
    completeSet(se.sets[0], {}, NOW);
    const copy = duplicateSet(se, se.sets[0].id)!;
    expect(se.sets[1]).toBe(copy);
    expect(copy).toMatchObject({ type: "warmup", weight: 20, reps: 10, notes: "x" });
    expect(copy.id).not.toBe(se.sets[0].id);
    expect(copy.completedAt).toBeUndefined();
    expect(copy.prescribedSetId).toBeUndefined();
    expect(duplicateSet(se, "nope")).toBeUndefined();
  });
  it("remove then restore returns the exact structure", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    addSet(se);
    completeSet(se.sets[1], { weight: 5 }, NOW);
    const before = structuredClone(se);
    const removed = removeSet(se, se.sets[1].id)!;
    expect(removed.index).toBe(1);
    expect(se.sets).toHaveLength(2);
    restoreSet(se, removed);
    expect(se).toEqual(before);
    expect(removeSet(se, "nope")).toBeUndefined();
  });
  it("updateSet never completes or uncompletes, and undefined clears a field", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    const [a, b] = se.sets;
    updateSet(se, a.id, { weight: 60, reps: 5, completedAt: NOW, id: "evil" } as never);
    expect(a.completedAt).toBeUndefined();
    expect(a.id).not.toBe("evil");
    completeSet(b, {}, NOW);
    updateSet(se, b.id, { weight: 1 });
    expect(b.completedAt).toBe(NOW);
    updateSet(se, a.id, { weight: undefined });
    expect("weight" in a).toBe(false);
    expect(updateSet(se, "nope", { weight: 1 })).toBeUndefined();
  });
  it("completeSet fills only missing values and is idempotent", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    const set = se.sets[1];
    updateSet(se, set.id, { weight: 80 });
    completeSet(set, { weight: 70, reps: 6 }, NOW);
    expect(set).toMatchObject({ weight: 80, reps: 6, completedAt: NOW });
    const snap = structuredClone(set);
    completeSet(set, { weight: 1, reps: 1 }, "2027-01-01T00:00:00.000Z");
    expect(set).toEqual(snap);
  });
  it("uncompleteSet clears completion and keeps values", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    completeSet(se.sets[0], { weight: 10, reps: 3 }, NOW);
    uncompleteSet(se.sets[0]);
    expect(se.sets[0]).toMatchObject({ weight: 10, reps: 3 });
    expect(se.sets[0].completedAt).toBeUndefined();
    uncompleteSet(se.sets[0]);
  });
});

describe("replaceExercise (substitutions)", () => {
  const press = { id: "press", name: "Chest Press", exerciseType: "weighted_reps" as const };
  const setup = () => {
    const s = session();
    const se = addExercise(s, createSessionExercise(bench, { prescribedSets: rx, restSeconds: 90, notes: "n" }));
    return { s, se };
  };

  it("swaps in place when nothing is completed, keeping id, prescription, sets and notes", () => {
    const { s, se } = setup();
    updateSet(se, se.sets[1].id, { weight: 60 });
    const setIds = se.sets.map((x) => x.id);
    const result = replaceExercise(s, se.id, press)!;
    expect(result.split).toBe(false);
    expect(s.exercises).toHaveLength(1);
    expect(result.replacement).toBe(se);
    expect(se).toMatchObject({ exerciseId: "press", exerciseNameSnapshot: "Chest Press", restSeconds: 90, notes: "n" });
    expect(se.prescribedSets).toEqual(rx);
    expect(se.sets.map((x) => x.id)).toEqual(setIds);
    expect(se.sets[1].weight).toBe(60);
  });

  it("leaves completed sets on the original and moves the rest to a new exercise after it", () => {
    const { s, se } = setup();
    completeSet(se.sets[0], { weight: 20, reps: 10 }, NOW);
    const [done, todo] = se.sets;
    const result = replaceExercise(s, se.id, press)!;
    expect(result.split).toBe(true);
    expect(s.exercises.map((e) => e.exerciseNameSnapshot)).toEqual(["Bench Press", "Chest Press"]);
    expect(s.exercises[0].sets).toEqual([done]);
    expect(s.exercises[0].exerciseId).toBe("bench");
    const next = s.exercises[1];
    expect(next).toBe(result.replacement);
    expect(next.id).not.toBe(se.id);
    expect(next.sets).toEqual([todo]);
    expect(next.sets[0].prescribedSetId).toBe("p2");
    expect(next.prescribedSets).toEqual(rx);
    expect(next.restSeconds).toBe(90);
  });

  it("gives the replacement one empty set when every set was completed", () => {
    const { s, se } = setup();
    se.sets.forEach((x) => completeSet(x, { weight: 1, reps: 1 }, NOW));
    const result = replaceExercise(s, se.id, press)!;
    expect(s.exercises[0].sets).toHaveLength(2);
    expect(result.replacement.sets).toHaveLength(1);
    expect(result.replacement.sets[0].completedAt).toBeUndefined();
  });

  it("keeps the superset group on the new exercise", () => {
    const { s, se } = setup();
    se.supersetGroupId = "g";
    completeSet(se.sets[0], {}, NOW);
    const result = replaceExercise(s, se.id, press)!;
    expect(result.replacement.supersetGroupId).toBe("g");
  });

  it("returns undefined for an unknown exercise", () => {
    expect(replaceExercise(session(), "nope", press)).toBeUndefined();
  });

  it("setProgress counts completed and remaining sets", () => {
    const se = createSessionExercise(bench, { prescribedSets: rx });
    completeSet(se.sets[0], {}, NOW);
    expect(setProgress(se)).toEqual({ completed: 1, remaining: 1 });
  });
});
