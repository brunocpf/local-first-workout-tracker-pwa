import { describe, expect, it } from "vitest";
import { estimated1RM, exerciseVolume, personalRecords } from "#lib/progress/metrics";
import type { LoggedSet } from "#lib/types";

const T = "2026-01-01T10:00:00.000Z";
const set = (weight: number, reps: number, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  type: "normal",
  weight,
  reps,
  completedAt: T,
  ...over,
});

describe("volume", () => {
  it("sums completed non-warmup weight x reps", () => {
    const planned = set(100, 5, { completedAt: undefined });
    expect(exerciseVolume([set(100, 5), set(100, 5, { type: "warmup" }), planned])).toBe(500);
  });
  it("counts drop and failure sets", () => {
    expect(exerciseVolume([set(50, 10, { type: "drop" }), set(60, 8, { type: "failure" })])).toBe(980);
  });
  it("excludes bodyweight-type exercises until bodyweight is known", () => {
    for (const t of ["bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance"] as const) {
      expect(exerciseVolume([set(20, 8)], t)).toBe(0);
    }
  });
});

describe("estimated1RM", () => {
  it("Epley within 1-12 reps", () => {
    expect(estimated1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimated1RM(100, 12)).toBeCloseTo(140, 5);
  });
  it("1 rep returns the weight itself", () => expect(estimated1RM(140, 1)).toBe(140));
  it("undefined outside range or for no load", () => {
    expect(estimated1RM(100, 13)).toBeUndefined();
    expect(estimated1RM(100, 0)).toBeUndefined();
    expect(estimated1RM(0, 5)).toBeUndefined();
  });
});

describe("personalRecords", () => {
  it("is empty without history", () => {
    expect(personalRecords([])).toEqual({ repPRs: {} });
  });
  it("computes max weight, per-rep bests, e1RM and best session volume; ignores warm-ups and unlogged sets", () => {
    const a = [set(100, 5), set(100, 8), set(60, 5, { type: "warmup" }), set(200, 1, { completedAt: undefined })];
    const b = [set(110, 5), set(90, 8)];
    const pr = personalRecords([a, b]);
    expect(pr.maxWeight).toBe(110);
    expect(pr.repPRs).toEqual({ 5: 110, 8: 100 });
    expect(pr.bestE1RM).toBeCloseTo(110 * (1 + 5 / 30), 5); // 128.33 > 100 x 8 = 126.67
    expect(pr.bestSessionVolume).toBe(100 * 5 + 100 * 8); // 1300 > 110 x 5 + 90 x 8 = 1270
  });
  it("rep PRs only cover 1-12 reps", () => {
    expect(personalRecords([[set(40, 15)]]).repPRs).toEqual({});
    expect(personalRecords([[set(40, 15)]]).maxWeight).toBe(40);
  });
});
