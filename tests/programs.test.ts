import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "#lib/ids";
import { AppDB } from "#lib/storage/db";
import {
  createProgram,
  deleteProgram,
  getProgram,
  getRoutine,
  listRoutinesGrouped,
  renameProgram,
  reorderProgramRoutines,
  setRoutineProgram,
} from "#lib/storage/routines";
import type { Routine, WorkoutSession } from "#lib/types";

const T0 = "2026-01-01T10:00:00.000Z";
const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id,
  name: id,
  exercises: [],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

let database: AppDB;
beforeEach(async () => {
  database = new AppDB(`programs-test-${newId()}`);
  await database.open();
});
afterEach(async () => {
  database.close();
  await database.delete();
});

const orderOf = async (programId: string) =>
  (await listRoutinesGrouped(database)).programs.find((p) => p.program.id === programId)!.routines.map((r) => r.id);

describe("programs", () => {
  it("creates and renames with trimmed, non-empty names", async () => {
    const p = await createProgram("  PPL  ", database);
    expect(p.name).toBe("PPL");
    expect((await renameProgram(p.id, " Push Pull Legs ", database)).name).toBe("Push Pull Legs");
    expect((await getProgram(p.id, database))?.name).toBe("Push Pull Legs");
    await expect(createProgram("  ", database)).rejects.toThrow();
    await expect(renameProgram(p.id, "", database)).rejects.toThrow();
    await expect(renameProgram("missing", "x", database)).rejects.toThrow();
  });

  it("appends routines to the end and makes them standalone again", async () => {
    const p = await createProgram("P", database);
    await database.routines.bulkAdd([routine("a"), routine("b"), routine("c")]);
    await setRoutineProgram("b", p.id, database);
    await setRoutineProgram("a", p.id, database);
    await setRoutineProgram("a", p.id, database); // no-op
    expect(await orderOf(p.id)).toEqual(["b", "a"]);
    await setRoutineProgram("b", undefined, database);
    const b = await getRoutine("b", database);
    expect(b?.programId).toBeUndefined();
    expect(b?.programOrder).toBeUndefined();
    expect(await orderOf(p.id)).toEqual(["a"]);
    await expect(setRoutineProgram("a", "missing", database)).rejects.toThrow();
    await expect(setRoutineProgram("nope", p.id, database)).rejects.toThrow();
  });

  it("moving a routine to another program drops it from the old schedule", async () => {
    const p1 = await createProgram("P1", database);
    const p2 = await createProgram("P2", database);
    await database.programs.update(p1.id, { schedule: { type: "weekly", days: [{ day: "mon", routineId: "a" }] } });
    await database.routines.add(routine("a", { programId: p1.id, programOrder: 0 }));
    await setRoutineProgram("a", p2.id, database);
    expect((await getProgram(p1.id, database))?.schedule?.days).toEqual([]);
    expect((await getRoutine("a", database))?.programId).toBe(p2.id);
  });

  it("reorders, and rejects lists that don't match the program's routines", async () => {
    const p = await createProgram("P", database);
    await database.routines.bulkAdd([routine("a"), routine("b"), routine("c"), routine("x")]);
    for (const id of ["a", "b", "c"]) await setRoutineProgram(id, p.id, database);
    await reorderProgramRoutines(p.id, ["c", "a", "b"], database);
    expect(await orderOf(p.id)).toEqual(["c", "a", "b"]);
    await expect(reorderProgramRoutines(p.id, ["c", "a"], database)).rejects.toThrow();
    await expect(reorderProgramRoutines(p.id, ["c", "a", "x"], database)).rejects.toThrow();
    await expect(reorderProgramRoutines(p.id, ["c", "c", "a"], database)).rejects.toThrow();
    expect(await orderOf(p.id)).toEqual(["c", "a", "b"]);
  });

  it("deleting a program keeps or deletes routines but never touches sessions", async () => {
    const session: WorkoutSession = {
      id: "s1",
      name: "A",
      status: "completed",
      startedAt: T0,
      endedAt: T0,
      timeZone: "UTC",
      routineId: "a",
      programId: "p",
      routineNameSnapshot: "a",
      exercises: [],
      exerciseIds: [],
      createdAt: T0,
      updatedAt: T0,
    };
    for (const deleteRoutines of [false, true]) {
      const p = await createProgram("P", database);
      const id = `r-${deleteRoutines}`;
      await database.routines.add(routine(id));
      await setRoutineProgram(id, p.id, database);
      await database.sessions.put({ ...session, id: `s-${deleteRoutines}`, programId: p.id, routineId: id });
      const before = await database.sessions.toArray();
      await deleteProgram(p.id, { deleteRoutines }, database);
      expect(await getProgram(p.id, database)).toBeUndefined();
      const r = await getRoutine(id, database);
      if (deleteRoutines) expect(r).toBeUndefined();
      else expect(r && r.programId === undefined && r.programOrder === undefined).toBe(true);
      expect(await database.sessions.toArray()).toEqual(before);
    }
  });
});
