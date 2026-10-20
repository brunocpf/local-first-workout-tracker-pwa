import { describe, expect, it } from "vitest";
import { dateToMs, linearScale, msToDate, niceTicks, timeScale, timeTicks } from "#lib/charts/scale";

describe("linearScale", () => {
  it("maps domain ends to range ends", () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
    expect(s(2.5)).toBe(75);
  });
  it("maps a zero-width domain to the midpoint", () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe("timeScale", () => {
  it("is linear in days", () => {
    const s = timeScale(["2026-01-01", "2026-01-11"], [0, 100]);
    expect(s("2026-01-01")).toBe(0);
    expect(s("2026-01-06")).toBe(50);
    expect(s("2026-01-11")).toBe(100);
  });
  it("is unaffected by DST changes", () => {
    const s = timeScale(["2026-03-01", "2026-04-01"], [0, 31]);
    expect(s("2026-03-30")).toBe(29);
  });
  it("round-trips dates", () => {
    expect(msToDate(dateToMs("2026-02-28"))).toBe("2026-02-28");
  });
});

describe("niceTicks", () => {
  it("covers the extent with round steps", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(97, 112.5, 5)).toEqual([95, 100, 105, 110, 115]);
  });
  it("handles fractions without float noise", () => {
    expect(niceTicks(0, 1, 6)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it("pads a flat extent", () => {
    const t = niceTicks(100, 100);
    expect(t[0]).toBeLessThan(100);
    expect(t.at(-1)).toBeGreaterThan(100);
  });
  it("handles zero, negatives, swapped and invalid input", () => {
    expect(niceTicks(0, 0).length).toBeGreaterThan(1);
    expect(niceTicks(-10, 10, 5)).toEqual([-10, -5, 0, 5, 10]);
    expect(niceTicks(10, -10, 5)).toEqual([-10, -5, 0, 5, 10]);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
});

describe("timeTicks", () => {
  it("includes both ends, evenly spaced", () => {
    expect(timeTicks("2026-01-01", "2026-01-31", 4)).toEqual(["2026-01-01", "2026-01-11", "2026-01-21", "2026-01-31"]);
  });
  it("never exceeds the number of days", () => {
    expect(timeTicks("2026-01-01", "2026-01-03", 5)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
  it("returns one tick for a single day", () => {
    expect(timeTicks("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });
});
