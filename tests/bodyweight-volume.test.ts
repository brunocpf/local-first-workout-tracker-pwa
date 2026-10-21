import { describe, expect, it } from "vitest";
import {
  bodyweightOn,
  effectiveLoad,
  exerciseVolume,
  personalRecords,
  prTimeline,
  withEffectiveLoad,
} from "#lib/progress/metrics";
import { exerciseSeries } from "#lib/progress/series";
import type { BodyMeasurement, ExerciseType, LoggedSet, SessionExercise, WorkoutSession } from "#lib/types";

const DONE = "2026-01-10T10:00:00.000Z";
const set = (weight: number | undefined, reps: number | undefined, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  type: "normal",
  weight,
  reps,
  completedAt: DONE,
  ...over,
});

const bw = (value: number, measuredAt: string, over: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: measuredAt,
  kind: "bodyweight",
  value,
  measuredAt,
  timeZone: "UTC",
  ...over,
});

const entry = (exerciseId: string, sets: LoggedSet[], type: ExerciseType): SessionExercise => ({
  id: `e-${exerciseId}`,
  exerciseId,
  exerciseNameSnapshot: exerciseId,
  exerciseTypeSnapshot: type,
  sets,
});

const session = (id: string, startedAt: string, exercises: SessionExercise[], timeZone = "UTC"): WorkoutSession => ({
  id,
  name: "Workout",
  status: "completed",
  startedAt,
  endedAt: startedAt,
  timeZone,
  exercises,
  exerciseIds: exercises.map((e) => e.exerciseId),
  createdAt: startedAt,
  updatedAt: startedAt,
});

describe("bodyweightOn", () => {
  const list = [
    bw(82, "2026-01-20T08:00:00.000Z"),
    bw(80, "2026-01-01T08:00:00.000Z"),
    bw(81, "2026-01-10T08:00:00.000Z"),
    bw(30, "2026-01-05T08:00:00.000Z", { kind: "waist" }),
  ];

  it("returns the latest bodyweight on or before the date, in any input order", () => {
    expect(bodyweightOn(list, "2026-01-09")).toBe(80);
    expect(bodyweightOn(list, "2026-01-15")).toBe(81);
    expect(bodyweightOn(list, "2026-02-01")).toBe(82);
  });

  it("includes a measurement taken later the same local day", () => {
    expect(bodyweightOn(list, "2026-01-10")).toBe(81);
  });

  it("is undefined before the first measurement, with none, and ignores other kinds", () => {
    expect(bodyweightOn(list, "2025-12-31")).toBeUndefined();
    expect(bodyweightOn([], "2026-01-10")).toBeUndefined();
    expect(bodyweightOn([bw(30, "2026-01-05T08:00:00.000Z", { kind: "waist" })], "2026-02-01")).toBeUndefined();
  });

  it("uses the measurement's own time zone for its day", () => {
    // 23:30 UTC on the 10th is already the 11th in Auckland (UTC+13 in January).
    const m = bw(79, "2026-01-10T23:30:00.000Z", { timeZone: "Pacific/Auckland" });
    expect(bodyweightOn([m], "2026-01-10")).toBeUndefined();
    expect(bodyweightOn([m], "2026-01-11")).toBe(79);
  });
});

describe("effectiveLoad", () => {
  it("adds the logged weight for weighted bodyweight and subtracts assistance", () => {
    expect(effectiveLoad(20, "weighted_bodyweight", 80)).toBe(100);
    expect(effectiveLoad(undefined, "weighted_bodyweight", 80)).toBe(80);
    expect(effectiveLoad(30, "assisted_bodyweight", 80)).toBe(50);
  });

  it("floors assisted load at 0 and is undefined without bodyweight or for other types", () => {
    expect(effectiveLoad(100, "assisted_bodyweight", 80)).toBe(0);
    expect(effectiveLoad(20, "weighted_bodyweight", undefined)).toBeUndefined();
    expect(effectiveLoad(20, "weighted_reps", 80)).toBeUndefined();
    expect(effectiveLoad(20, "bodyweight_reps", 80)).toBeUndefined();
  });
});

describe("exerciseVolume with bodyweight", () => {
  const sets = [set(20, 5), set(20, 5, { type: "warmup" }), set(10, 5, { completedAt: undefined }), set(10, 4, { type: "drop" })];

  it("weighted bodyweight: (bodyweight + added) x reps over counted sets", () => {
    expect(exerciseVolume(sets, "weighted_bodyweight", 80)).toBe(100 * 5 + 90 * 4);
  });

  it("assisted bodyweight: (bodyweight - assistance) x reps", () => {
    expect(exerciseVolume(sets, "assisted_bodyweight", 80)).toBe(60 * 5 + 70 * 4);
  });

  it("is unchanged without a bodyweight: 0 for bodyweight types, weight x reps for weighted_reps", () => {
    expect(exerciseVolume(sets, "weighted_bodyweight")).toBe(0);
    expect(exerciseVolume(sets, "assisted_bodyweight")).toBe(0);
    expect(exerciseVolume(sets, "bodyweight_reps")).toBe(0);
    expect(exerciseVolume(sets)).toBe(20 * 5 + 10 * 4);
  });

  it("ignores bodyweight for weighted_reps and for types without an effective load", () => {
    expect(exerciseVolume(sets, "weighted_reps", 80)).toBe(20 * 5 + 10 * 4);
    expect(exerciseVolume(sets, "bodyweight_reps", 80)).toBe(0);
    expect(exerciseVolume(sets, "duration", 80)).toBe(0);
  });
});

describe("withEffectiveLoad", () => {
  it("replaces weight and keeps the rest; returns the same sets when it cannot apply", () => {
    const sets = [set(10, 5, { id: "a" })];
    expect(withEffectiveLoad(sets, "weighted_bodyweight", 80)).toEqual([{ ...sets[0], weight: 90 }]);
    expect(sets[0].weight).toBe(10);
    expect(withEffectiveLoad(sets, "weighted_bodyweight", undefined)).toBe(sets);
    expect(withEffectiveLoad(sets, "weighted_reps", 80)).toBe(sets);
  });
});

describe("assisted PRs: lower assistance is better", () => {
  it("ranks the least assisted set as the max weight and per-rep best", () => {
    const pr = personalRecords([withEffectiveLoad([set(40, 5), set(30, 5), set(35, 8)], "assisted_bodyweight", 80)]);
    expect(pr.maxWeight).toBe(50); // 80 - 30
    expect(pr.repPRs[5]).toBe(50);
    expect(pr.repPRs[8]).toBe(45);
  });

  it("flags less assistance as a new PR and more assistance as none", () => {
    const at = (day: string, assistance: number) => ({
      startedAt: `2026-01-${day}T10:00:00.000Z`,
      sets: withEffectiveLoad([set(assistance, 5, { id: `${day}` })], "assisted_bodyweight", 80),
    });
    const timeline = prTimeline([at("01", 30), at("08", 20), at("15", 25)]);
    expect(timeline[0].prs).toEqual([]);
    expect(timeline[1].prs.map((p) => p.kind)).toContain("maxWeight");
    expect(timeline[2].prs).toEqual([]);
  });

  it("flags more added weight as a PR for weighted bodyweight", () => {
    const at = (day: string, added: number) => ({
      startedAt: `2026-01-${day}T10:00:00.000Z`,
      sets: withEffectiveLoad([set(added, 5)], "weighted_bodyweight", 80),
    });
    const timeline = prTimeline([at("01", 10), at("08", 15)]);
    expect(timeline[1].prs.find((p) => p.kind === "maxWeight")?.value).toBe(95);
  });
});

describe("exerciseSeries with bodyweight", () => {
  const pullups = (id: string, startedAt: string, sets: LoggedSet[], type: ExerciseType = "weighted_bodyweight") =>
    session(id, startedAt, [entry("pullup", sets, type)]);

  it("is unchanged without measurements", () => {
    const points = exerciseSeries([pullups("a", "2026-01-10T10:00:00.000Z", [set(10, 5)])], "pullup");
    expect(points).toEqual([{ date: "2026-01-10", sessionId: "a", volume: 0, bestReps: 5 }]);
  });

  it("uses the bodyweight in effect on each session's local date", () => {
    const sessions = [
      pullups("a", "2026-01-10T10:00:00.000Z", [set(10, 5)]),
      pullups("b", "2026-02-10T10:00:00.000Z", [set(10, 5)]),
    ];
    const measurements = [bw(80, "2026-01-01T08:00:00.000Z"), bw(78, "2026-02-01T08:00:00.000Z"), bw(70, "2026-03-01T08:00:00.000Z")];
    const points = exerciseSeries(sessions, "pullup", { measurements });
    expect(points.map((p) => p.volume)).toEqual([90 * 5, 88 * 5]);
    expect(points.map((p) => p.maxWeight)).toEqual([90, 88]);
    expect(points[0].e1rm).toBeCloseTo(90 * (1 + 5 / 30));
  });

  it("leaves a session before the first measurement at 0 volume", () => {
    const points = exerciseSeries([pullups("a", "2026-01-10T10:00:00.000Z", [set(10, 5)])], "pullup", {
      measurements: [bw(80, "2026-02-01T08:00:00.000Z")],
    });
    expect(points[0].volume).toBe(0);
    expect(points[0].maxWeight).toBeUndefined();
  });

  it("assisted: less assistance gives a higher load across sessions", () => {
    const sessions = [
      pullups("a", "2026-01-10T10:00:00.000Z", [set(40, 6)], "assisted_bodyweight"),
      pullups("b", "2026-01-17T10:00:00.000Z", [set(30, 6)], "assisted_bodyweight"),
    ];
    const points = exerciseSeries(sessions, "pullup", { measurements: [bw(80, "2026-01-01T08:00:00.000Z")] });
    expect(points.map((p) => p.maxWeight)).toEqual([40, 50]);
    expect(points.map((p) => p.volume)).toEqual([240, 300]);
  });

  it("never applies bodyweight to weighted_reps or bodyweight_reps", () => {
    const measurements = [bw(80, "2026-01-01T08:00:00.000Z")];
    const [bench] = exerciseSeries([pullups("a", "2026-01-10T10:00:00.000Z", [set(100, 5)], "weighted_reps")], "pullup", { measurements });
    expect(bench.volume).toBe(500);
    expect(bench.maxWeight).toBe(100);
    const [bwReps] = exerciseSeries([pullups("a", "2026-01-10T10:00:00.000Z", [set(undefined, 12)], "bodyweight_reps")], "pullup", { measurements });
    expect(bwReps.volume).toBe(0);
    expect(bwReps.maxWeight).toBeUndefined();
  });
});
