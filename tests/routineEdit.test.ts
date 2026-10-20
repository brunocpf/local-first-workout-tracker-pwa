import { describe, expect, it } from "vitest";
import {
  addRoutineExercise,
  groupWithNext,
  stepRoutineExercise,
  ungroupRoutineExercise,
  moveRoutineExercise,
  newRoutine,
  removeRoutineExercise,
  renameRoutine,
  replaceRoutineExercise,
  setNotes,
  setRest,
  setSetCount,
  setSupersetGroup,
  updatePrescribedSet,
  validateRoutine,
} from "#lib/routines/edit";

const build = (...ids: string[]) => {
  const r = newRoutine("  Push ");
  const res = ids.map((id) => addRoutineExercise(r, id));
  return { r, res };
};

describe("routine edit", () => {
  it("creates and renames", () => {
    const r = newRoutine("  Push ");
    expect(r.name).toBe("Push");
    expect(r.exercises).toEqual([]);
    renameRoutine(r, " Pull ");
    expect(r.name).toBe("Pull");
  });

  it("adds exercises with 3 sets of 8-12 and optional rest", () => {
    const r = newRoutine("A");
    const re = addRoutineExercise(r, "bench", { restSeconds: 90 });
    expect(re.prescribedSets).toHaveLength(3);
    expect(re.prescribedSets.every((s) => s.repRange![0] === 8 && s.repRange![1] === 12)).toBe(true);
    expect(new Set(re.prescribedSets.map((s) => s.id)).size).toBe(3);
    expect(re.restSeconds).toBe(90);
    expect(addRoutineExercise(r, "row").restSeconds).toBeUndefined();
  });

  it("removes and moves", () => {
    const { r, res } = build("a", "b", "c");
    expect(moveRoutineExercise(r, 0, 2)).toBe(true);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(["b", "c", "a"]);
    expect(moveRoutineExercise(r, 5, 0)).toBe(false);
    expect(removeRoutineExercise(r, res[1].id)?.exerciseId).toBe("b");
    expect(removeRoutineExercise(r, "nope")).toBeUndefined();
    expect(r.exercises).toHaveLength(2);
  });

  it("replace keeps prescription", () => {
    const { r, res } = build("a");
    setRest(res[0], 60);
    const sets = structuredClone(res[0].prescribedSets);
    expect(replaceRoutineExercise(r, res[0].id, "z")).toBe(true);
    expect(r.exercises[0].exerciseId).toBe("z");
    expect(r.exercises[0].prescribedSets).toEqual(sets);
    expect(r.exercises[0].restSeconds).toBe(60);
    expect(replaceRoutineExercise(r, "nope", "z")).toBe(false);
  });

  it("setSetCount appends copies of the last set and trims", () => {
    const { res } = build("a");
    const re = res[0];
    updatePrescribedSet(re, re.prescribedSets[2].id, { repRange: [5, 5], targetWeight: 100 });
    setSetCount(re, 5);
    expect(re.prescribedSets).toHaveLength(5);
    expect(re.prescribedSets[4]).toMatchObject({ repRange: [5, 5], targetWeight: 100 });
    expect(new Set(re.prescribedSets.map((s) => s.id)).size).toBe(5);
    setSetCount(re, 2);
    expect(re.prescribedSets).toHaveLength(2);
    setSetCount(re, 0);
    setSetCount(re, 1);
    expect(re.prescribedSets).toHaveLength(1);
  });

  it("updates sets, rest and notes", () => {
    const { res } = build("a");
    const re = res[0];
    const id = re.prescribedSets[0].id;
    expect(updatePrescribedSet(re, id, { targetWeight: 50, type: "warmup" })).toBe(true);
    expect(re.prescribedSets[0]).toMatchObject({ targetWeight: 50, type: "warmup" });
    updatePrescribedSet(re, id, { targetWeight: undefined });
    expect(re.prescribedSets[0].targetWeight).toBeUndefined();
    expect(updatePrescribedSet(re, "nope", {})).toBe(false);
    setRest(re, 120);
    expect(re.restSeconds).toBe(120);
    setRest(re, undefined);
    expect("restSeconds" in re).toBe(false);
    setNotes(re, "slow");
    expect(re.notes).toBe("slow");
    setNotes(re, " ");
    expect("notes" in re).toBe(false);
  });

  it("supersets keep members adjacent and dissolve singletons", () => {
    const { r, res } = build("a", "b", "c", "d");
    setSupersetGroup(r, [res[0].id, res[2].id], "g1");
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(["a", "c", "b", "d"]);
    expect(r.exercises.map((e) => e.supersetGroupId)).toEqual(["g1", "g1", undefined, undefined]);
    setSupersetGroup(r, [res[2].id], undefined);
    expect(r.exercises.every((e) => e.supersetGroupId === undefined)).toBe(true);
  });

  it("validates", () => {
    const { r, res } = build("a");
    expect(validateRoutine(r)).toEqual({ errors: [], warnings: [] });
    expect(validateRoutine(newRoutine("A")).warnings).toHaveLength(1);
    renameRoutine(r, " ");
    updatePrescribedSet(res[0], res[0].prescribedSets[0].id, { repRange: [12, 8] });
    updatePrescribedSet(res[0], res[0].prescribedSets[1].id, { targetWeight: -1 });
    setRest(res[0], 0);
    const paths = validateRoutine(r).errors.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "name",
        "exercises[0].restSeconds",
        "exercises[0].prescribedSets[0].repRange",
        "exercises[0].prescribedSets[1].targetWeight",
      ]),
    );
  });
});

describe("builder superset helpers", () => {
  const make = (n: number) => {
    const r = newRoutine("R");
    const ids = Array.from({ length: n }, (_, i) => addRoutineExercise(r, `ex${i}`).id);
    return { r, ids };
  };
  const order = (r: ReturnType<typeof newRoutine>) => r.exercises.map((e) => e.exerciseId).join(",");

  it("groups with next, merging groups, and ungroups", () => {
    const { r, ids } = make(4);
    groupWithNext(r, ids[0]);
    groupWithNext(r, ids[1]);
    expect(new Set(r.exercises.slice(0, 3).map((e) => e.supersetGroupId)).size).toBe(1);
    expect(r.exercises[3].supersetGroupId).toBeUndefined();
    expect(groupWithNext(r, ids[3])).toBe(false);
    ungroupRoutineExercise(r, ids[1]);
    expect(order(r)).toBe("ex0,ex2,ex1,ex3");
    expect(r.exercises.map((e) => !!e.supersetGroupId)).toEqual([true, true, false, false]);
    ungroupRoutineExercise(r, ids[0]);
    expect(r.exercises.every((e) => !e.supersetGroupId)).toBe(true);
  });

  it("moves blocks without splitting groups", () => {
    const { r, ids } = make(4);
    groupWithNext(r, ids[1]);
    stepRoutineExercise(r, 0, 1);
    expect(order(r)).toBe("ex1,ex2,ex0,ex3");
    stepRoutineExercise(r, 0, 1);
    expect(order(r)).toBe("ex2,ex1,ex0,ex3");
    stepRoutineExercise(r, 2, -1);
    expect(order(r)).toBe("ex0,ex2,ex1,ex3");
    stepRoutineExercise(r, 2, 1);
    expect(order(r)).toBe("ex0,ex3,ex2,ex1");
    expect(r.exercises[2].supersetGroupId).toBe(r.exercises[3].supersetGroupId);
    expect(stepRoutineExercise(r, 0, -1)).toBe(false);
  });
});
