import { describe, expect, it } from "vitest";
import { estimated1RM, exerciseVolume, remainingSeconds } from "../src/progress/metrics";

const set = (weight: number, reps: number, over = {}) => ({ id: "s", type: "normal" as const, weight, reps, completed: true, ...over });

describe("metrics", () => {
  it("sums completed non-warmup volume", () => {
    expect(exerciseVolume([set(100, 5), set(100, 5, { type: "warmup" }), set(100, 5, { completed: false })])).toBe(500);
  });
  it("Epley 1RM within range only", () => {
    expect(estimated1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimated1RM(100, 20)).toBeUndefined();
  });
  it("timer remaining is timestamp based", () => {
    expect(remainingSeconds(10_500, 10_000)).toBe(1);
    expect(remainingSeconds(9_000, 10_000)).toBe(0);
  });
});
