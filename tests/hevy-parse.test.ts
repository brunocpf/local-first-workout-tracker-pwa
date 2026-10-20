import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_HEVY_BYTES,
  MAX_REPORTED_ERRORS,
  parseHevyCsv,
} from "#lib/imports/hevy/parse";

const sample = readFileSync("tests/fixtures/hevy/sample.csv", "utf8");
const H =
  "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe";
const q = (s: string) => `"${s}"`;
const line = (o: Record<string, string | number> = {}) => {
  const d: Record<string, string | number> = {
    title: q("Push"),
    start_time: q("Oct 13, 2026, 9:50 PM"),
    end_time: q("Oct 13, 2026, 11:00 PM"),
    description: q(""),
    exercise_title: q("Bench Press (Barbell)"),
    superset_id: "",
    exercise_notes: q(""),
    set_index: 0,
    set_type: q("normal"),
    weight_kg: 80,
    reps: 5,
    distance_km: "",
    duration_seconds: "",
    rpe: "",
    ...o,
  };
  return Object.values(d).join(",");
};
const ok = (text: string) => {
  const r = parseHevyCsv(text);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r;
};

describe("parseHevyCsv: sample", () => {
  it("parses the committed sample with zero errors", () => {
    const r = ok(sample);
    expect(r.errors).toEqual([]);
    expect(r.errorCount).toBe(0);
    expect(r.rows).toHaveLength(547);
    expect(r.units).toBe("kg");
    expect(r.warnings).toEqual([]);
    expect(new Set(r.rows.map((x) => x.startTime)).size).toBe(29);
    expect(new Set(r.rows.map((x) => x.exerciseTitle)).size).toBe(33);
    const tm = r.rows.filter((x) => x.exerciseTitle === "Treadmill");
    expect(tm).toHaveLength(14);
    expect(
      tm.every(
        (x) =>
          x.durationSeconds !== undefined &&
          x.weightKg === undefined &&
          x.reps === undefined,
      ),
    ).toBe(true);
    expect(r.rows[0]).toMatchObject({
      row: 2,
      title: "Pull",
      setType: "warmup",
      weightKg: 60,
      reps: 12,
    });
  });
});

describe("parseHevyCsv: format", () => {
  it("accepts BOM + CRLF", () => {
    const r = ok("﻿" + [H, line()].join("\r\n") + "\r\n");
    expect(r.rows).toHaveLength(1);
  });
  it("keeps embedded commas, quotes and newlines in notes and numbers row lines", () => {
    const r = ok(
      [
        H,
        line({ exercise_notes: q('a, ""b""\nc') }),
        line({ set_index: 1 }),
      ].join("\n"),
    );
    expect(r.rows[0].exerciseNotes).toBe('a, "b"\nc');
    expect(r.rows.map((x) => x.row)).toEqual([2, 4]);
  });
  it("reads columns by name, not position", () => {
    const r = ok(
      'exercise_title,set_type,start_time,title,reps\n"Squat","normal","Oct 1, 2026, 9:00 AM","Legs",8',
    );
    expect(r.rows[0]).toMatchObject({
      exerciseTitle: "Squat",
      title: "Legs",
      reps: 8,
    });
  });
  it("strips control characters and trims", () => {
    expect(
      ok([H, line({ title: q("  Pu\u0007sh ") })].join("\n")).rows[0].title,
    ).toBe("Push");
  });
  it("rejects a missing required column", () => {
    const r = parseHevyCsv("title,start_time\nx,y");
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.errors[0].message).toMatch(/exercise_title, set_type/);
  });
  it("rejects empty, oversize and unterminated input", () => {
    expect(parseHevyCsv("").ok).toBe(false);
    expect(parseHevyCsv("x".repeat(MAX_HEVY_BYTES + 1)).ok).toBe(false);
    expect(parseHevyCsv(`${H}\n"oops`).ok).toBe(false);
  });
  it("reports unknown columns as warnings, noting which held data", () => {
    const r = ok(`${H},foo,bar\n${line()},x,\n`);
    expect(r.unsupportedColumns).toEqual(["foo", "bar"]);
    expect(r.unsupportedColumnsWithData).toEqual(["foo"]);
    expect(r.warnings[0].message).toMatch(/foo, bar/);
  });
});

describe("parseHevyCsv: row validation", () => {
  it("reports row-numbered errors and keeps good rows", () => {
    const r = ok(
      [
        H,
        line(),
        line({ reps: "abc" }),
        line({ reps: 1.5 }),
        line({ weight_kg: -1 }),
        line({ start_time: q("") }),
      ].join("\n"),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(r.errors[0].message).toMatch(/reps/);
  });
  it("caps reported errors but counts all", () => {
    const bad = Array.from({ length: MAX_REPORTED_ERRORS + 10 }, () =>
      line({ reps: "x" }),
    );
    const r = ok([H, ...bad].join("\n"));
    expect(r.errors).toHaveLength(MAX_REPORTED_ERRORS);
    expect(r.errorCount).toBe(MAX_REPORTED_ERRORS + 10);
    expect(r.warnings.some((w) => /10 more/.test(w.message))).toBe(true);
  });
  it("rejects rows with extra data fields", () => {
    const r = ok([H, line() + ",extra"].join("\n"));
    expect(r.rows).toHaveLength(0);
    expect(r.errorCount).toBe(1);
  });
  it("caps text length", () => {
    expect(
      ok([H, line({ title: q("x".repeat(201)) })].join("\n")).errorCount,
    ).toBe(1);
  });
});

describe("parseHevyCsv: synthetic coverage", () => {
  it("passes set types through raw (mapping is T5.03)", () => {
    const r = ok(
      [
        H,
        line({ set_type: q("dropset") }),
        line({ set_type: q("failure"), set_index: 1 }),
        line({ set_type: q("weird"), set_index: 2 }),
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.setType)).toEqual([
      "dropset",
      "failure",
      "weird",
    ]);
  });
  it("keeps superset ids and RPE, ignoring out-of-range RPE with a warning", () => {
    const r = ok(
      [
        H,
        line({ superset_id: 1, rpe: 8.5 }),
        line({ superset_id: 1, rpe: 11, set_index: 1 }),
        line({ rpe: 7.3, set_index: 2 }),
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.supersetId)).toEqual(["1", "1", ""]);
    expect(r.rows.map((x) => x.rpe)).toEqual([8.5, undefined, undefined]);
    expect(r.warnings.some((w) => /2 rpe/.test(w.message))).toBe(true);
  });
  it("converts distance_km to metres", () => {
    const r = ok(
      [
        H,
        line({
          exercise_title: q("Run"),
          weight_kg: "",
          reps: "",
          distance_km: 5.1234,
          duration_seconds: 1800,
        }),
      ].join("\n"),
    );
    expect(r.rows[0]).toMatchObject({
      distanceMeters: 5123.4,
      durationSeconds: 1800,
    });
    expect(r.rows[0].weightKg).toBeUndefined();
  });
  it("detects lb exports and converts weight and miles", () => {
    const h = H.replace("weight_kg", "weight_lbs").replace(
      "distance_km",
      "distance_miles",
    );
    const r = ok([h, line({ weight_kg: 225, distance_km: 1 })].join("\n"));
    expect(r.units).toBe("lb");
    expect(r.rows[0].weightKg).toBeCloseTo(102.058, 3);
    expect(r.rows[0].distanceMeters).toBe(1609.344);
  });
  it("rejects a header with both unit families", () => {
    expect(parseHevyCsv(`${H},weight_lbs\n${line()},1`).ok).toBe(false);
  });
});
