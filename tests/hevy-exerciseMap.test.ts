import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { resolveHevyName, splitHevyTitle } from "#lib/imports/hevy/exerciseMap";
import { parseHevyCsv } from "#lib/imports/hevy/parse";

const catalog = [...SEED_EXERCISES];
const parsed = parseHevyCsv(readFileSync("tests/fixtures/hevy/sample.csv", "utf8"));
const titles = parsed.ok ? [...new Set(parsed.rows.map((r) => r.exerciseTitle))] : [];

/** Reviewed list: every title of the sample, auto-matched ids, or deliberately not auto-matched. */
const MATCHED: Record<string, string> = {
  "Bent Over Row (Barbell)": "barbell_row",
  "Lat Pulldown (Cable)": "lat_pulldown",
  "Landmine Row": "t_bar_row",
  Treadmill: "treadmill_run",
  "Shrug (Dumbbell)": "dumbbell_shrug",
  "Bench Press (Barbell)": "barbell_bench_press",
  "Shoulder Press (Dumbbell)": "seated_dumbbell_press",
  "Triceps Pushdown": "triceps_pushdown",
  "Triceps Rope Pushdown": "triceps_pushdown",
  "Incline Bench Press (Dumbbell)": "incline_dumbbell_press",
  "Lat Pulldown (Machine)": "lat_pulldown",
  "Chest Press (Machine)": "machine_chest_press",
  "Straight Arm Lat Pulldown (Cable)": "straight_arm_pulldown",
  "Lateral Raise (Dumbbell)": "dumbbell_lateral_raise",
  "Squat (Barbell)": "back_squat",
  "Romanian Deadlift (Barbell)": "romanian_deadlift",
  "Seated Leg Curl (Machine)": "seated_leg_curl",
  "Seated Calf Raise": "seated_calf_raise",
  "T Bar Row": "t_bar_row",
  "Lat Pulldown - Close Grip (Cable)": "close_grip_lat_pulldown",
  "Bicep Curl (Dumbbell)": "dumbbell_curl",
  "Chest Fly (Machine)": "pec_deck",
  "Leg Press (Machine)": "leg_press",
  "Leg Extension (Machine)": "leg_extension",
  "Standing Cable Glute Kickbacks": "cable_glute_kickback",
  "Lying Leg Curl (Machine)": "lying_leg_curl",
  "Standing Calf Raise (Machine)": "standing_calf_raise",
};
const NOT_MATCHED = [
  "Crunch (Machine)",
  "Preacher Curl (Machine)",
  "Decline Crunch (Weighted)",
  "Overhead Press (Dumbbell)",
  "Back Extension (Weighted Hyperextension)",
  "Seated Cable Row - V Grip (Cable)",
];

describe("resolveHevyName on the sample", () => {
  it("covers every distinct title in the sample", () => {
    expect(titles).toHaveLength(33);
    expect(titles.toSorted()).toEqual([...Object.keys(MATCHED), ...NOT_MATCHED].toSorted());
  });
  it.each(Object.entries(MATCHED))("matches %s → %s", (title, id) => {
    const r = resolveHevyName(title, catalog);
    expect(r.status).toBe("matched");
    expect(r.status === "matched" && r.exerciseId).toBe(id);
  });
  it.each(NOT_MATCHED)("never silently matches %s", (title) => {
    expect(resolveHevyName(title, catalog).status).not.toBe("matched");
  });
  it("suggests the near-miss catalog exercise instead of matching", () => {
    const r = resolveHevyName("Crunch (Machine)", catalog);
    expect(r).toEqual({ status: "suggested", candidates: [{ exerciseId: "crunch", score: 0.9 }] });
    const b = resolveHevyName("Back Extension (Weighted Hyperextension)", catalog);
    expect(b.status === "suggested" && b.candidates.some((c) => c.exerciseId === "back_extension")).toBe(true);
  });
});

describe("resolveHevyName", () => {
  it("returns unresolved for unknown titles", () => {
    expect(resolveHevyName("Zzzz Qqqq (Xxxx)", catalog)).toEqual({ status: "unresolved" });
  });
  it("ignores table ids missing or archived in the catalog", () => {
    const c = catalog.map((x) => (x.id === "barbell_row" ? { ...x, archivedAt: "2026-01-01T00:00:00.000Z" } : x));
    expect(resolveHevyName("Bent Over Row (Barbell)", c).status).not.toBe("matched");
    expect(resolveHevyName("Bench Press (Barbell)", [])).toEqual({ status: "unresolved" });
  });
  it("matches a base name when the equipment hint agrees", () => {
    expect(resolveHevyName("Face Pull (Cable)", catalog)).toMatchObject({ status: "matched", exerciseId: "face_pull" });
  });
});

describe("splitHevyTitle", () => {
  it("splits a trailing group", () => {
    expect(splitHevyTitle("Lat Pulldown - Close Grip (Cable)")).toEqual({ base: "Lat Pulldown - Close Grip", hint: "Cable" });
    expect(splitHevyTitle("Landmine Row")).toEqual({ base: "Landmine Row" });
    expect(splitHevyTitle("Foo ()")).toEqual({ base: "Foo ()" });
  });
});
