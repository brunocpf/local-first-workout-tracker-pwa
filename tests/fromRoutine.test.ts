import { describe, expect, it } from "vitest";
import { sessionInputFromRoutine } from "#lib/logger/fromRoutine";
import type { Exercise, Routine } from "#lib/types";

const exercises = new Map<string, Pick<Exercise, "name" | "exerciseType">>([
  ["bench", { name: "Bench Press", exerciseType: "weighted_reps" }],
  ["row", { name: "Barbell Row", exerciseType: "weighted_reps" }],
  ["plank", { name: "Plank", exerciseType: "duration" }],
]);

const routine = (): Routine => ({
  id: "r1",
  programId: "p1",
  programOrder: 0,
  name: "Push A",
  exercises: [
    {
      id: "re1",
      exerciseId: "bench",
      prescribedSets: [
        { id: "ps1", type: "warmup", repRange: [8, 10], targetWeight: 40 },
        { id: "ps2", type: "normal", repRange: [5, 8], targetRpe: 8 },
      ],
      restSeconds: 120,
      notes: "Pause on chest",
      supersetGroupId: "A",
    },
    { id: "re2", exerciseId: "row", prescribedSets: [{ id: "ps3", type: "normal" }] },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("sessionInputFromRoutine", () => {
  it("sets name, routine/program references and the name snapshot", () => {
    const { session } = sessionInputFromRoutine(routine(), exercises);
    expect(session.name).toBe("Push A");
    expect(session.routineId).toBe("r1");
    expect(session.programId).toBe("p1");
    expect(session.routineNameSnapshot).toBe("Push A");
  });

  it("omits programId for a standalone routine", () => {
    const r = { ...routine(), programId: undefined };
    const { session } = sessionInputFromRoutine(r, exercises);
    expect(session).not.toHaveProperty("programId");
  });

  it("copies exercise snapshots, prescription, rest, superset and notes", () => {
    const { session, skippedExerciseIds } = sessionInputFromRoutine(routine(), exercises);
    expect(skippedExerciseIds).toEqual([]);
    const [bench, row] = session.exercises ?? [];
    expect(bench).toMatchObject({
      exerciseId: "bench",
      exerciseNameSnapshot: "Bench Press",
      exerciseTypeSnapshot: "weighted_reps",
      restSeconds: 120,
      supersetGroupId: "A",
      notes: "Pause on chest",
      prescribedSets: [
        { id: "ps1", type: "warmup", repRange: [8, 10], targetWeight: 40 },
        { id: "ps2", type: "normal", repRange: [5, 8], targetRpe: 8 },
      ],
    });
    expect(row.prescribedSets).toEqual([{ id: "ps3", type: "normal" }]);
    expect(row).not.toHaveProperty("restSeconds");
    expect(row).not.toHaveProperty("notes");
  });

  it("creates one initial uncompleted set per prescribed set, linked to it", () => {
    const { session } = sessionInputFromRoutine(routine(), exercises);
    const bench = session.exercises?.[0];
    expect(bench?.sets).toHaveLength(2);
    expect(bench?.sets.map((s) => s.prescribedSetId)).toEqual(["ps1", "ps2"]);
    expect(bench?.sets.map((s) => s.type)).toEqual(["warmup", "normal"]);
    for (const s of bench?.sets ?? []) {
      expect(s.completedAt).toBeUndefined();
      expect(s.id).toBeTruthy();
    }
  });

  it("keeps the session input independent of later routine edits (deep copy)", () => {
    const r = routine();
    const { session } = sessionInputFromRoutine(r, exercises);
    const before = structuredClone(session);

    r.name = "Changed";
    r.programId = "other";
    r.exercises[0].restSeconds = 999;
    r.exercises[0].notes = "edited";
    r.exercises[0].prescribedSets[0].targetWeight = 1000;
    r.exercises[0].prescribedSets[0].repRange![0] = 1;
    r.exercises[0].prescribedSets.push({ id: "extra", type: "normal" });
    r.exercises.pop();

    expect(session).toEqual(before);
  });

  it("does not alias prescription arrays between the routine and the session", () => {
    const r = routine();
    const { session } = sessionInputFromRoutine(r, exercises);
    const bench = session.exercises?.[0];
    expect(bench?.prescribedSets).not.toBe(r.exercises[0].prescribedSets);
    expect(bench?.prescribedSets?.[0]).not.toBe(r.exercises[0].prescribedSets[0]);
    expect(bench?.prescribedSets?.[0].repRange).not.toBe(r.exercises[0].prescribedSets[0].repRange);
  });

  it("skips exercises missing from the catalog and reports them", () => {
    const r = routine();
    r.exercises.unshift({ id: "re0", exerciseId: "ghost", prescribedSets: [{ id: "g1", type: "normal" }] });
    const { session, skippedExerciseIds } = sessionInputFromRoutine(r, exercises);
    expect(skippedExerciseIds).toEqual(["ghost"]);
    expect(session.exercises?.map((e) => e.exerciseId)).toEqual(["bench", "row"]);
  });

  it("keeps the routine's exercise order and reports an empty session when nothing matches", () => {
    const { session, skippedExerciseIds } = sessionInputFromRoutine(
      { ...routine(), exercises: [{ id: "x", exerciseId: "nope", prescribedSets: [] }] },
      exercises,
    );
    expect(session.exercises).toEqual([]);
    expect(skippedExerciseIds).toEqual(["nope"]);
  });

  it("gives fresh ids to every session exercise and set on each call", () => {
    const r = routine();
    const a = sessionInputFromRoutine(r, exercises).session.exercises?.[0];
    const b = sessionInputFromRoutine(r, exercises).session.exercises?.[0];
    expect(a?.id).not.toBe(b?.id);
    expect(a?.sets[0].id).not.toBe(b?.sets[0].id);
  });
});
