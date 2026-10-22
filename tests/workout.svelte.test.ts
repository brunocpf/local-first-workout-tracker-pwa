import { describe, expect, it } from "vitest";
import { addSet, completeSet, createSessionExercise, duplicateSet, removeSet, restoreSet, updateSet } from "#lib/logger/workout";

describe("workout helpers on $state proxies", () => {
  it("mutates reactive objects in place", () => {
    const se = $state(createSessionExercise({ id: "b", name: "Bench", exerciseType: "weighted_reps" }, { prescribedSets: [{ id: "p", type: "normal" }] }));
    updateSet(se, se.sets[0].id, { weight: 40, reps: 5 });
    completeSet(se.sets[0], {}, "2026-01-01T00:00:00.000Z");
    const added = addSet(se);
    expect(se.sets).toHaveLength(2);
    expect(added.weight).toBe(40);
    const before = $state.snapshot(se);
    restoreSet(se, removeSet(se, added.id)!);
    expect($state.snapshot(se)).toEqual(before);
  });

  it("duplicates a set held in a $state proxy", () => {
    const se = $state(createSessionExercise({ id: "b", name: "Bench", exerciseType: "weighted_reps" }, { prescribedSets: [{ id: "p", type: "normal" }] }));
    updateSet(se, se.sets[0].id, { weight: 40, reps: 5 });
    completeSet(se.sets[0], {}, "2026-01-01T00:00:00.000Z");
    const copy = duplicateSet(se, se.sets[0].id)!;
    expect($state.snapshot(se.sets[1])).toEqual({ id: copy.id, type: "normal", weight: 40, reps: 5 });
  });
});
