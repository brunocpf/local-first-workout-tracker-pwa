import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeHevyRows } from "#lib/imports/hevy/normalize";
import { parseHevyCsv, type HevyRow } from "#lib/imports/hevy/parse";
import { localDate } from "#lib/time";

const sample = readFileSync("tests/fixtures/hevy/sample.csv", "utf8");
const parsed = parseHevyCsv(sample);
if (!parsed.ok) throw new Error("fixture must parse");
const sampleRows = parsed.rows;

let n = 0;
const row = (o: Partial<HevyRow> = {}): HevyRow => ({
  row: ++n + 1,
  title: "Push",
  startTime: "Oct 13, 2026, 9:50 PM",
  endTime: "Oct 13, 2026, 11:00 PM",
  description: "",
  exerciseTitle: "Bench Press (Barbell)",
  supersetId: "",
  exerciseNotes: "",
  setType: "normal",
  weightKg: 80,
  reps: 5,
  ...o,
});
const UTC = { timeZone: "UTC", importedAt: new Date("2026-10-20T10:00:00Z") };

describe("normalizeHevyRows: sample", () => {
  const r = normalizeHevyRows(sampleRows, UTC);

  it("keeps workout, set and volume totals equal to a direct sum over the CSV", () => {
    expect(r.totals.workouts).toBe(29);
    const withData = sampleRows.filter(
      (x) => x.weightKg !== undefined || x.reps !== undefined || x.durationSeconds !== undefined,
    );
    expect(r.totals.sets).toBe(withData.length);
    expect(r.unsupported.emptySetsSkipped).toBe(sampleRows.length - withData.length);
    const volume = sampleRows
      .filter((x) => x.setType !== "warmup")
      .reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
    expect(r.totals.volumeKg).toBeCloseTo(volume, 6);
    expect(r.totals.volumeKg).toBeGreaterThan(0);
    console.info(
      `[T5.03 sample] workouts=${r.totals.workouts} sets=${r.totals.sets} volumeKg=${r.totals.volumeKg}`,
    );
  });

  it("produces completed drafts that follow the invariants", () => {
    expect(r.drafts).toHaveLength(29);
    const starts = r.drafts.map((d) => d.startedAt);
    expect(starts).toEqual([...starts].sort());
    for (const d of r.drafts) {
      expect(d.status).toBe("completed");
      expect(d.timeZone).toBe("UTC");
      expect(d.startedAt).toMatch(/Z$/);
      expect(d.endedAt! >= d.startedAt).toBe(true);
      expect(d.routineId).toBeUndefined();
      expect(d.createdAt).toBe("2026-10-20T10:00:00.000Z");
      for (const e of d.exercises) {
        expect(e.exerciseNameSnapshot).not.toBe("");
        for (const s of e.sets) expect(s.completedAt).toBe(d.endedAt);
      }
    }
    expect(r.drafts.at(-1)!.startedAt).toBe("2026-10-13T21:50:00.000Z");
  });

  it("lists the 33 distinct exercise names with counts and inferred types", () => {
    expect(r.exercises).toHaveLength(33);
    expect(r.exercises.reduce((a, e) => a + e.sets, 0)).toBe(r.totals.sets);
    const tm = r.exercises.find((e) => e.title === "Treadmill")!;
    expect(tm.inferredType).toBe("duration");
    expect(tm.sets).toBe(14);
    expect(r.exercises[0].sets).toBeGreaterThanOrEqual(r.exercises[1].sets);
  });

  it("stores treadmill sets as duration only and keeps fractional kg exactly", () => {
    const set = r.drafts.flatMap((d) => d.exercises).find((e) => e.exerciseNameSnapshot === "Treadmill")!.sets[0];
    expect(set.durationSeconds).toBeGreaterThan(0);
    expect(set.weight).toBeUndefined();
    expect(set.reps).toBeUndefined();
    expect("weight" in set).toBe(false);
    const weights = new Set(sampleRows.map((x) => x.weightKg));
    expect(r.drafts.flatMap((d) => d.exercises.flatMap((e) => e.sets)).every((s) => s.weight === undefined || weights.has(s.weight))).toBe(true);
  });

  it("keeps the exercise note once per block", () => {
    const notes = r.drafts.flatMap((d) => d.exercises).filter((e) => e.notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].sets).toHaveLength(3);
  });
});

describe("normalizeHevyRows: time", () => {
  it("converts wall time in the chosen zone to UTC and keeps the local day", () => {
    const { drafts } = normalizeHevyRows([row()], { timeZone: "America/Los_Angeles" });
    expect(drafts[0].startedAt).toBe("2026-10-14T04:50:00.000Z");
    expect(drafts[0].endedAt).toBe("2026-10-14T06:00:00.000Z");
    expect(drafts[0].timeZone).toBe("America/Los_Angeles");
    expect(localDate(drafts[0])).toBe("2026-10-13");
  });
  it("handles 12 AM / 12 PM and midnight crossing", () => {
    const r = normalizeHevyRows(
      [row({ startTime: "Oct 13, 2026, 12:10 AM", endTime: "Oct 13, 2026, 12:05 PM" }), row({ title: "N", startTime: "Oct 14, 2026, 11:30 PM", endTime: "Oct 15, 2026, 12:15 AM" })],
      UTC,
    );
    expect(r.drafts[0].startedAt).toBe("2026-10-13T00:10:00.000Z");
    expect(r.drafts[0].endedAt).toBe("2026-10-13T12:05:00.000Z");
    expect(r.drafts[1].endedAt).toBe("2026-10-15T00:15:00.000Z");
  });
  it("warns on a DST gap (moved forward) and fold (earlier occurrence)", () => {
    const gap = normalizeHevyRows([row({ startTime: "Mar 8, 2026, 2:30 AM", endTime: "Mar 8, 2026, 4:00 AM" })], { timeZone: "America/New_York" });
    expect(gap.drafts[0].startedAt).toBe("2026-03-08T07:30:00.000Z");
    expect(gap.unsupported.warnings.some((w) => /gap/.test(w.message))).toBe(true);
    const fold = normalizeHevyRows([row({ startTime: "Nov 1, 2026, 1:30 AM", endTime: "Nov 1, 2026, 3:00 AM" })], { timeZone: "America/New_York" });
    expect(fold.drafts[0].startedAt).toBe("2026-11-01T05:30:00.000Z");
    expect(fold.unsupported.warnings.some((w) => /fold/.test(w.message))).toBe(true);
  });
  it("omits an end before the start or missing, and uses the start for completedAt", () => {
    for (const endTime of ["Oct 13, 2026, 8:00 PM", "", "garbage"]) {
      const r = normalizeHevyRows([row({ endTime })], UTC);
      expect(r.drafts[0].endedAt).toBeUndefined();
      expect("endedAt" in r.drafts[0]).toBe(false);
      expect(r.drafts[0].exercises[0].sets[0].completedAt).toBe(r.drafts[0].startedAt);
      expect(r.unsupported.warnings).toHaveLength(1);
    }
  });
  it("rejects a workout with an unrecognized start but keeps the others", () => {
    const r = normalizeHevyRows([row({ startTime: "13 Okt 2026 21:50" }), row({ title: "Ok" })], UTC);
    expect(r.drafts.map((d) => d.name)).toEqual(["Ok"]);
    expect(r.unsupported.workoutsRejected).toHaveLength(1);
    expect(r.unsupported.workoutsRejected[0].message).toContain("13 Okt 2026 21:50");
  });
  it("rejects an impossible date and accepts ISO with offset (offset wins over the zone)", () => {
    expect(normalizeHevyRows([row({ startTime: "Feb 30, 2026, 9:00 AM" })], UTC).drafts).toHaveLength(0);
    const r = normalizeHevyRows([row({ startTime: "2026-10-13T21:50:00+02:00", endTime: "2026-10-13T23:00:00Z" })], { timeZone: "Asia/Tokyo" });
    expect(r.drafts[0].startedAt).toBe("2026-10-13T19:50:00.000Z");
    expect(r.drafts[0].endedAt).toBe("2026-10-13T23:00:00.000Z");
  });
  it("throws for an unknown zone", () => {
    expect(() => normalizeHevyRows([row()], { timeZone: "Mars/Base" })).toThrow(RangeError);
  });
});

describe("normalizeHevyRows: structure", () => {
  it("groups non-adjacent rows of a workout and orders workouts by start", () => {
    const r = normalizeHevyRows(
      [
        row({ title: "B", startTime: "Oct 14, 2026, 9:00 AM", endTime: "Oct 14, 2026, 10:00 AM" }),
        row({ title: "A" }),
        row({ title: "B", startTime: "Oct 14, 2026, 9:00 AM", endTime: "Oct 14, 2026, 10:00 AM", setIndex: 1 }),
      ],
      UTC,
    );
    expect(r.drafts.map((d) => d.name)).toEqual(["A", "B"]);
    expect(r.drafts[1].exercises).toHaveLength(1);
    expect(r.drafts[1].exercises[0].sets).toHaveLength(2);
  });
  it("splits a repeated non-contiguous exercise and a set_index restart into separate blocks", () => {
    const r = normalizeHevyRows(
      [
        row({ setIndex: 0 }),
        row({ setIndex: 1 }),
        row({ exerciseTitle: "Squat", setIndex: 0 }),
        row({ setIndex: 0 }),
        row({ setIndex: 0 }),
      ],
      UTC,
    );
    expect(r.drafts[0].exercises.map((e) => [e.exerciseNameSnapshot, e.sets.length])).toEqual([
      ["Bench Press (Barbell)", 2],
      ["Squat", 1],
      ["Bench Press (Barbell)", 1],
      ["Bench Press (Barbell)", 1],
    ]);
    const bench = r.exercises.find((e) => e.title === "Bench Press (Barbell)")!;
    expect(bench).toMatchObject({ blocks: 3, sets: 4, workouts: 1 });
  });
  it("sorts sets by set_index within a block", () => {
    const r = normalizeHevyRows([row({ setIndex: 1, reps: 2 }), row({ setIndex: 0, reps: 1 })], UTC);
    // The second row restarts at 0, so it is its own block; sort applies inside a block.
    const r2 = normalizeHevyRows([row({ setIndex: 2, reps: 3 }), row({ setIndex: 1, reps: 2 })], UTC);
    expect(r2.drafts[0].exercises[0].sets.map((s) => s.reps)).toEqual([2, 3]);
    expect(r.drafts[0].exercises).toHaveLength(2);
  });
  it("gives sets and exercises fresh unique ids and empty exerciseId/exerciseIds", () => {
    const r = normalizeHevyRows([row({ setIndex: 0 }), row({ setIndex: 1 })], UTC);
    const d = r.drafts[0];
    const ids = [d.id, ...d.exercises.map((e) => e.id), ...d.exercises.flatMap((e) => e.sets.map((s) => s.id))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(d.exercises[0].exerciseId).toBe("");
    expect(d.exerciseIds).toEqual([]);
  });
  it("uses the workout description as notes and names an untitled workout", () => {
    const r = normalizeHevyRows([row({ title: "", description: "" }), row({ title: "", description: "felt good" })], UTC);
    expect(r.drafts[0].name).toBe("Workout");
    expect(r.drafts[0].notes).toBe("felt good");
    expect(r.unsupported.warnings.some((w) => /Empty title/.test(w.message))).toBe(true);
  });
  it("takes the first exercise note and warns when they differ", () => {
    const r = normalizeHevyRows([row({ setIndex: 0, exerciseNotes: "a" }), row({ setIndex: 1, exerciseNotes: "b" })], UTC);
    expect(r.drafts[0].exercises[0].notes).toBe("a");
    expect(r.unsupported.warnings).toHaveLength(1);
  });
});

describe("normalizeHevyRows: sets", () => {
  it("maps set types, accepting drop spellings, and warns once per unknown value", () => {
    const types = ["normal", "WARMUP", "drop", "dropset", " Drop_Set ", "failure", "superdrop", "superdrop"];
    const r = normalizeHevyRows(types.map((setType, i) => row({ setType, setIndex: i })), UTC);
    expect(r.drafts[0].exercises[0].sets.map((s) => s.type)).toEqual([
      "normal", "warmup", "drop", "drop", "drop", "failure", "normal", "normal",
    ]);
    expect(r.unsupported.unknownSetTypes).toEqual([{ value: "superdrop", rows: 2 }]);
  });
  it("maps distance, duration and RPE and skips empty sets, dropping blocks left empty", () => {
    const r = normalizeHevyRows(
      [
        row({ exerciseTitle: "Run", weightKg: undefined, reps: undefined, distanceMeters: 5000, durationSeconds: 1500, rpe: 7.5 }),
        row({ exerciseTitle: "Run", weightKg: undefined, reps: undefined, setIndex: 1 }),
        row({ exerciseTitle: "Nothing", weightKg: undefined, reps: undefined }),
      ],
      UTC,
    );
    expect(r.drafts[0].exercises).toHaveLength(1);
    expect(r.drafts[0].exercises[0].sets).toHaveLength(1);
    expect(r.drafts[0].exercises[0].sets[0]).toMatchObject({ distance: 5000, durationSeconds: 1500, rpe: 7.5 });
    expect(r.exercises[0].inferredType).toBe("distance");
    expect(r.unsupported.emptySetsSkipped).toBe(2);
  });
  it("rejects a workout whose sets are all empty", () => {
    const r = normalizeHevyRows([row({ weightKg: undefined, reps: undefined })], UTC);
    expect(r.drafts).toEqual([]);
    expect(r.unsupported.workoutsRejected).toHaveLength(1);
  });
  it("converts lb exports without rounding (via the parser) and reports volume in kg", () => {
    const csv =
      'title,start_time,end_time,exercise_title,set_type,weight_lbs,reps\n"Push","Oct 13, 2026, 9:50 PM","Oct 13, 2026, 11:00 PM","Bench","normal",225,5\n';
    const p = parseHevyCsv(csv);
    if (!p.ok) throw new Error("parse");
    const r = normalizeHevyRows(p.rows, UTC);
    expect(r.drafts[0].exercises[0].sets[0].weight).toBe(225 * 0.45359237);
    expect(r.totals.volumeKg).toBeCloseTo(225 * 0.45359237 * 5, 9);
  });
  it("infers bodyweight, assisted and weighted types", () => {
    const r = normalizeHevyRows(
      [
        row({ exerciseTitle: "Pull Up", weightKg: undefined, reps: 8 }),
        row({ exerciseTitle: "Pull Up (Assisted)", weightKg: 20, reps: 8 }),
        row({ exerciseTitle: "Squat" }),
      ],
      UTC,
    );
    const t = Object.fromEntries(r.exercises.map((e) => [e.title, e.inferredType]));
    expect(t).toEqual({ "Pull Up": "bodyweight_reps", "Pull Up (Assisted)": "assisted_bodyweight", Squat: "weighted_reps" });
  });
});

describe("normalizeHevyRows: supersets", () => {
  it("shares a fresh group id between blocks with the same superset id, per workout", () => {
    const r = normalizeHevyRows(
      [
        row({ exerciseTitle: "A", supersetId: "7" }),
        row({ exerciseTitle: "B", supersetId: "7" }),
        row({ exerciseTitle: "C" }),
        row({ exerciseTitle: "D", supersetId: "9" }),
        row({ title: "Other", startTime: "Oct 14, 2026, 9:00 AM", endTime: "Oct 14, 2026, 10:00 AM", exerciseTitle: "A", supersetId: "7" }),
        row({ title: "Other", startTime: "Oct 14, 2026, 9:00 AM", endTime: "Oct 14, 2026, 10:00 AM", exerciseTitle: "B", supersetId: "7" }),
      ],
      UTC,
    );
    const [w1, w2] = r.drafts.map((d) => d.exercises.map((e) => e.supersetGroupId));
    expect(w1[0]).toBeDefined();
    expect(w1[0]).toBe(w1[1]);
    expect(w1[0]).not.toBe("7");
    expect(w1[2]).toBeUndefined(); // no superset id
    expect(w1[3]).toBeUndefined(); // single-member group dropped
    expect(w2[0]).toBe(w2[1]);
    expect(w2[0]).not.toBe(w1[0]);
  });
});

describe("normalizeHevyRows: report", () => {
  it("echoes unsupported columns that held data", () => {
    const r = normalizeHevyRows([row()], { ...UTC, unsupportedColumns: ["mood"] });
    expect(r.unsupported.columns).toEqual(["mood"]);
  });
});
