import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { buildBackup } from "#lib/backup/export";
import { AppDB } from "#lib/storage/db";
import { addMeasurement, listMeasurements } from "#lib/storage/measurements";
import type { Exercise, Program, Routine, WorkoutSession } from "#lib/types";

/**
 * v1 → v2 (body measurements). The frozen v1 schema is copied here, never imported from db.ts, so editing
 * `version(1)` in place would fail this test. See docs/data-model.md "Migrations".
 */
const V1_STORES = {
  exercises: "id, name, *aliases, isCustom, archivedAt",
  programs: "id, name",
  routines: "id, programId, folderId",
  sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds",
  settings: "key",
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
  favorite: true,
  createdAt: T,
  updatedAt: T,
};
const ROUTINE: Routine = {
  id: "r1",
  programId: "p1",
  programOrder: 0,
  name: "Pull",
  exercises: [{ id: "re1", exerciseId: "custom-curl", prescribedSets: [{ id: "ps1", type: "normal", repRange: [8, 12] }] }],
  createdAt: T,
  updatedAt: T,
};
const PROGRAM: Program = { id: "p1", name: "PPL", schemaVersion: 1, createdAt: T, updatedAt: T };
const COMPLETED: WorkoutSession = {
  id: "s1",
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
const ACTIVE: WorkoutSession = {
  ...COMPLETED,
  id: "s2",
  status: "active",
  endedAt: undefined,
  startedAt: "2026-01-02T10:00:00.000Z",
  restTimer: { endsAt: "2026-01-02T10:02:00.000Z", durationSeconds: 90 },
};
const SETTINGS = { key: "settings", weightUnit: "lb", barWeightKg: 15 };

const opened: Dexie[] = [];
const uniqueName = () => `test-${crypto.randomUUID()}`;
afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

/** A database as the shipped v1 app left it, closed and ready to be opened by the current code. */
async function writeV1(name: string) {
  const old = new Dexie(name);
  old.version(1).stores(V1_STORES);
  await old.table("exercises").put({ ...EXERCISE });
  await old.table("programs").put(PROGRAM);
  await old.table("routines").put(ROUTINE);
  await old.table("sessions").bulkPut([COMPLETED, ACTIVE]);
  await old.table("settings").put(SETTINGS);
  old.close();
}

describe("migration v1 → v2 (measurements)", () => {
  it("opens a v1 database as v2 with every row intact and an empty measurements table", async () => {
    const name = uniqueName();
    await writeV1(name);

    const current = new AppDB(name);
    opened.push(current);
    expect(current.verno).toBe(2);
    expect(await current.exercises.toArray()).toEqual([EXERCISE]);
    expect(await current.programs.toArray()).toEqual([PROGRAM]);
    expect(await current.routines.toArray()).toEqual([ROUTINE]);
    expect(await current.sessions.orderBy("startedAt").toArray()).toEqual([COMPLETED, ACTIVE]);
    expect(await current.settings.toArray()).toEqual([SETTINGS]);
    expect(await current.measurements.count()).toBe(0);
    // v1 indexes still work.
    expect(await current.sessions.where("[status+startedAt]").between(["active", Dexie.minKey], ["active", Dexie.maxKey]).count()).toBe(1);
    expect((await current.sessions.where("exerciseIds").equals("custom-curl").toArray()).map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("the v2 table and its indexes work on a migrated database", async () => {
    const name = uniqueName();
    await writeV1(name);
    const current = new AppDB(name);
    opened.push(current);

    await addMeasurement({ kind: "bodyweight", value: 80, measuredAt: "2026-02-01T08:00:00.000Z" }, current);
    await addMeasurement({ kind: "waist", value: 85, measuredAt: "2026-02-02T08:00:00.000Z" }, current);
    await addMeasurement({ kind: "bodyweight", value: 79.5, measuredAt: "2026-02-03T08:00:00.000Z" }, current);
    expect((await listMeasurements({ kind: "bodyweight" }, current)).map((m) => m.value)).toEqual([79.5, 80]);
    expect(await current.measurements.where("kind").equals("waist").count()).toBe(1);
    expect(await current.measurements.where("measuredAt").above("2026-02-01T12:00:00.000Z").count()).toBe(2);
    // The migrated data is still exportable, now with measurements.
    const backup = await buildBackup({}, current);
    expect(backup.data.measurements).toHaveLength(3);
    expect(backup.data.sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("reopening an already migrated database changes nothing", async () => {
    const name = uniqueName();
    await writeV1(name);
    const first = new AppDB(name);
    const m = await addMeasurement({ kind: "chest", value: 100 }, first);
    first.close();

    const second = new AppDB(name);
    opened.push(second);
    expect(await second.measurements.toArray()).toEqual([m]);
    expect(await second.sessions.count()).toBe(2);
  });
});
