import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { buildBackup } from "#lib/backup/export";
import { parseBackup, restoreBackup } from "#lib/backup/restore";
import { AppDB } from "#lib/storage/db";
import { listMeasurements } from "#lib/storage/measurements";
import {
  createFolder,
  deleteFolder,
  groupByFolder,
  listRoutinesGrouped,
  setRoutineFavorite,
  setRoutineFolder,
} from "#lib/storage/routines";
import type { BodyMeasurement, Exercise, Program, Routine, WorkoutSession } from "#lib/types";

/**
 * v2 → v3 (routine folders). The frozen v1 and v2 schemas are copied here, never imported from db.ts, so editing
 * a shipped `version(n)` in place would fail this test. See docs/data-model.md "Migrations".
 */
const V1_STORES = {
  exercises: "id, name, *aliases, isCustom, archivedAt",
  programs: "id, name",
  routines: "id, programId, folderId",
  sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds",
  settings: "key",
};
const V2_STORES = {
  measurements: "id, kind, measuredAt, [kind+measuredAt]",
};

const T = "2026-01-01T10:00:00.000Z";

const EXERCISE: Exercise = {
  id: "custom-curl",
  name: "Zottman Curl",
  aliases: ["Z Curl"],
  primaryMuscles: ["biceps"],
  secondaryMuscles: [],
  equipment: ["dumbbell"],
  exerciseType: "weighted_reps",
  isCustom: true,
  createdAt: T,
  updatedAt: T,
};
const PROGRAM: Program = {
  id: "p1",
  name: "PPL",
  schemaVersion: 1,
  schedule: { type: "weekly", days: [{ day: "monday", routineId: "r-pull" }] },
  createdAt: T,
  updatedAt: T,
};
const exercises = [{ id: "re1", exerciseId: "custom-curl", prescribedSets: [{ id: "ps1", type: "normal" as const, repRange: [8, 12] as [number, number] }] }];
const IN_PROGRAM: Routine = { id: "r-pull", programId: "p1", programOrder: 0, name: "Pull", exercises, createdAt: T, updatedAt: T };
const SOLO: Routine = { id: "r-solo", name: "Arms", exercises, createdAt: T, updatedAt: T };
/** `folderId` existed (indexed, unused) since v1, so a v2 row may carry one that points nowhere. */
const DANGLING: Routine = { id: "r-dangling", name: "Core", exercises: [], folderId: "never-created", createdAt: T, updatedAt: T };
const COMPLETED: WorkoutSession = {
  id: "s1",
  routineId: "r-pull",
  routineNameSnapshot: "Pull",
  name: "Pull",
  status: "completed",
  startedAt: T,
  endedAt: "2026-01-01T11:00:00.000Z",
  timeZone: "Europe/Lisbon",
  exercises: [
    {
      id: "se1",
      exerciseId: "custom-curl",
      exerciseNameSnapshot: "Zottman Curl",
      exerciseTypeSnapshot: "weighted_reps",
      sets: [{ id: "a", type: "normal", weight: 20, reps: 10, completedAt: "2026-01-01T10:10:00.000Z" }],
    },
  ],
  exerciseIds: ["custom-curl"],
  createdAt: T,
  updatedAt: "2026-01-01T11:00:00.000Z",
};
/** An interrupted workout in progress when the app updated: it must survive the upgrade untouched. */
const ACTIVE: WorkoutSession = {
  ...COMPLETED,
  id: "s2",
  status: "active",
  endedAt: undefined,
  startedAt: "2026-01-02T10:00:00.000Z",
  restTimer: { endsAt: "2026-01-02T10:02:00.000Z", durationSeconds: 90 },
};
const MEASUREMENT: BodyMeasurement = { id: "m1", kind: "bodyweight", value: 80, measuredAt: "2026-01-03T08:00:00.000Z", timeZone: "Europe/Lisbon" };
const SETTINGS = { key: "settings", weightUnit: "lb", barWeightKg: 15 };

const opened: Dexie[] = [];
const uniqueName = () => `test-${crypto.randomUUID()}`;
afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

/** A database as the shipped v2 app left it, closed and ready to be opened by the current code. */
async function writeV2(name: string) {
  const old = new Dexie(name);
  old.version(1).stores(V1_STORES);
  old.version(2).stores(V2_STORES);
  await old.table("exercises").put(EXERCISE);
  await old.table("programs").put(PROGRAM);
  await old.table("routines").bulkPut([IN_PROGRAM, SOLO, DANGLING]);
  await old.table("sessions").bulkPut([COMPLETED, ACTIVE]);
  await old.table("settings").put(SETTINGS);
  await old.table("measurements").put(MEASUREMENT);
  old.close();
}

const openCurrent = (name: string) => {
  const current = new AppDB(name);
  opened.push(current);
  return current;
};

describe("migration v2 → v3 (routine folders)", () => {
  it("opens a v2 database as v3 with every row intact and an empty folders table", async () => {
    const name = uniqueName();
    await writeV2(name);

    const current = openCurrent(name);
    expect(current.verno).toBe(3);
    expect(await current.exercises.toArray()).toEqual([EXERCISE]);
    expect(await current.programs.toArray()).toEqual([PROGRAM]);
    expect(await current.routines.orderBy("id").toArray()).toEqual([DANGLING, IN_PROGRAM, SOLO]);
    expect(await current.sessions.orderBy("startedAt").toArray()).toEqual([COMPLETED, ACTIVE]);
    expect(await current.settings.toArray()).toEqual([SETTINGS]);
    expect(await current.measurements.toArray()).toEqual([MEASUREMENT]);
    expect(await current.folders.count()).toBe(0);
    // v1 and v2 indexes still work.
    expect(await current.sessions.where("[status+startedAt]").between(["active", Dexie.minKey], ["active", Dexie.maxKey]).count()).toBe(1);
    expect((await current.sessions.where("exerciseIds").equals("custom-curl").toArray()).map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect((await listMeasurements({ kind: "bodyweight" }, current)).map((m) => m.id)).toEqual(["m1"]);
    expect((await current.routines.where("folderId").equals("never-created").toArray()).map((r) => r.id)).toEqual(["r-dangling"]);
  });

  it("opens a v1 database straight to v3", async () => {
    const name = uniqueName();
    const old = new Dexie(name);
    old.version(1).stores(V1_STORES);
    await old.table("routines").put(SOLO);
    await old.table("sessions").put(ACTIVE);
    old.close();

    const current = openCurrent(name);
    expect(current.verno).toBe(3);
    expect(await current.routines.toArray()).toEqual([SOLO]);
    expect(await current.sessions.toArray()).toEqual([ACTIVE]);
    expect(await current.measurements.count()).toBe(0);
    expect(await current.folders.count()).toBe(0);
  });

  it("migrated routines list as before: the dangling folderId counts as no folder", async () => {
    const name = uniqueName();
    await writeV2(name);
    const current = openCurrent(name);

    const grouped = await listRoutinesGrouped(current);
    expect(grouped.programs.map((p) => [p.program.id, p.routines.map((r) => r.id)])).toEqual([["p1", ["r-pull"]]]);
    expect(groupByFolder(grouped)).toEqual({ folders: [], unfiled: [SOLO, DANGLING] });
  });

  it("the v3 table and the routine folder/favorite fields work on a migrated database, and export", async () => {
    const name = uniqueName();
    await writeV2(name);
    const current = openCurrent(name);

    const folder = await createFolder("Accessories", current);
    await setRoutineFolder("r-solo", folder.id, current);
    await setRoutineFavorite("r-pull", true, current);
    expect((await current.routines.where("folderId").equals(folder.id).toArray()).map((r) => r.id)).toEqual(["r-solo"]);

    const backup = await buildBackup({}, current);
    expect(backup.data.folders).toEqual([folder]);
    expect(backup.data.routines.find((r) => r.id === "r-pull")?.favorite).toBe(true);
    expect(backup.data.sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(backup.data.measurements).toEqual([MEASUREMENT]);

    // The export restores into a fresh database exactly.
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    const target = openCurrent(uniqueName());
    await restoreBackup(parsed.backup, target);
    const { exportedAt: _a, ...again } = await buildBackup({}, target);
    const { exportedAt: _b, ...original } = backup;
    expect(again).toEqual(original);
  });

  it("deleting a folder on a migrated database keeps its routines (no folder) and their history", async () => {
    const name = uniqueName();
    await writeV2(name);
    const current = openCurrent(name);
    const folder = await createFolder("Temp", current);
    await setRoutineFolder("r-pull", folder.id, current);
    await deleteFolder(folder.id, current);
    const pull = await current.routines.get("r-pull");
    expect(pull).toMatchObject({ id: "r-pull", programId: "p1", programOrder: 0, exercises });
    expect(pull).not.toHaveProperty("folderId");
    expect(await current.sessions.toArray()).toEqual([COMPLETED, ACTIVE]);
  });

  it("reopening an already migrated database changes nothing", async () => {
    const name = uniqueName();
    await writeV2(name);
    const first = new AppDB(name);
    const folder = await createFolder("Strength", first);
    await setRoutineFolder("r-solo", folder.id, first);
    first.close();

    const second = openCurrent(name);
    expect(await second.folders.toArray()).toEqual([folder]);
    expect((await second.routines.get("r-solo"))?.folderId).toBe(folder.id);
    expect(await second.sessions.count()).toBe(2);
  });
});
