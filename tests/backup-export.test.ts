import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  backupFileName,
  buildBackup,
  serializeBackup,
} from "#lib/backup/export";
import { backupV1 } from "#lib/backup/format";
import {
  ensureCatalogSeeded,
  createCustomExercise,
  setArchived,
  setFavorite,
} from "#lib/storage/exercises";
import { AppDB, SETTINGS_KEY } from "#lib/storage/db";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import type { Program, Routine, WorkoutSession } from "#lib/types";

const T = "2026-03-01T10:00:00.000Z";
let n = 0;
let d: AppDB;

const session = (over: Partial<WorkoutSession>): WorkoutSession => ({
  id: "s1",
  name: "Push",
  status: "completed",
  startedAt: T,
  endedAt: "2026-03-01T11:00:00.000Z",
  timeZone: "Europe/Lisbon",
  exercises: [
    {
      id: "se1",
      exerciseId: "bench",
      exerciseNameSnapshot: "Bench",
      exerciseTypeSnapshot: "weighted_reps",
      prescribedSets: [
        { id: "p1", type: "normal", repRange: [5, 8], targetWeight: 80 },
      ],
      sets: [
        {
          id: "a",
          prescribedSetId: "p1",
          type: "normal",
          weight: 80,
          reps: 5,
          completedAt: T,
        },
      ],
    },
  ],
  exerciseIds: ["bench"],
  createdAt: T,
  updatedAt: T,
  ...over,
});

const program: Program = {
  id: "pg1",
  name: "PPL",
  schemaVersion: 1,
  createdAt: T,
  updatedAt: T,
  schedule: { type: "weekly", days: [{ day: "monday", routineId: "r1" }] },
};
const routine: Routine = {
  id: "r1",
  programId: "pg1",
  programOrder: 0,
  name: "Push",
  createdAt: T,
  updatedAt: T,
  exercises: [
    {
      id: "re1",
      exerciseId: "bench",
      restSeconds: 120,
      prescribedSets: [{ id: "p1", type: "normal", repRange: [5, 8] }],
    },
  ],
};

beforeEach(async () => {
  d = new AppDB(`backup-test-${Date.now()}-${n++}`);
  await ensureCatalogSeeded(d);
  await d.programs.add(program);
  await d.routines.add(routine);
  await d.sessions.bulkAdd([
    session({}),
    session({
      id: "s2",
      status: "active",
      endedAt: undefined,
      restTimer: { endsAt: T, durationSeconds: 90 },
    }),
  ]);
  await d.settings.put({
    key: SETTINGS_KEY,
    weightUnit: "lb",
    defaultRestSeconds: 120,
    autoStartRestTimer: false,
    previousValuesMode: "routine",
    weekStartsOn: 0,
    theme: "dark",
  });
});

describe("buildBackup", () => {
  it("validates against backupV1 and contains all user data", async () => {
    const custom = await createCustomExercise(
      { name: "My Lift", exerciseType: "weighted_reps" },
      d,
    );
    const b = await buildBackup({ now: new Date(T) }, d);
    expect(
      backupV1.safeParse(JSON.parse(await serializeBackup(b).text())).success,
    ).toBe(true);
    expect(b.backupVersion).toBe(1);
    expect(b.exportedAt).toBe(T);
    expect(b.data.customExercises.map((e) => e.id)).toEqual([custom.id]);
    expect(b.data.programs).toEqual([program]);
    expect(b.data.routines).toEqual([routine]);
    expect(b.data.sessions.map((s) => [s.id, s.status])).toEqual([
      ["s1", "completed"],
      ["s2", "active"],
    ]);
    expect(b.data.sessions[1].restTimer).toBeDefined();
    expect(b.data.settings).toMatchObject({
      weightUnit: "lb",
      theme: "dark",
      weekStartsOn: 0,
    });
  });

  it("does not export derived data (exerciseIds, settings key, seed rows)", async () => {
    const b = await buildBackup({}, d);
    expect(JSON.stringify(b)).not.toContain("exerciseIds");
    expect(b.data.settings).not.toHaveProperty("key");
    expect(b.data.customExercises).toEqual([]);
    expect(b.data.builtinExerciseState).toEqual([]);
  });

  it("exports only user state of built-in exercises", async () => {
    const [a, c, other] = SEED_EXERCISES;
    await setFavorite(a.id, true, d);
    await setArchived(c.id, true, d);
    const row = (await d.exercises.get(other.id))!;
    await d.exercises.put({ ...row, aliases: [...row.aliases, "my alias"] });
    const b = await buildBackup({}, d);
    const byId = Object.fromEntries(
      b.data.builtinExerciseState.map((s) => [s.id, s]),
    );
    expect(byId[a.id]).toEqual({ id: a.id, favorite: true });
    expect(byId[c.id].archivedAt).toBeTruthy();
    expect(byId[other.id]).toEqual({ id: other.id, aliases: ["my alias"] });
    expect(b.data.builtinExerciseState).toHaveLength(3);
  });

  it("uses default settings when none are stored", async () => {
    await d.settings.clear();
    expect((await buildBackup({}, d)).data.settings.weightUnit).toBe("kg");
  });

  it("works on an empty database", async () => {
    const e = new AppDB(`backup-empty-${Date.now()}-${n++}`);
    const b = await buildBackup({}, e);
    expect(b.data.sessions).toEqual([]);
  });
});

describe("serialize / file name", () => {
  it("produces a JSON blob", async () => {
    const blob = serializeBackup(await buildBackup({}, d));
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text()).backupVersion).toBe(1);
  });

  it("names the file with the local date", () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe(
      "workout-backup-2026-01-05.json",
    );
  });
});

describe("backupV1 schema", () => {
  it("rejects bad input", async () => {
    const good = JSON.parse(JSON.stringify(await buildBackup({}, d)));
    expect(backupV1.safeParse({ ...good, backupVersion: 2 }).success).toBe(
      false,
    );
    expect(
      backupV1.safeParse({
        ...good,
        data: { ...good.data, sessions: [{ id: "x" }] },
      }).success,
    ).toBe(false);
    expect(
      backupV1.safeParse({ ...good, exportedAt: "yesterday" }).success,
    ).toBe(false);
  });
});
