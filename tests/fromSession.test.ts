import { describe, expect, it } from "vitest";
import { addRoutineExercise, newRoutine } from "#lib/routines/edit";
import { applySessionToRoutine, diffSessionAgainstRoutine, isDiffEmpty } from "#lib/routines/fromSession";
import type { LoggedSet, Routine, SessionExercise, WorkoutSession } from "#lib/types";

const routineOf = (...specs: [string, number][]): Routine => {
  const r = newRoutine("Push");
  for (const [id, sets] of specs) addRoutineExercise(r, id, { sets });
  return r;
};
const set = (type: LoggedSet["type"] = "normal"): LoggedSet => ({ id: crypto.randomUUID(), type });
const ex = (exerciseId: string, sets: number, warmups = 0): SessionExercise => ({
  id: `s-${exerciseId}-${Math.random()}`,
  exerciseId,
  exerciseNameSnapshot: exerciseId.toUpperCase(),
  exerciseTypeSnapshot: "weighted_reps",
  sets: [...Array.from({ length: warmups }, () => set("warmup")), ...Array.from({ length: sets }, () => set())],
});
const sessionOf = (...exercises: SessionExercise[]) => ({ exercises }) as WorkoutSession;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("session vs routine diff", () => {
  it("is empty when the structure matches (warm-ups ignored)", () => {
    const r = routineOf(["a", 3], ["b", 2]);
    const d = diffSessionAgainstRoutine(sessionOf(ex("a", 3, 2), ex("b", 2)), r);
    expect(isDiffEmpty(d)).toBe(true);
  });

  it("detects added, removed, set count and order changes", () => {
    const r = routineOf(["a", 3], ["b", 3], ["c", 3]);
    const d = diffSessionAgainstRoutine(sessionOf(ex("c", 3), ex("a", 4), ex("d", 2)), r);
    expect(d.added.map((a) => a.exerciseId)).toEqual(["d"]);
    expect(d.removed.map((a) => a.exerciseId)).toEqual(["b"]);
    expect(d.setCountChanges.map((c) => [c.exerciseId, c.from, c.to])).toEqual([["a", 3, 4]]);
    expect(d.reordered).toBe(true);
  });

  it("reads a same-position swap as a replacement", () => {
    const r = routineOf(["a", 3], ["b", 3]);
    const d = diffSessionAgainstRoutine(sessionOf(ex("a", 3), ex("x", 3)), r);
    expect(d.replaced).toMatchObject([{ fromExerciseId: "b", toExerciseId: "x" }]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("applies the diff and keeps untouched prescription data", () => {
    const r = routineOf(["a", 3], ["b", 3], ["c", 3]);
    r.exercises[0].restSeconds = 90;
    r.exercises[0].prescribedSets[0].targetWeight = 50;
    const d = diffSessionAgainstRoutine(sessionOf(ex("c", 3), ex("a", 2), ex("d", 2)), r);
    applySessionToRoutine(r, d);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(["c", "a", "d"]);
    expect(r.exercises[1].prescribedSets).toHaveLength(2);
    expect(r.exercises[1].prescribedSets[0].targetWeight).toBe(50);
    expect(r.exercises[1].restSeconds).toBe(90);
    expect(r.exercises[2].prescribedSets).toHaveLength(2);
    expect(isDiffEmpty(diffSessionAgainstRoutine(sessionOf(ex("c", 3), ex("a", 2), ex("d", 2)), r))).toBe(true);
  });

  it("diffing never mutates the routine", () => {
    const r = routineOf(["a", 3], ["b", 3]);
    const before = JSON.stringify(r);
    diffSessionAgainstRoutine(sessionOf(ex("b", 1)), clone(r));
    diffSessionAgainstRoutine(sessionOf(ex("b", 1)), r);
    expect(JSON.stringify(r)).toBe(before);
  });
});
