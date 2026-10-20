import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "#lib/ids";
import { AppDB } from "#lib/storage/db";
import {
  deleteProgram,
  deleteRoutine,
  duplicateRoutine,
  getProgram,
  getRoutine,
  listRoutinesGrouped,
  saveRoutine,
} from "#lib/storage/routines";
import type { Program, Routine, WorkoutSession } from "#lib/types";

const T0 = "2026-01-01T10:00:00.000Z";

const routine = (over: Partial<Routine> & { id: string; name: string }): Routine => ({
  exercises: [
    {
      id: `${over.id}-ex1`,
      exerciseId: "bench",
      prescribedSets: [
        { id: `${over.id}-set1`, type: "normal", repRange: [5, 5], targetWeight: 100 },
        { id: `${over.id}-set2`, type: "normal", repRange: [5, 5], targetWeight: 100 },
      ],
      restSeconds: 120,
    },
  ],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const program = (over: Partial<Program> & { id: string; name: string }): Program => ({
  schemaVersion: 1,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const session = (over: Partial<WorkoutSession> & { id: string }): WorkoutSession => ({
  name: "Push",
  status: "completed",
  startedAt: "2026-01-02T10:00:00.000Z",
  endedAt: "2026-01-02T11:00:00.000Z",
  timeZone: "Europe/Lisbon",
  routineId: "push-a",
  programId: "ppl",
  routineNameSnapshot: "Push A",
  exercises: [
    {
      id: "se1",
      exerciseId: "bench",
      exerciseNameSnapshot: "Bench Press",
      exerciseTypeSnapshot: "weighted_reps",
      sets: [{ id: "a", type: "normal", weight: 100, reps: 5, completedAt: "2026-01-02T10:10:00.000Z" }],
    },
  ],
  exerciseIds: ["bench"],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

let database: AppDB;

beforeEach(async () => {
  // Unique name per test so runs never share IndexedDB state.
  database = new AppDB(`routines-test-${newId()}`);
  await database.open();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe("routine repository", () => {
  it("lists programs with routines sorted by programOrder, then standalone routines by name", async () => {
    await database.programs.bulkPut([program({ id: "ppl", name: "PPL" }), program({ id: "ul", name: "Upper/Lower" })]);
    await database.routines.bulkPut([
      routine({ id: "legs", name: "Legs", programId: "ppl", programOrder: 2 }),
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }),
      routine({ id: "pull", name: "Pull", programId: "ppl", programOrder: 1 }),
      routine({ id: "upper", name: "Upper", programId: "ul", programOrder: 0 }),
      routine({ id: "zeta", name: "Zeta" }),
      routine({ id: "alpha", name: "Alpha" }),
    ]);

    const grouped = await listRoutinesGrouped(database);

    expect(grouped.programs.map((p) => p.program.id)).toEqual(["ppl", "ul"]);
    expect(grouped.programs[0].routines.map((r) => r.id)).toEqual(["push", "pull", "legs"]);
    expect(grouped.programs[1].routines.map((r) => r.id)).toEqual(["upper"]);
    expect(grouped.standalone.map((r) => r.id)).toEqual(["alpha", "zeta"]);
  });

  it("lists a routine whose program does not exist as standalone instead of hiding it", async () => {
    await database.routines.put(routine({ id: "orphan", name: "Orphan", programId: "gone", programOrder: 0 }));

    const grouped = await listRoutinesGrouped(database);

    expect(grouped.programs).toEqual([]);
    expect(grouped.standalone.map((r) => r.id)).toEqual(["orphan"]);
  });

  it("getRoutine and getProgram return stored rows or undefined", async () => {
    await database.programs.put(program({ id: "ppl", name: "PPL" }));
    await database.routines.put(routine({ id: "push", name: "Push" }));

    expect((await getRoutine("push", database))?.name).toBe("Push");
    expect(await getRoutine("missing", database)).toBeUndefined();
    expect((await getProgram("ppl", database))?.name).toBe("PPL");
    expect(await getProgram("missing", database)).toBeUndefined();
  });

  it("saveRoutine stores a plain copy and bumps updatedAt", async () => {
    const r = routine({ id: "push", name: "Push" });
    await database.routines.put(r);

    const edited = { ...r, name: "Push day", exercises: [...r.exercises] };
    const saved = await saveRoutine(edited, database);

    expect(saved.name).toBe("Push day");
    expect(saved.createdAt).toBe(T0);
    expect(saved.updatedAt).not.toBe(T0);
    expect(await getRoutine("push", database)).toEqual(saved);
  });

  it("duplicateRoutine gives fresh ids to the routine, exercises and prescribed sets", async () => {
    const source = routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 });
    await database.routines.put(source);

    const copy = await duplicateRoutine("push", database);

    expect(copy.id).not.toBe("push");
    expect(copy.name).toBe("Push (copy)");
    expect(copy.exercises[0].id).not.toBe(source.exercises[0].id);
    expect(copy.exercises[0].exerciseId).toBe("bench");
    expect(copy.exercises[0].restSeconds).toBe(120);
    const ids = copy.exercises[0].prescribedSets.map((s) => s.id);
    expect(ids).not.toContain("push-set1");
    expect(new Set(ids).size).toBe(2);
    expect(copy.exercises[0].prescribedSets[0].targetWeight).toBe(100);
    expect(await getRoutine(copy.id, database)).toEqual(copy);
    // The source is untouched.
    expect((await getRoutine("push", database))?.name).toBe("Push");
  });

  it("duplicateRoutine makes a standalone copy (no program membership)", async () => {
    await database.routines.put(routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }));
    const copy = await duplicateRoutine("push", database);
    expect(copy.programId).toBeUndefined();
    expect(copy.programOrder).toBeUndefined();
  });

  it("duplicateRoutine throws for an unknown routine", async () => {
    await expect(duplicateRoutine("missing", database)).rejects.toThrow(/not found/);
  });

  it("deleteRoutine removes the routine and from its program's weekly schedule", async () => {
    await database.programs.put(
      program({
        id: "ppl",
        name: "PPL",
        schedule: {
          type: "weekly",
          days: [
            { day: "mon", routineId: "push" },
            { day: "tue", routineId: "pull" },
            { day: "thu", routineId: "push" },
          ],
        },
      }),
    );
    await database.routines.bulkPut([
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }),
      routine({ id: "pull", name: "Pull", programId: "ppl", programOrder: 1 }),
    ]);

    await deleteRoutine("push", database);

    expect(await getRoutine("push", database)).toBeUndefined();
    const updated = await getProgram("ppl", database);
    expect(updated?.schedule?.days).toEqual([{ day: "tue", routineId: "pull" }]);
    expect(updated?.updatedAt).not.toBe(T0);
    expect((await listRoutinesGrouped(database)).programs[0].routines.map((r) => r.id)).toEqual(["pull"]);
  });

  it("deleteRoutine leaves the program alone when the routine was not scheduled", async () => {
    const schedule = { type: "weekly" as const, days: [{ day: "mon", routineId: "pull" }] };
    await database.programs.put(program({ id: "ppl", name: "PPL", schedule }));
    await database.routines.put(routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }));

    await deleteRoutine("push", database);

    expect(await getProgram("ppl", database)).toEqual(program({ id: "ppl", name: "PPL", schedule }));
  });

  it("deleteRoutine on an unknown id is a no-op", async () => {
    await expect(deleteRoutine("missing", database)).resolves.toBeUndefined();
  });

  it("deleteProgram by default turns its routines into standalone routines", async () => {
    await database.programs.put(program({ id: "ppl", name: "PPL" }));
    await database.routines.bulkPut([
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }),
      routine({ id: "pull", name: "Pull", programId: "ppl", programOrder: 1 }),
    ]);

    await deleteProgram("ppl", {}, database);

    expect(await getProgram("ppl", database)).toBeUndefined();
    const push = await getRoutine("push", database);
    expect(push?.programId).toBeUndefined();
    expect(push?.programOrder).toBeUndefined();
    expect(push?.updatedAt).not.toBe(T0);
    const grouped = await listRoutinesGrouped(database);
    expect(grouped.programs).toEqual([]);
    expect(grouped.standalone.map((r) => r.id)).toEqual(["pull", "push"]);
  });

  it("deleteProgram with deleteRoutines removes the program and its routines", async () => {
    await database.programs.put(program({ id: "ppl", name: "PPL" }));
    await database.routines.bulkPut([
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }),
      routine({ id: "solo", name: "Solo" }),
    ]);

    await deleteProgram("ppl", { deleteRoutines: true }, database);

    expect(await getProgram("ppl", database)).toBeUndefined();
    expect(await getRoutine("push", database)).toBeUndefined();
    expect((await listRoutinesGrouped(database)).standalone.map((r) => r.id)).toEqual(["solo"]);
  });

  it("editing or deleting routines and programs never modifies any session", async () => {
    await database.programs.put(
      program({ id: "ppl", name: "PPL", schedule: { type: "weekly", days: [{ day: "mon", routineId: "push" }] } }),
    );
    await database.routines.bulkPut([
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0 }),
      routine({ id: "pull", name: "Pull", programId: "ppl", programOrder: 1 }),
      routine({ id: "solo", name: "Solo" }),
    ]);
    await database.sessions.bulkPut([
      session({ id: "s1" }),
      session({ id: "s2", routineId: "pull", programId: undefined, exerciseIds: ["bench"] }),
    ]);
    const before = await database.sessions.toArray();

    const push = await getRoutine("push", database);
    await saveRoutine({ ...push!, name: "Push (renamed)", exercises: [] }, database);
    await duplicateRoutine("pull", database);
    await deleteRoutine("push", database);
    await deleteProgram("ppl", { deleteRoutines: true }, database);
    await deleteRoutine("solo", database);

    expect(await database.sessions.toArray()).toEqual(before);
  });
});
