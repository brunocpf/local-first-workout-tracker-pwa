import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBackup } from "#lib/backup/export";
import { AppDB } from "#lib/storage/db";
import { addMeasurement, deleteMeasurement, InvalidMeasurementError, listMeasurements } from "#lib/storage/measurements";
import { MEASUREMENT_KINDS, MEASUREMENT_MAX } from "#lib/types";

let d: AppDB;
beforeEach(() => {
  d = new AppDB(`measurements-${crypto.randomUUID()}`);
});
afterEach(async () => {
  d.close();
  await Dexie.delete(d.name);
});

describe("addMeasurement", () => {
  it("stores a measurement with a fresh id and the given fields", async () => {
    const m = await addMeasurement(
      { kind: "bodyweight", value: 82.35, measuredAt: "2026-03-01T07:00:00.000Z", timeZone: "Europe/Lisbon", notes: "  after waking  " },
      d,
    );
    expect(m).toEqual({
      id: expect.any(String),
      kind: "bodyweight",
      value: 82.35,
      measuredAt: "2026-03-01T07:00:00.000Z",
      timeZone: "Europe/Lisbon",
      notes: "after waking",
    });
    expect(await d.measurements.get(m.id)).toEqual(m);
    const other = await addMeasurement({ kind: "bodyweight", value: 82.35, measuredAt: m.measuredAt }, d);
    expect(other.id).not.toBe(m.id);
  });

  it("defaults the time to now (ISO UTC), the zone to the device's, and omits empty notes", async () => {
    const before = Date.now();
    const m = await addMeasurement({ kind: "waist", value: 84, notes: "   " }, d);
    expect(Date.parse(m.measuredAt)).toBeGreaterThanOrEqual(before);
    expect(new Date(m.measuredAt).toISOString()).toBe(m.measuredAt);
    expect(m.timeZone).toBeTruthy();
    expect("notes" in m).toBe(false);
  });

  it("accepts every kind at its maximum", async () => {
    for (const kind of MEASUREMENT_KINDS) await addMeasurement({ kind, value: MEASUREMENT_MAX[kind] }, d);
    expect(await d.measurements.count()).toBe(MEASUREMENT_KINDS.length);
  });

  it("rejects bad input and writes nothing", async () => {
    const bad = [
      { kind: "elbow" as never, value: 30 },
      { kind: "bodyweight" as const, value: 0 },
      { kind: "bodyweight" as const, value: -5 },
      { kind: "bodyweight" as const, value: NaN },
      { kind: "bodyweight" as const, value: Infinity },
      { kind: "body_fat" as const, value: 101 },
      { kind: "bodyweight" as const, value: 80, measuredAt: "yesterday" },
      { kind: "bodyweight" as const, value: 80, measuredAt: "2026-03-01T07:00:00+01:00" },
      { kind: "bodyweight" as const, value: 80, measuredAt: "2026-03-01" },
      { kind: "bodyweight" as const, value: 80, measuredAt: "2026-03-01T07:00:00Z" },
      { kind: "bodyweight" as const, value: 80, timeZone: "Mars/Base" },
      { kind: "bodyweight" as const, value: 80, notes: "x".repeat(1001) },
      { kind: "bodyweight" as const, value: 80, timeZone: "x".repeat(101) },
    ];
    for (const input of bad) await expect(addMeasurement(input, d)).rejects.toBeInstanceOf(InvalidMeasurementError);
    expect(await d.measurements.count()).toBe(0);
  });
});

describe("export compatibility", () => {
  it("every measurement addMeasurement accepts can be exported", async () => {
    await addMeasurement({ kind: "bodyweight", value: 80, notes: "x".repeat(1000), timeZone: "America/Sao_Paulo" }, d);
    await addMeasurement({ kind: "body_fat", value: 100, measuredAt: "2026-03-01T07:00:00.500Z" }, d);
    const backup = await buildBackup({}, d);
    expect(backup.data.measurements).toHaveLength(2);
  });
});

describe("listMeasurements", () => {
  beforeEach(async () => {
    await addMeasurement({ kind: "bodyweight", value: 80, measuredAt: "2026-03-01T07:00:00.000Z" }, d);
    await addMeasurement({ kind: "waist", value: 85, measuredAt: "2026-03-02T07:00:00.000Z" }, d);
    await addMeasurement({ kind: "bodyweight", value: 79, measuredAt: "2026-03-03T07:00:00.000Z" }, d);
    await addMeasurement({ kind: "bodyweight", value: 81, measuredAt: "2026-02-20T07:00:00.000Z" }, d);
  });

  it("lists everything newest first", async () => {
    expect((await listMeasurements({}, d)).map((m) => m.measuredAt)).toEqual([
      "2026-03-03T07:00:00.000Z",
      "2026-03-02T07:00:00.000Z",
      "2026-03-01T07:00:00.000Z",
      "2026-02-20T07:00:00.000Z",
    ]);
  });

  it("filters by kind and applies a limit", async () => {
    expect((await listMeasurements({ kind: "bodyweight" }, d)).map((m) => m.value)).toEqual([79, 80, 81]);
    expect((await listMeasurements({ kind: "bodyweight", limit: 1 }, d)).map((m) => m.value)).toEqual([79]);
    expect((await listMeasurements({ limit: 2 }, d)).map((m) => m.kind)).toEqual(["bodyweight", "waist"]);
    expect(await listMeasurements({ kind: "thigh" }, d)).toEqual([]);
  });
});

describe("deleteMeasurement", () => {
  it("deletes one measurement and ignores a missing id", async () => {
    const a = await addMeasurement({ kind: "arm", value: 38 }, d);
    const b = await addMeasurement({ kind: "arm", value: 38.5 }, d);
    await deleteMeasurement(a.id, d);
    await deleteMeasurement("nope", d);
    expect((await listMeasurements({}, d)).map((m) => m.id)).toEqual([b.id]);
  });
});
