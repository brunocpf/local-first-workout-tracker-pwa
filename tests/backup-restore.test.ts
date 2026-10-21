import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBackup, serializeBackup } from "#lib/backup/export";
import type { BackupV2 } from "#lib/backup/format";
import {
  InvalidBackupError,
  MAX_BACKUP_BYTES,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  summarizeCurrentData,
} from "#lib/backup/restore";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { AppDB, SETTINGS_KEY } from "#lib/storage/db";
import { createCustomExercise, ensureCatalogSeeded, isExerciseReferenced, setArchived, setFavorite } from "#lib/storage/exercises";
import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";
import type { WorkoutSession } from "#lib/types";

const FIXTURE_TEXT = readFileSync("tests/fixtures/backup-v1.json", "utf8");
const FIXTURE_V2_TEXT = readFileSync("tests/fixtures/backup-v2.json", "utf8");
const T = "2026-04-01T10:00:00.000Z";
let n = 0;
let d: AppDB;

const freshDb = () => new AppDB(`restore-test-${Date.now()}-${n++}`);

const parseV2 = (): BackupV2 => {
  const r = parseBackup(FIXTURE_V2_TEXT);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.backup;
};

const fixture = (): BackupV2 => {
  const r = parseBackup(FIXTURE_TEXT);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.backup;
};

/** Every table, for before/after comparisons. */
const snapshot = async (database: AppDB) => ({
  exercises: await database.exercises.toArray(),
  programs: await database.programs.toArray(),
  routines: await database.routines.toArray(),
  sessions: await database.sessions.toArray(),
  settings: await database.settings.toArray(),
  measurements: await database.measurements.toArray(),
});

/** Export without the fields a restore legitimately changes. */
const exported = async (database: AppDB) => {
  const { exportedAt: _e, ...rest } = await buildBackup({}, database);
  return rest;
};

const session = (id: string, startedAt: string): WorkoutSession => ({
  id,
  name: "Legs",
  status: "completed",
  startedAt,
  endedAt: startedAt,
  timeZone: "UTC",
  exercises: [
    {
      id: `${id}-e1`,
      exerciseId: "leg_press",
      exerciseNameSnapshot: "Leg Press",
      exerciseTypeSnapshot: "weighted_reps",
      sets: [{ id: `${id}-s1`, type: "normal", weight: 100, reps: 10, completedAt: startedAt }],
    },
  ],
  exerciseIds: ["leg_press"],
  createdAt: startedAt,
  updatedAt: startedAt,
});

/** Existing data that a restore must replace (or, on failure, leave untouched). */
async function seedExistingData(database: AppDB) {
  await ensureCatalogSeeded(database);
  await createCustomExercise({ name: "Old Custom", exerciseType: "weighted_reps" }, database);
  await setFavorite("leg_press", true, database);
  await setArchived("barbell_bench_press", true, database);
  await database.routines.add({ id: "old-routine", name: "Old", exercises: [], createdAt: T, updatedAt: T });
  await database.sessions.bulkAdd([session("old-1", T), session("old-2", "2026-04-05T10:00:00.000Z")]);
  await database.measurements.add({ id: "old-m", kind: "bodyweight", value: 90, measuredAt: T, timeZone: "UTC" });
  await database.settings.put({
    key: SETTINGS_KEY,
    weightUnit: "kg",
    defaultRestSeconds: 60,
    autoStartRestTimer: true,
    previousValuesMode: "exercise",
    weekStartsOn: 1,
    theme: "light",
  });
}

beforeEach(() => {
  d = freshDb();
});

describe("parseBackup", () => {
  it("migrates a v1 file forward to v2 with no measurements", () => {
    const r = parseBackup(FIXTURE_TEXT);
    expect(r.ok && [r.backup.backupVersion, r.backup.data.measurements]).toEqual([2, []]);
  });

  it("accepts the frozen v2 fixture and keeps its measurements", () => {
    const r = parseBackup(FIXTURE_V2_TEXT);
    expect(r.ok && r.backup.data.measurements).toHaveLength(3);
  });

  it("requires measurements in a v2 file and rejects invalid ones with their path", () => {
    const raw = JSON.parse(FIXTURE_V2_TEXT);
    const missing = { ...raw, data: { ...raw.data, measurements: undefined } };
    expect(parseBackup(JSON.stringify(missing)).ok).toBe(false);

    raw.data.measurements[0].kind = "elbow";
    raw.data.measurements[1].value = 140; // body fat above 100 %
    raw.data.measurements[2].value = -1;
    raw.data.measurements.push({ ...raw.data.measurements[2], value: 80 }); // duplicate id
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^data\.measurements\[0\]\.kind: /),
          expect.stringMatching(/^data\.measurements\[1\]\.value: /),
          expect.stringMatching(/^data\.measurements\[2\]\.value: /),
        ]),
      );
    // The duplicate id is reported once the rest of the file is otherwise valid.
    const dup = JSON.parse(FIXTURE_V2_TEXT);
    dup.data.measurements.push({ ...dup.data.measurements[0] });
    const d2 = parseBackup(JSON.stringify(dup));
    expect(!d2.ok && d2.errors).toEqual(["data.measurements[3].id: duplicate id meas-bw-1"]);
  });

  it("reports a missing data object, not the format version, for a malformed v1 file", () => {
    for (const raw of [{ backupVersion: 1 }, { backupVersion: 1, data: [] }, { backupVersion: 1, data: null }]) {
      const r = parseBackup(JSON.stringify(raw));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join("\n")).not.toMatch(/backupVersion/);
    }
  });

  it("rejects measurements the repository would never store: bad zone, non-canonical timestamp, long notes", () => {
    const raw = JSON.parse(FIXTURE_V2_TEXT);
    raw.data.measurements[0].timeZone = "Mars/Base";
    raw.data.measurements[1].measuredAt = "2026-02-27T07:45:00Z"; // valid ISO, but sorts wrongly against ".500Z"
    raw.data.measurements[2].notes = "x".repeat(1001);
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual([
        expect.stringMatching(/^data\.measurements\[0\]\.timeZone: /),
        expect.stringMatching(/^data\.measurements\[1\]\.measuredAt: /),
        expect.stringMatching(/^data\.measurements\[2\]\.notes: /),
      ]);
    raw.data.measurements[0].timeZone = "";
    const empty = parseBackup(JSON.stringify(raw));
    expect(!empty.ok && empty.errors[0]).toMatch(/^data\.measurements\[0\]\.timeZone: /);
  });
  it("accepts the frozen v1 fixture", () => {
    expect(parseBackup(FIXTURE_TEXT).ok).toBe(true);
  });

  it("rejects malformed and truncated JSON", () => {
    for (const text of ["", "not json", FIXTURE_TEXT.slice(0, FIXTURE_TEXT.length / 2)]) {
      const r = parseBackup(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/JSON/);
    }
  });

  it("rejects oversized input before parsing", () => {
    const r = parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1));
    expect(r).toEqual({ ok: false, errors: [expect.stringMatching(/too large/)] });
  });

  it("asks to update the app for a newer format version", () => {
    const r = parseBackup(JSON.stringify({ ...JSON.parse(FIXTURE_TEXT), backupVersion: 3 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer version.*Update the app/);
  });

  it("rejects non-backups and unknown versions", () => {
    for (const raw of [null, [], {}, { backupVersion: 0 }, { backupVersion: "1" }, { schemaVersion: 1 }]) {
      const r = parseBackup(JSON.stringify(raw));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/unsupported format version/);
    }
  });

  it("reports schema errors with their path", () => {
    const raw = JSON.parse(FIXTURE_TEXT);
    raw.data.sessions[1].startedAt = "yesterday";
    raw.data.programs[0].source.url = "javascript:alert(1)";
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(expect.stringMatching(/^data\.sessions\[1\]\.startedAt: /));
      expect(r.errors).toContainEqual(expect.stringMatching(/^data\.programs\[0\]\.source\.url: /));
    }
  });

  it("rejects duplicate ids, fake custom exercises and multiple active sessions", () => {
    const raw = JSON.parse(FIXTURE_TEXT);
    raw.data.sessions.push({ ...raw.data.sessions[1] });
    raw.data.customExercises.push({ ...raw.data.customExercises[0], id: "back_squat" });
    raw.data.customExercises.push({ ...raw.data.customExercises[0], id: "x", isCustom: false });
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual(
        expect.arrayContaining([
          "data.sessions[2].id: duplicate id sess-2026-03-02",
          "data.customExercises[1].id: back_squat is a built-in exercise id",
          "data.customExercises[2].isCustom: must be true",
          "data.sessions: more than one active session",
        ]),
      );
  });

  it("rejects routine and schedule references that don't resolve", () => {
    const raw = JSON.parse(FIXTURE_TEXT);
    raw.data.routines[0].exercises[0].exerciseId = "does_not_exist";
    raw.data.programs[0].schedule.days[1].routineId = "rt-gone";
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual([
        "data.routines[0].exercises[0].exerciseId: unknown exercise does_not_exist",
        "data.programs[0].schedule.days[1].routineId: unknown routine rt-gone",
      ]);
  });

  it("accepts sessions that reference exercises not in the backup (history is self-describing)", () => {
    const raw = JSON.parse(FIXTURE_TEXT);
    raw.data.sessions[0].exercises[0].exerciseId = "deleted_custom";
    raw.data.routines[0].programId = "deleted_program";
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(true);
  });

  it("strips unknown keys and never keeps derived exerciseIds from the file", () => {
    const raw = JSON.parse(FIXTURE_TEXT);
    raw.data.sessions[0].exerciseIds = ["bogus"];
    raw.data.sessions[0].evil = "x";
    const r = parseBackup(JSON.stringify(raw).replace('"data":{', '"data":{"__proto__":{"polluted":true},'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.data.sessions[0]).not.toHaveProperty("exerciseIds");
      expect(r.backup.data.sessions[0]).not.toHaveProperty("evil");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });
});

describe("summaries", () => {
  it("summarizes a backup", () => {
    expect(summarizeBackup(fixture())).toEqual({
      sessions: 2,
      routines: 2,
      programs: 1,
      customExercises: 1,
      measurements: 0,
      latestSessionAt: "2026-03-02T08:30:00.000Z",
    });
  });

  it("summarizes current data, including an empty database", async () => {
    expect(await summarizeCurrentData(d)).toEqual({ sessions: 0, routines: 0, programs: 0, customExercises: 0, measurements: 0 });
    await seedExistingData(d);
    expect(await summarizeCurrentData(d)).toEqual({
      sessions: 2,
      routines: 1,
      programs: 0,
      customExercises: 1,
      measurements: 1,
      latestSessionAt: "2026-04-05T10:00:00.000Z",
    });
  });
});

describe("restoreBackup", () => {
  it("restores the frozen v1 fixture exactly", async () => {
    await restoreBackup(fixture(), d);
    const out = await buildBackup({ now: new Date("2026-03-02T09:00:00.000Z") }, d);
    // The fixture predates `timerSound`: an old backup restores, and export fills in the default.
    const expected = JSON.parse(FIXTURE_TEXT);
    // A v1 file is migrated forward: new format version, no measurements.
    expected.backupVersion = 2;
    expected.data.measurements = [];
    expected.data.settings.timerSound = true;
    // Settings added after the fixture was frozen come back as defaults.
    expected.data.settings.backupReminderDays = 14;
    expected.data.settings.backupReminderSessions = 10;
    expected.data.settings.effortInput = "off";
    expected.data.settings.lengthUnit = "cm";
    expected.data.settings.barWeightKg = DEFAULT_BAR_KG;
    expected.data.settings.plateInventory = DEFAULT_PLATE_INVENTORY;
    expect(out).toEqual(expected);
  });

  it("restores the frozen v2 fixture exactly, measurements included", async () => {
    await restoreBackup(parseV2(), d);
    expect((await d.measurements.orderBy("measuredAt").toArray()).map((m) => m.id)).toEqual(["meas-bw-1", "meas-bf-1", "meas-waist-1"]);
    expect((await d.measurements.get("meas-bf-1"))?.notes).toBe("Calipers, morning");
    const out = await buildBackup({ now: new Date("2026-03-03T09:00:00.000Z") }, d);
    const expected = JSON.parse(FIXTURE_V2_TEXT);
    expected.data.settings.timerSound = true;
    expected.data.settings.backupReminderDays = 14;
    expected.data.settings.backupReminderSessions = 10;
    expected.data.settings.effortInput = "off";
    expected.data.settings.lengthUnit = "cm";
    expected.data.settings.barWeightKg = DEFAULT_BAR_KG;
    expected.data.settings.plateInventory = DEFAULT_PLATE_INVENTORY;
    expect(out).toEqual(expected);
  });

  it("restoring a v1 backup replaces existing measurements with none", async () => {
    await seedExistingData(d);
    expect(await d.measurements.count()).toBe(1);
    await restoreBackup(fixture(), d);
    expect(await d.measurements.count()).toBe(0);
  });

  it("recomputes the exerciseIds index", async () => {
    await restoreBackup(fixture(), d);
    expect((await d.sessions.get("sess-2026-02-26"))?.exerciseIds).toEqual([
      "barbell_bench_press",
      "custom-cable-y-raise",
      "plank",
    ]);
    expect(await isExerciseReferenced("plank", d)).toBe(true);
  });

  it("rebuilds the full catalog and applies built-in user state", async () => {
    await restoreBackup(fixture(), d);
    const builtins = await d.exercises.filter((e) => !e.isCustom).toArray();
    expect(builtins.map((e) => e.id).sort()).toEqual(SEED_EXERCISES.map((s) => s.id).sort());
    const bench = (await d.exercises.get("barbell_bench_press"))!;
    expect(bench.favorite).toBe(true);
    expect(bench.archivedAt).toBeUndefined();
    expect(bench.aliases).toEqual([...SEED_EXERCISES.find((s) => s.id === bench.id)!.aliases, "Flat BB"]);
    expect((await d.exercises.get("back_squat"))?.archivedAt).toBe("2026-02-01T12:00:00.000Z");
    // Catalog seeding after a restore keeps the restored state.
    await ensureCatalogSeeded(d);
    expect((await d.exercises.get("barbell_bench_press"))?.favorite).toBe(true);
  });

  it("keeps stored built-ins the current catalog no longer ships, with the backup's state", async () => {
    await ensureCatalogSeeded(d);
    const retired = {
      ...(await d.exercises.get("plank"))!,
      id: "retired_lift",
      name: "Retired Lift",
      aliases: ["Old Name"],
      favorite: true,
    };
    await d.exercises.add(retired);
    await d.exercises.add({ ...retired, id: "retired_other", favorite: true });
    const b = fixture();
    b.data.builtinExerciseState.push({ id: "retired_other", archivedAt: T, aliases: ["Mine"] });
    await restoreBackup(b, d);
    const kept = (await d.exercises.get("retired_lift"))!;
    expect(kept).toMatchObject({ name: "Retired Lift", isCustom: false, aliases: ["Old Name"] });
    expect(kept.favorite).toBeUndefined();
    const other = (await d.exercises.get("retired_other"))!;
    expect(other).toMatchObject({ archivedAt: T, aliases: ["Old Name", "Mine"] });
    expect(other.favorite).toBeUndefined();
  });

  it("ignores state for built-in ids this app does not know", async () => {
    const b = fixture();
    b.data.builtinExerciseState.push({ id: "exercise_from_the_future", favorite: true });
    await restoreBackup(b, d);
    expect(await d.exercises.get("exercise_from_the_future")).toBeUndefined();
  });

  it("round trip: export → wipe → restore → export yields identical data", async () => {
    await seedExistingData(d);
    await setFavorite("back_squat", false, d);
    const row = (await d.exercises.get("plank"))!;
    await d.exercises.put({ ...row, aliases: [...row.aliases, "Hold"] });
    await d.sessions.add({ ...session("active-1", "2026-04-06T10:00:00.000Z"), status: "active", endedAt: undefined });
    const before = await exported(d);
    const text = await serializeBackup(await buildBackup({}, d)).text();

    const target = freshDb();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    await restoreBackup(parsed.backup, target);
    expect(await exported(target)).toEqual(before);

    // Restoring into the same (wiped) database works too.
    await Promise.all([d.exercises, d.programs, d.routines, d.sessions, d.settings].map((t) => t.clear()));
    await restoreBackup(parsed.backup, d);
    expect(await exported(d)).toEqual(before);
  });

  it("replaces existing data instead of merging", async () => {
    await seedExistingData(d);
    await restoreBackup(fixture(), d);
    expect((await d.sessions.toArray()).map((s) => s.id)).toEqual(["sess-2026-02-26", "sess-2026-03-02"]);
    expect((await d.routines.toArray()).map((r) => r.id)).toEqual(["rt-pull", "rt-push"]);
    expect((await d.exercises.filter((e) => e.isCustom).toArray()).map((e) => e.name)).toEqual(["Cable Y Raise"]);
    // User state on built-ins that the backup doesn't have is gone too.
    expect((await d.exercises.get("leg_press"))?.favorite).toBeUndefined();
    expect((await d.exercises.get("barbell_bench_press"))?.archivedAt).toBeUndefined();
    expect((await d.settings.get(SETTINGS_KEY))?.theme).toBe("dark");
    expect(await summarizeCurrentData(d)).toEqual(summarizeBackup(fixture()));
  });

  it("an invalid backup changes nothing", async () => {
    await seedExistingData(d);
    const before = await snapshot(d);
    const bad = fixture();
    (bad.data.sessions[0] as { startedAt: string }).startedAt = "not a date";
    await expect(restoreBackup(bad, d)).rejects.toBeInstanceOf(InvalidBackupError);
    const dup = fixture();
    dup.data.routines.push(dup.data.routines[0]);
    await expect(restoreBackup(dup, d)).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(restoreBackup({} as BackupV2, d)).rejects.toBeInstanceOf(InvalidBackupError);
    expect(await snapshot(d)).toEqual(before);
  });

  it("a failure in the middle of the transaction leaves existing data untouched", async () => {
    await seedExistingData(d);
    const before = await snapshot(d);
    // The last write fails after every table was cleared and refilled.
    const spy = vi.spyOn(d.settings, "put").mockRejectedValueOnce(new Error("QuotaExceededError"));
    await expect(restoreBackup(fixture(), d)).rejects.toThrow("QuotaExceededError");
    spy.mockRestore();
    expect(await snapshot(d)).toEqual(before);
    // And a later restore still succeeds.
    await restoreBackup(fixture(), d);
    expect(await d.sessions.count()).toBe(2);
  });

  it("accepts proxied input (e.g. Svelte $state) by copying it first", async () => {
    const proxied = new Proxy(fixture(), {});
    await restoreBackup(proxied, d);
    expect(await d.sessions.count()).toBe(2);
  });
});
