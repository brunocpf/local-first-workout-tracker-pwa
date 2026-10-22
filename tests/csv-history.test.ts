import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildHistoryCsv, sessionsToCsv } from "#lib/exports/csv";
import { findDuplicates } from "#lib/imports/duplicates";
import {
  csvInitialChoices,
  freshenTakenIds,
  mappingIssues,
  normalizeCsvHistory,
  readCsvTable,
  reservedExerciseIds,
  suggestMapping,
  suggestUnits,
  type CsvImportOptions,
  type CsvTable,
} from "#lib/imports/csvHistory";
import { buildHevyPlan, type HevyChoice } from "#lib/imports/hevy/plan";
import { db } from "#lib/storage/db";
import { listExercises } from "#lib/storage/exercises";
import { commitHevyImport, existingSessionIds, listSessionIdentitiesAround } from "#lib/storage/hevyImport";
import { importCompletedSessions } from "#lib/storage/sessions";
import type { Exercise, WorkoutSession } from "#lib/types";

const OPTIONS: CsvImportOptions = {
  timeZone: "UTC",
  units: { weight: "kg", distance: "m", duration: "s" },
  importedAt: new Date("2026-10-20T10:00:00Z"),
};

function table(text: string): CsvTable {
  const r = readCsvTable(text);
  if (!r.ok) throw new Error(r.error);
  return r.table;
}
const run = (text: string, over: Partial<CsvImportOptions> = {}) => {
  const t = table(text);
  const mapping = suggestMapping(t.headers);
  return normalizeCsvHistory(t, mapping, { ...OPTIONS, units: suggestUnits(t.headers, mapping), ...over });
};

describe("readCsvTable", () => {
  it("reads headers and rows, detecting ; and tab delimiters", () => {
    expect(table("a,b\r\n1,2\r\n").headers).toEqual(["a", "b"]);
    const semi = table("a;b\n1;2\n");
    expect(semi.delimiter).toBe(";");
    expect(semi.rows[0].fields).toEqual(["1", "2"]);
    expect(table("a\tb\n1\t2\n").delimiter).toBe("\t");
    expect(table('"a,b",c\n1,2\n').headers).toEqual(["a,b", "c"]);
  });
  it("rejects empty, header-only, unterminated and oversized input", () => {
    for (const bad of ["", "a,b\n", '"a,b\n1,2', "x".repeat(10 * 1024 * 1024 + 1)]) expect(readCsvTable(bad).ok).toBe(false);
  });
});

describe("suggestMapping", () => {
  it("maps this app's own export headers one to one", () => {
    const own = "session_id,session_name,started_at,ended_at,local_date,time_zone,routine_name,exercise_id,exercise_name,exercise_order,set_order,set_type,weight_kg,reps,duration_s,distance_m,rpe,rir,completed,notes".split(",");
    const m = suggestMapping(own);
    expect(own[m.exerciseName!]).toBe("exercise_name");
    expect(own[m.startedAt!]).toBe("started_at");
    expect(own[m.localDate!]).toBe("local_date");
    expect(own[m.weight!]).toBe("weight_kg");
    expect(own[m.duration!]).toBe("duration_s");
    expect(own[m.distance!]).toBe("distance_m");
    expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length);
    expect(Object.keys(m)).toHaveLength(20);
    expect(mappingIssues(m)).toEqual([]);
    expect(suggestUnits(own, m)).toEqual({ weight: "kg", distance: "m", duration: "s" });
  });
  it("tries common synonyms and unit hints, and reports what is missing", () => {
    const h = ["Date", "Exercise", "Set", "Weight (lbs)", "Reps", "Distance (mi)"];
    const m = suggestMapping(h);
    expect(m).toMatchObject({ startedAt: 0, exerciseName: 1, setOrder: 2, weight: 3, reps: 4, distance: 5 });
    expect(suggestUnits(h, m)).toEqual({ weight: "lb", distance: "mi", duration: "s" });
    expect(mappingIssues({})).toHaveLength(3);
    expect(mappingIssues({ exerciseName: 0, startedAt: 1, reps: 2 })).toEqual([]);
  });
});

const OWN_HEADER = "session_id,session_name,started_at,ended_at,local_date,time_zone,routine_name,exercise_id,exercise_name,exercise_order,set_order,set_type,weight_kg,reps,duration_s,distance_m,rpe,rir,completed,notes";

describe("normalizeCsvHistory", () => {
  it("groups rows into sessions, blocks by exercise position and sets by position", () => {
    const r = run(
      [
        OWN_HEADER,
        "s1,Push,2026-03-01T10:00:00.000Z,2026-03-01T11:00:00.000Z,2026-03-01,Europe/Lisbon,Push A,bench,Bench,2,2,warmup,40,10,,,,,true,",
        "s1,Push,2026-03-01T10:00:00.000Z,2026-03-01T11:00:00.000Z,2026-03-01,Europe/Lisbon,Push A,bench,Bench,2,1,normal,82.5,5,,,8,2,false,felt good",
        "s1,Push,2026-03-01T10:00:00.000Z,2026-03-01T11:00:00.000Z,2026-03-01,Europe/Lisbon,Push A,ohp,OHP,1,1,normal,30,8,,,,,true,",
        "s2,Run,2026-03-03T07:00:00.000Z,,2026-03-03,UTC,,run,Run,1,1,normal,,,1800,5000,,,true,",
      ].join("\n"),
    );
    expect(r.drafts.map((d) => [d.id, d.name, d.timeZone, d.routineNameSnapshot])).toEqual([
      ["s1", "Push", "Europe/Lisbon", "Push A"],
      ["s2", "Run", "UTC", undefined],
    ]);
    const [push, run2] = r.drafts;
    expect(push.exercises.map((e) => e.exerciseNameSnapshot)).toEqual(["OHP", "Bench"]);
    const bench = push.exercises[1].sets;
    expect(bench.map((s) => [s.type, s.weight, s.reps])).toEqual([["normal", 82.5, 5], ["warmup", 40, 10]]);
    expect(bench[0]).toMatchObject({ rpe: 8, rir: 2, notes: "felt good" });
    expect(bench[0].completedAt).toBeUndefined(); // completed=false
    expect(bench[1].completedAt).toBe("2026-03-01T11:00:00.000Z");
    expect(run2.endedAt).toBeUndefined();
    expect(r.exercises.find((e) => e.title === "Run")?.inferredType).toBe("distance");
    expect(r.exerciseIds).toMatchObject({ Bench: "bench", OHP: "ohp" });
    expect(r.totals).toMatchObject({ workouts: 2, sets: 4 });
  });

  it("converts units: lb, km/mi, minutes and clock durations", () => {
    const r = run("date,exercise,weight,distance,duration\n2026-03-01,A,100,2,10\n2026-03-01,B,,1,1:05:30\n", {
      units: { weight: "lb", distance: "km", duration: "min" },
    });
    const [a, b] = r.drafts[0].exercises;
    expect(a.sets[0].weight).toBeCloseTo(45.359237, 6);
    expect(a.sets[0]).toMatchObject({ distance: 2000, durationSeconds: 600 });
    expect(b.sets[0]).toMatchObject({ distance: 1000, durationSeconds: 3930 });
    const mi = run("date,exercise,distance\n2026-03-01,A,1\n", { units: { weight: "kg", distance: "mi", duration: "s" } });
    expect(mi.drafts[0].exercises[0].sets[0].distance).toBe(1609.344);
  });

  it("reads wall-clock times in the chosen zone and a date alone as that local day", () => {
    const r = run('start,exercise,reps\n2026-07-01 09:30,A,5\n2026-07-02,A,5\n"Oct 13, 2026, 9:50 PM",A,5\nsoon,A,5\n', { timeZone: "America/New_York" });
    expect(r.drafts.map((d) => [d.startedAt, d.timeZone])).toEqual([
      ["2026-07-01T13:30:00.000Z", "America/New_York"],
      ["2026-07-02T16:00:00.000Z", "America/New_York"],
      ["2026-10-14T01:50:00.000Z", "America/New_York"],
    ]);
    expect(r.report.workoutsRejected).toHaveLength(1);
  });

  it("groups by start and name without a workout id, and keeps a UTC offset exact", () => {
    const r = run("start_time,title,exercise,reps\n2026-03-01T10:00:00+02:00,Legs,A,5\n2026-03-01T10:00:00+02:00,Legs,B,5\n2026-03-01T10:00:00+02:00,Arms,C,5\n");
    expect(r.drafts.map((d) => [d.name, d.exercises.length, d.startedAt])).toEqual([
      ["Legs", 2, "2026-03-01T08:00:00.000Z"],
      ["Arms", 1, "2026-03-01T08:00:00.000Z"],
    ]);
  });

  it("drops invalid rows, empty sets and unusable workouts with a report, never throwing", () => {
    const r = run(
      [
        "date,exercise,weight,reps,rpe,set_type",
        "2026-03-01,A,abc,5,,",
        "2026-03-01,A,0x10,5,,",
        "2026-03-01,,50,5,,",
        "2026-03-01,A,50,5.5,,",
        "2026-03-01,A,50,5,11,",
        "2026-03-01,A,60,5,,dropset",
        "2026-03-01,A,,,,",
        "2026-03-01,A,70,5,,mystery",
        "not a date,B,50,5,,",
        "2026-03-02,C,,,,",
      ].join("\n"),
    );
    expect(r.report.rowErrorCount).toBe(4);
    expect(r.report.rowErrors[0]).toEqual({ where: "Row 2", message: "Invalid weight." });
    expect(r.report.emptySetsSkipped).toBe(2);
    expect(r.report.unknownSetTypes).toEqual([{ value: "mystery", rows: 1 }]);
    expect(r.report.workoutsRejected.map((w) => w.message)).toEqual([expect.stringContaining("Unrecognized start time"), "No sets with data."]);
    const sets = r.drafts[0].exercises[0].sets;
    expect(sets.map((s) => [s.weight, s.type, s.rpe])).toEqual([[50, "normal", undefined], [60, "drop", undefined], [70, "normal", undefined]]);
    expect(r.report.warnings.some((w) => w.message.includes("RPE out of range"))).toBe(true);
  });

  it("strips control characters and the export's formula guard, and caps text", () => {
    const r = run(`date,title,exercise,reps,notes\n2026-03-01,"'=evil","Row\u0000 ${"x".repeat(300)}",5,"'@home"\n`);
    const d = r.drafts[0];
    expect(d.name).toBe("=evil");
    expect(d.exercises[0].exerciseNameSnapshot).toHaveLength(200);
    expect(d.exercises[0].exerciseNameSnapshot).not.toContain("\u0000");
    expect(d.exercises[0].sets[0].notes).toBe("@home");
  });

  it("refuses a mapping without the required fields", () => {
    expect(() => normalizeCsvHistory(table("a,b\n1,2\n"), {}, OPTIONS)).toThrow();
    expect(() => normalizeCsvHistory(table("date,exercise,reps\n2026-03-01,A,5\n"), { exerciseName: 1, startedAt: 0, reps: 2 }, { ...OPTIONS, timeZone: "Nope/Zone" })).toThrow(RangeError);
  });

  it("gives a clashing session id within the file a fresh one", () => {
    const r = run(`${OWN_HEADER}\nx,A,2026-03-01T10:00:00Z,,,,,,E,1,1,normal,50,5,,,,,true,\nx,B,2026-03-02T10:00:00Z,,,,,,E,1,1,normal,50,5,,,,,true,\n`);
    expect(r.drafts).toHaveLength(1); // same id = one workout, whatever the other columns say
    const two = freshenTakenIds(r.drafts, new Set(["x"]));
    expect(two[0].id).not.toBe("x");
    expect(freshenTakenIds(r.drafts, new Set())[0].id).toBe("x");
  });
});

// ---- Round trip through the real Dexie pipeline (the acceptance criterion) -----------------------------------------

const custom: Exercise = {
  id: "my-custom-lift",
  name: "My Custom Lift",
  aliases: [],
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  exerciseType: "weighted_reps",
  isCustom: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ORIGINALS: WorkoutSession[] = [
  {
    id: "sess-1",
    name: 'Push, "heavy"',
    status: "completed",
    startedAt: "2026-03-01T23:30:00.000Z",
    endedAt: "2026-03-02T00:30:00.000Z",
    timeZone: "Asia/Tokyo",
    routineNameSnapshot: "Push A",
    exerciseIds: ["barbell_bench_press", "my-custom-lift"],
    createdAt: "2026-03-02T00:30:00.000Z",
    updatedAt: "2026-03-02T00:30:00.000Z",
    exercises: [
      {
        id: "ex-a",
        exerciseId: "barbell_bench_press",
        exerciseNameSnapshot: "Barbell Bench Press",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [
          { id: "a1", type: "warmup", weight: 40, reps: 10, completedAt: "2026-03-02T00:30:00.000Z" },
          { id: "a2", type: "normal", weight: 82.5, reps: 5, rpe: 8, rir: 2, completedAt: "2026-03-02T00:30:00.000Z", notes: "line1\nline2, \"quoted\"" },
          { id: "a3", type: "failure", weight: 80, reps: 3 },
        ],
      },
      {
        id: "ex-b",
        exerciseId: "my-custom-lift",
        exerciseNameSnapshot: "My Custom Lift",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [{ id: "b1", type: "drop", weight: 60.125, reps: 12, completedAt: "2026-03-02T00:30:00.000Z", notes: "=cmd" }],
      },
      {
        id: "ex-c",
        exerciseId: "barbell_bench_press",
        exerciseNameSnapshot: "Barbell Bench Press",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [{ id: "c1", type: "normal", weight: 70, reps: 8, completedAt: "2026-03-02T00:30:00.000Z" }],
      },
    ],
  },
  {
    id: "sess-2",
    name: "Easy run",
    status: "completed",
    startedAt: "2026-03-05T07:00:00.000Z",
    timeZone: "Europe/Lisbon",
    exerciseIds: ["my-custom-lift"],
    createdAt: "2026-03-05T07:30:00.000Z",
    updatedAt: "2026-03-05T07:30:00.000Z",
    exercises: [
      {
        id: "ex-d",
        exerciseId: "my-custom-lift",
        exerciseNameSnapshot: "My Custom Lift",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [{ id: "d1", type: "normal", reps: 20, durationSeconds: 1800, distance: 5000.5, completedAt: "2026-03-05T07:00:00.000Z" }],
      },
    ],
  },
];

/** What the CSV carries: ids of sets/blocks, timestamps of the import and a set's exact completion instant are not part of it. */
const comparable = (s: WorkoutSession) =>
  JSON.parse(
    JSON.stringify({
      ...s,
      createdAt: undefined,
      updatedAt: undefined,
      exercises: s.exercises.map((e) => ({ ...e, id: undefined, sets: e.sets.map((x) => ({ ...x, id: undefined, completedAt: x.completedAt !== undefined })) })),
    }),
  );

async function importText(csv: string, decide: (title: string) => HevyChoice, over: Partial<CsvImportOptions> = {}, include: Record<string, boolean> = {}) {
  const t = table(csv);
  const mapping = suggestMapping(t.headers);
  const result = normalizeCsvHistory(t, mapping, { ...OPTIONS, units: suggestUnits(t.headers, mapping), ...over });
  const catalog = await listExercises();
  const initial = csvInitialChoices(result.exercises, catalog, result.exerciseIds);
  const choices: Record<string, HevyChoice | undefined> = { ...initial.choices };
  for (const e of result.exercises) choices[e.title] ??= decide(e.title);
  const drafts = freshenTakenIds(result.drafts, await existingSessionIds(result.drafts.map((d) => d.id)));
  const duplicates = findDuplicates(drafts, await listSessionIdentitiesAround(drafts[0].startedAt, drafts[drafts.length - 1].startedAt));
  const plan = buildHevyPlan({
    drafts,
    exercises: result.exercises,
    choices,
    catalog,
    duplicates,
    include,
    createdIds: reservedExerciseIds(result.exercises, catalog, result.exerciseIds),
  });
  return { plan, result, initial };
}

beforeEach(async () => {
  // The catalog is seeded once per database, so only custom exercises are removed.
  await Promise.all([db.sessions.clear(), db.exercises.filter((e) => e.isCustom).delete(), db.settings.clear()]);
  await listExercises(); // seeds on first use
});

describe("CSV import round trip", () => {
  it("re-imports this app's own export into an empty database with identical sessions", async () => {
    await db.exercises.add(structuredClone(custom));
    await importCompletedSessions(ORIGINALS);
    const csv = await buildHistoryCsv();
    expect(csv.split("\r\n").length).toBeGreaterThan(5);

    await Promise.all([db.sessions.clear(), db.exercises.filter((e) => e.isCustom).delete()]);
    expect(await db.sessions.count()).toBe(0);

    const { plan, initial } = await importText(csv, () => ({ kind: "create" }));
    // Catalog exercises are matched by id; only the custom one needed a decision.
    expect(initial.choices["Barbell Bench Press"]).toEqual({ kind: "exercise", exerciseId: "barbell_bench_press" });
    expect(initial.choices["My Custom Lift"]).toBeUndefined();
    expect(plan.undecided).toEqual([]);
    expect(plan.newExercises.map((x) => [x.id, x.name])).toEqual([["my-custom-lift", "My Custom Lift"]]);

    const written = await commitHevyImport({ ...plan, mappings: {} });
    expect(written).toBe(2);

    const stored = (await db.sessions.toArray()).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    expect(stored.map(comparable)).toEqual(ORIGINALS.map(comparable));
    // Re-exporting the import gives the same file again.
    expect(sessionsToCsv(stored)).toBe(csv);
    expect(await db.exercises.get("my-custom-lift")).toMatchObject({ name: "My Custom Lift", isCustom: true });
    expect((await getSettingsMap()) ?? {}).toEqual({});
  });

  it("flags a second import of the same file as duplicates and skips them by default", async () => {
    await db.exercises.add(structuredClone(custom));
    await importCompletedSessions(ORIGINALS);
    const csv = await buildHistoryCsv();

    const { plan } = await importText(csv, () => ({ kind: "create" }));
    expect(plan.sessions).toHaveLength(0);
    expect(plan.counts.deselectedWorkouts).toBe(2);
  });

  it("never overwrites: a file whose session id is already stored but differs gets a fresh id", async () => {
    await importCompletedSessions([ORIGINALS[1]]);
    const edited = `${OWN_HEADER}\nsess-2,Other run,2026-05-05T07:00:00.000Z,,,UTC,,,Row,1,1,normal,50,5,,,,,true,\n`;
    const { plan } = await importText(edited, () => ({ kind: "skip" as const }), {}, {});
    expect(plan.undecided).toEqual([]);
    expect(plan.sessions).toHaveLength(0); // all exercises skipped -> emptied
    const { plan: plan2 } = await importText(edited, () => ({ kind: "create" }));
    expect(plan2.sessions).toHaveLength(1);
    expect(plan2.sessions[0].id).not.toBe("sess-2");
    expect(await commitHevyImport({ ...plan2, mappings: {} })).toBe(1);
    expect(await db.sessions.count()).toBe(2);
    expect((await db.sessions.get("sess-2"))?.name).toBe("Easy run");
  });
});

async function getSettingsMap() {
  const { getSettings } = await import("#lib/storage/settings");
  return (await getSettings()).hevyExerciseMap;
}
