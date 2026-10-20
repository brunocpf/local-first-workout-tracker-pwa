import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgramDraft, saveProgramImport, type ExerciseResolution } from "#lib/imports/saveProgram";
import { parseProgramImport, unresolvedExercises } from "#lib/imports/parseProgram";
import type { ProgramImportV1 } from "#lib/imports/programSchema";
import { AppDB } from "#lib/storage/db";
import type { Exercise } from "#lib/types";

const load = (): ProgramImportV1 => {
  const r = parseProgramImport(readFileSync("tests/fixtures/program-full.json", "utf8"));
  if (!r.ok) throw new Error(r.errors.join());
  return r.data;
};
const resolveAll = (data: ProgramImportV1): Record<string, ExerciseResolution> =>
  Object.fromEntries(
    unresolvedExercises(data).map(({ path, ref }) => [
      path,
      { kind: "create", name: ref.name ?? "x", exerciseType: ref.exerciseType ?? "weighted_reps", equipment: ref.equipment } as ExerciseResolution,
    ]),
  );
const catalogEx = (id: string): Exercise => ({
  id, name: id, aliases: [], primaryMuscles: [], secondaryMuscles: [], equipment: [],
  exerciseType: "weighted_reps", isCustom: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

let db: AppDB;
beforeEach(async () => {
  db = new AppDB(`save-program-${crypto.randomUUID()}`);
  const ids = new Set<string>();
  for (const r of load().program.routines) for (const e of r.exercises) if (e.exercise.id) ids.add(e.exercise.id);
  await db.exercises.bulkAdd([...ids].map(catalogEx));
});
afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await db.delete();
});

describe("buildProgramDraft", () => {
  it("maps sets, setList, superset groups, order and schedule", () => {
    const data = load();
    const d = buildProgramDraft(data, resolveAll(data));
    expect(d.unresolved).toEqual([]);
    expect(d.routines.map((r) => r.programOrder)).toEqual([0, 1, 2, 3]);
    const upperA = d.routines[0];
    expect(upperA.exercises[0].prescribedSets.map((s) => s.type)).toEqual(["warmup", "warmup", "normal", "normal", "drop"]);
    expect(upperA.exercises[0].prescribedSets[2]).toMatchObject({ targetRpe: 8, repRange: [6, 10], targetWeight: 80 });
    expect(upperA.exercises[1].prescribedSets).toHaveLength(3);
    expect(upperA.exercises[1].prescribedSets[0].targetRir).toBe(2);
    expect(upperA.exercises[1].supersetGroupId).toBeDefined();
    expect(upperA.exercises[1].supersetGroupId).toBe(upperA.exercises[2].supersetGroupId);
    expect(d.routines[1].exercises[2].prescribedSets[0].targetDistance).toBe(30);
    expect(d.program.schedule?.days.map((x) => x.routineId)).toEqual(d.routines.map((r) => r.id));
    expect(d.program.schemaVersion).toBe(1);
    expect(d.routines.every((r) => r.programId === d.program.id)).toBe(true);
    expect(d.newExercises.length).toBe(unresolvedExercises(data).length);
  });

  it("reports unresolved paths and drops emptied routines with a warning", () => {
    const data = load();
    expect(buildProgramDraft(data, {}).unresolved.length).toBeGreaterThan(0);
    const res: Record<string, ExerciseResolution> = {};
    for (const { path } of unresolvedExercises(data)) res[path] = { kind: "drop" };
    const lowerIdx = data.program.routines.findIndex((r) => r.id === "lower_a");
    // drop every exercise of lower_a
    data.program.routines[lowerIdx].exercises.forEach((_, ei) => {
      res[`program.routines[${lowerIdx}].exercises[${ei}].exercise`] = { kind: "drop" };
    });
    const d = buildProgramDraft(data, res);
    expect(d.unresolved).toEqual([]);
    expect(d.routines.map((r) => r.name)).not.toContain("Lower A");
    expect(d.routines.map((r) => r.programOrder)).toEqual([0, 1, 2]);
    expect(d.warnings.some((w) => w.includes("Lower A"))).toBe(true);
    expect(d.program.schedule?.days).toHaveLength(3);
  });

  it("honors a program name override and an exercise mapping", () => {
    const data = load();
    const path = unresolvedExercises(data)[0].path;
    const d = buildProgramDraft(data, { [path]: { kind: "exercise", exerciseId: "mapped" } }, { programName: "  Mine " });
    expect(d.program.name).toBe("Mine");
    expect(d.routines.flatMap((r) => r.exercises).some((e) => e.exerciseId === "mapped")).toBe(true);
  });
});

describe("saveProgramImport", () => {
  it("importing the same file twice creates independent programs", async () => {
    const data = load();
    await saveProgramImport(buildProgramDraft(data, resolveAll(data)), db);
    await saveProgramImport(buildProgramDraft(data, resolveAll(data)), db);
    expect(await db.programs.count()).toBe(2);
    expect(await db.routines.count()).toBe(8);
    expect(new Set((await db.routines.toArray()).map((r) => r.id)).size).toBe(8);
  });

  it("refuses unresolved drafts and writes nothing", async () => {
    const data = load();
    await expect(saveProgramImport(buildProgramDraft(data, {}), db)).rejects.toThrow(/Unresolved/);
    expect(await db.programs.count()).toBe(0);
  });

  it("refuses unknown catalog ids and writes nothing", async () => {
    const data = load();
    const draft = buildProgramDraft(data, resolveAll(data));
    draft.routines[0].exercises[0].exerciseId = "nope";
    await expect(saveProgramImport(draft, db)).rejects.toThrow(/Unknown exercises/);
    expect(await db.exercises.count()).toBeGreaterThan(0);
    expect(await db.exercises.where("isCustom").equals(1 as never).count()).toBe(0);
    expect(await db.programs.count()).toBe(0);
  });

  it("an injected failure mid-save leaves the DB unchanged", async () => {
    const data = load();
    const before = await db.exercises.count();
    vi.spyOn(db.routines, "bulkAdd").mockRejectedValue(new Error("boom"));
    await expect(saveProgramImport(buildProgramDraft(data, resolveAll(data)), db)).rejects.toThrow("boom");
    expect(await db.exercises.count()).toBe(before);
    expect(await db.programs.count()).toBe(0);
    expect(await db.routines.count()).toBe(0);
  });
});
