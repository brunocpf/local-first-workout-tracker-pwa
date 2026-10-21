import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "#lib/ids";
import {
  scheduleByDay,
  setProgramSchedule,
  todaysRoutines,
  weekdayOf,
} from "#lib/routines/schedule";
import { AppDB } from "#lib/storage/db";
import {
  createProgram,
  deleteRoutine,
  getProgram,
  setRoutineProgram,
} from "#lib/storage/routines";
import type { Program, Routine } from "#lib/types";

const T0 = "2026-01-01T10:00:00.000Z";
const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id,
  name: id,
  exercises: [],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});
const program = (days: { day: string; routineId: string }[]): Program => ({
  id: "p",
  name: "Plan",
  schemaVersion: 1,
  createdAt: T0,
  updatedAt: T0,
  schedule: { type: "weekly", days },
});

describe("weekdayOf", () => {
  it("uses the weekday in the given zone, not UTC", () => {
    // 2026-10-19 is a Monday. 23:30 UTC is already Tuesday in Lisbon-east zones and still Monday in New York.
    const instant = new Date("2026-10-19T23:30:00Z");
    expect(weekdayOf(instant, "UTC")).toBe("monday");
    expect(weekdayOf(instant, "Asia/Tokyo")).toBe("tuesday");
    expect(weekdayOf(instant, "America/New_York")).toBe("monday");
    expect(
      weekdayOf(new Date("2026-10-19T02:00:00Z"), "America/Los_Angeles"),
    ).toBe("sunday");
  });

  it("falls back for an unknown zone and defaults to the device zone", () => {
    expect(weekdayOf(new Date("2026-10-21T12:00:00Z"), "Not/AZone")).toBe(
      "wednesday",
    );
    expect(weekdayOf(new Date("2026-10-21T12:00:00Z"))).toMatch(
      /^(tuesday|wednesday|thursday)$/,
    );
  });
});

describe("todaysRoutines", () => {
  const upper = routine("upper", { name: "Upper A" });
  const lower = routine("lower");
  const p = program([
    { day: "monday", routineId: "upper" },
    { day: "thursday", routineId: "lower" },
    { day: "friday", routineId: "gone" },
  ]);
  const groups = [{ program: p, routines: [upper, lower] }];

  it("returns the routine scheduled for the local weekday", () => {
    const r = todaysRoutines(groups, new Date("2026-10-19T12:00:00Z"), "UTC");
    expect(r.map((x) => [x.routine.name, x.day, x.program.id])).toEqual([
      ["Upper A", "monday", "p"],
    ]);
  });

  it("is empty on rest days, for programs without a schedule and for routines no longer in the program", () => {
    expect(
      todaysRoutines(groups, new Date("2026-10-20T12:00:00Z"), "UTC"),
    ).toEqual([]);
    expect(
      todaysRoutines(groups, new Date("2026-10-23T12:00:00Z"), "UTC"),
    ).toEqual([]);
    expect(
      todaysRoutines(
        [{ program: { ...p, schedule: undefined }, routines: [upper] }],
        new Date("2026-10-19T12:00:00Z"),
        "UTC",
      ),
    ).toEqual([]);
  });

  it("follows the zone: the same instant is a different day elsewhere", () => {
    const instant = new Date("2026-10-18T23:30:00Z"); // Sunday UTC, Monday in Tokyo
    expect(todaysRoutines(groups, instant, "UTC")).toEqual([]);
    expect(todaysRoutines(groups, instant, "Asia/Tokyo")).toHaveLength(1);
  });

  it("returns routines from several programs", () => {
    const other = { ...program([{ day: "monday", routineId: "x" }]), id: "q" };
    const r = todaysRoutines(
      [...groups, { program: other, routines: [routine("x")] }],
      new Date("2026-10-19T12:00:00Z"),
      "UTC",
    );
    expect(r.map((x) => x.routine.id)).toEqual(["upper", "x"]);
  });
});

describe("scheduleByDay", () => {
  it("maps days to routines, keeping the first when an import scheduled a day twice", () => {
    expect(
      scheduleByDay(
        program([
          { day: "monday", routineId: "a" },
          { day: "monday", routineId: "b" },
          { day: "friday", routineId: "c" },
        ]),
      ),
    ).toEqual({
      monday: "a",
      friday: "c",
    });
    expect(scheduleByDay({})).toEqual({});
  });
});

describe("setProgramSchedule", () => {
  let database: AppDB;
  beforeEach(async () => {
    database = new AppDB(`schedule-test-${newId()}`);
    await database.open();
  });
  afterEach(async () => {
    database.close();
    await database.delete();
  });

  async function setup() {
    const p = await createProgram("Plan", database);
    await database.routines.bulkAdd([
      routine("a"),
      routine("b"),
      routine("outside"),
    ]);
    await setRoutineProgram("a", p.id, database);
    await setRoutineProgram("b", p.id, database);
    return p;
  }

  it("stores one routine per day in week order and ignores routines outside the program", async () => {
    const p = await setup();
    const saved = await setProgramSchedule(
      p.id,
      { friday: "b", monday: "a", wednesday: "outside", tuesday: "" },
      database,
    );
    expect(saved.schedule).toEqual({
      type: "weekly",
      days: [
        { day: "monday", routineId: "a" },
        { day: "friday", routineId: "b" },
      ],
    });
    expect((await getProgram(p.id, database))?.schedule).toEqual(
      saved.schedule,
    );
  });

  it("clears the schedule when nothing is assigned", async () => {
    const p = await setup();
    await setProgramSchedule(p.id, { monday: "a" }, database);
    const cleared = await setProgramSchedule(p.id, {}, database);
    expect(cleared.schedule).toBeUndefined();
    expect((await getProgram(p.id, database))?.schedule).toBeUndefined();
  });

  it("keeps the schedule consistent when a scheduled routine is deleted", async () => {
    const p = await setup();
    await setProgramSchedule(p.id, { monday: "a", friday: "b" }, database);
    await deleteRoutine("a", database);
    expect((await getProgram(p.id, database))?.schedule?.days).toEqual([
      { day: "friday", routineId: "b" },
    ]);
  });

  it("rejects an unknown program", async () => {
    await expect(setProgramSchedule("nope", {}, database)).rejects.toThrow(
      /not found/,
    );
  });
});
