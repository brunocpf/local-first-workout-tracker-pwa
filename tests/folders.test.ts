import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "#lib/ids";
import { AppDB } from "#lib/storage/db";
import {
  createFolder,
  deleteFolder,
  deleteProgram,
  duplicateRoutine,
  FOLDER_NAME_MAX,
  groupByFolder,
  listFolders,
  listRoutinesGrouped,
  quickStartRoutines,
  renameFolder,
  setRoutineFavorite,
  setRoutineFolder,
  type RoutinesGrouped,
} from "#lib/storage/routines";
import type { Program, Routine, RoutineFolder } from "#lib/types";

const T0 = "2026-01-01T10:00:00.000Z";

const routine = (over: Partial<Routine> & { id: string; name: string }): Routine => ({
  exercises: [{ id: `${over.id}-ex1`, exerciseId: "bench", prescribedSets: [{ id: `${over.id}-set1`, type: "normal", repRange: [5, 5] }] }],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});
const program = (over: Partial<Program> & { id: string; name: string }): Program => ({ schemaVersion: 1, createdAt: T0, updatedAt: T0, ...over });
const folder = (id: string, name: string): RoutineFolder => ({ id, name, createdAt: T0, updatedAt: T0 });

let database: AppDB;

beforeEach(async () => {
  database = new AppDB(`folders-test-${newId()}`);
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  database.close();
  await database.delete();
});

describe("folder repository", () => {
  it("creates folders with a trimmed name and lists them by name", async () => {
    const b = await createFolder("  Strength ", database);
    const a = await createFolder("Accessories", database);
    expect(b).toMatchObject({ name: "Strength", createdAt: b.updatedAt });
    expect(await listFolders(database)).toEqual([a, b]);
  });

  it("rejects an empty or overlong name without writing", async () => {
    await expect(createFolder("   ", database)).rejects.toThrow(/required/);
    await expect(createFolder("x".repeat(FOLDER_NAME_MAX + 1), database)).rejects.toThrow(/longer/);
    expect(await database.folders.count()).toBe(0);
    await createFolder("x".repeat(FOLDER_NAME_MAX), database);
  });

  it("renames a folder and bumps updatedAt", async () => {
    await database.folders.put(folder("f1", "Old"));
    const renamed = await renameFolder("f1", " New ", database);
    expect(renamed.name).toBe("New");
    expect(renamed.updatedAt > T0).toBe(true);
    expect(await database.folders.get("f1")).toEqual(renamed);
    await expect(renameFolder("f1", "", database)).rejects.toThrow(/required/);
    await expect(renameFolder("missing", "X", database)).rejects.toThrow(/not found/);
  });

  it("deleting a folder keeps its routines and moves them to no folder", async () => {
    await database.folders.bulkPut([folder("f1", "Arms"), folder("f2", "Legs")]);
    await database.routines.bulkPut([
      routine({ id: "curl", name: "Curls", folderId: "f1", favorite: true }),
      routine({ id: "pull", name: "Pull", folderId: "f1", programId: "ppl", programOrder: 0 }),
      routine({ id: "squat", name: "Squat", folderId: "f2" }),
    ]);
    await deleteFolder("f1", database);

    expect(await database.folders.toArray()).toEqual([folder("f2", "Legs")]);
    const curl = (await database.routines.get("curl"))!;
    expect(curl).not.toHaveProperty("folderId");
    expect(curl).toMatchObject({ favorite: true, exercises: routine({ id: "curl", name: "" }).exercises });
    expect(curl.updatedAt > T0).toBe(true);
    // Program membership is untouched; other folders keep their routines.
    expect(await database.routines.get("pull")).toMatchObject({ programId: "ppl", programOrder: 0 });
    expect((await database.routines.get("squat"))?.folderId).toBe("f2");
  });

  it("a failed folder delete leaves the folder and its routines untouched", async () => {
    await database.folders.put(folder("f1", "Arms"));
    await database.routines.put(routine({ id: "curl", name: "Curls", folderId: "f1" }));
    vi.spyOn(database.folders, "delete").mockRejectedValueOnce(new Error("QuotaExceededError"));
    await expect(deleteFolder("f1", database)).rejects.toThrow("QuotaExceededError");
    expect(await database.folders.get("f1")).toEqual(folder("f1", "Arms"));
    expect(await database.routines.get("curl")).toEqual(routine({ id: "curl", name: "Curls", folderId: "f1" }));
  });

  it("moves a routine into a folder, between folders and out of any folder", async () => {
    await database.folders.bulkPut([folder("f1", "Arms"), folder("f2", "Legs")]);
    await database.routines.put(routine({ id: "r", name: "R", programId: "ppl", programOrder: 3 }));

    await setRoutineFolder("r", "f1", database);
    expect(await database.routines.get("r")).toMatchObject({ folderId: "f1", programId: "ppl", programOrder: 3 });
    await setRoutineFolder("r", "f2", database);
    expect((await database.routines.get("r"))?.folderId).toBe("f2");
    await setRoutineFolder("r", undefined, database);
    expect(await database.routines.get("r")).not.toHaveProperty("folderId");
  });

  it("rejects an unknown folder or routine and changes nothing", async () => {
    await database.routines.put(routine({ id: "r", name: "R" }));
    await expect(setRoutineFolder("r", "missing", database)).rejects.toThrow(/not found/);
    await expect(setRoutineFolder("missing", undefined, database)).rejects.toThrow(/not found/);
    expect(await database.routines.get("r")).toEqual(routine({ id: "r", name: "R" }));
  });

  it("re-filing into the same folder is a no-op", async () => {
    await database.folders.put(folder("f1", "Arms"));
    await database.routines.put(routine({ id: "r", name: "R", folderId: "f1" }));
    await setRoutineFolder("r", "f1", database);
    expect((await database.routines.get("r"))?.updatedAt).toBe(T0);
  });

  it("can move a routine out of a folder that no longer exists", async () => {
    await database.routines.put(routine({ id: "r", name: "R", folderId: "gone" }));
    await setRoutineFolder("r", undefined, database);
    expect(await database.routines.get("r")).not.toHaveProperty("folderId");
  });
});

describe("routine favorites", () => {
  it("sets and clears the favorite flag (cleared = field removed)", async () => {
    await database.routines.put(routine({ id: "r", name: "R", folderId: "f1" }));
    await setRoutineFavorite("r", true, database);
    const fav = (await database.routines.get("r"))!;
    expect(fav).toMatchObject({ favorite: true, folderId: "f1" });
    expect(fav.updatedAt > T0).toBe(true);
    await setRoutineFavorite("r", false, database);
    expect(await database.routines.get("r")).not.toHaveProperty("favorite");
    await expect(setRoutineFavorite("missing", true, database)).rejects.toThrow(/not found/);
  });

  it("a copy stays in the folder but is not a favorite", async () => {
    await database.routines.put(routine({ id: "r", name: "R", folderId: "f1", favorite: true }));
    const copy = await duplicateRoutine("r", database);
    expect(copy.folderId).toBe("f1");
    expect(copy).not.toHaveProperty("favorite");
  });

  it("deleting a program keeps its routines' folder and favorite", async () => {
    await database.programs.put(program({ id: "ppl", name: "PPL" }));
    await database.folders.put(folder("f1", "Arms"));
    await database.routines.put(routine({ id: "r", name: "R", programId: "ppl", programOrder: 0, folderId: "f1", favorite: true }));
    await deleteProgram("ppl", {}, database);
    expect(await database.routines.get("r")).toMatchObject({ folderId: "f1", favorite: true });
    expect(groupByFolder(await listRoutinesGrouped(database)).folders[0].routines.map((r) => r.id)).toEqual(["r"]);
  });
});

describe("groupByFolder", () => {
  it("splits standalone routines by folder; program routines stay under their program", async () => {
    await database.programs.put(program({ id: "ppl", name: "PPL" }));
    await database.folders.bulkPut([folder("f2", "Legs"), folder("f1", "Arms"), folder("f3", "Empty")]);
    await database.routines.bulkPut([
      routine({ id: "curl", name: "Curls", folderId: "f1" }),
      routine({ id: "bis", name: "Biceps", folderId: "f1" }),
      routine({ id: "squat", name: "Squat", folderId: "f2" }),
      routine({ id: "push", name: "Push", programId: "ppl", programOrder: 0, folderId: "f1" }),
      routine({ id: "solo", name: "Solo" }),
      routine({ id: "lost", name: "Lost", folderId: "deleted-elsewhere" }),
    ]);
    const grouped = await listRoutinesGrouped(database);
    expect(grouped.folders.map((f) => f.name)).toEqual(["Arms", "Empty", "Legs"]);
    expect(grouped.programs[0].routines.map((r) => r.id)).toEqual(["push"]);
    const { folders, unfiled } = groupByFolder(grouped);
    expect(folders.map((f) => [f.folder.id, f.routines.map((r) => r.id)])).toEqual([
      ["f1", ["bis", "curl"]],
      ["f3", []],
      ["f2", ["squat"]],
    ]);
    expect(unfiled.map((r) => r.id)).toEqual(["lost", "solo"]);
  });
});

describe("quickStartRoutines", () => {
  const grouped = (standalone: Routine[], programRoutines: Routine[] = []): RoutinesGrouped => ({
    programs: [{ program: program({ id: "ppl", name: "PPL" }), routines: programRoutines }],
    standalone,
    folders: [],
  });

  it("lists favorites first by name, then the rest in listing order", () => {
    const g = grouped(
      [routine({ id: "a", name: "A" }), routine({ id: "z", name: "Z", favorite: true })],
      [routine({ id: "p1", name: "Push" }), routine({ id: "p2", name: "Legs", favorite: true })],
    );
    expect(quickStartRoutines(g, 10).map((r) => r.id)).toEqual(["p2", "z", "a", "p1"]);
    expect(quickStartRoutines(g, 3).map((r) => r.id)).toEqual(["p2", "z", "a"]);
  });

  it("without favorites keeps the previous order (standalone, then program routines)", () => {
    const g = grouped([routine({ id: "a", name: "A" })], [routine({ id: "p1", name: "Push" })]);
    expect(quickStartRoutines(g, 3).map((r) => r.id)).toEqual(["a", "p1"]);
    expect(quickStartRoutines(grouped([]), 3)).toEqual([]);
  });
});
