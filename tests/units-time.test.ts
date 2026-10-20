import { describe, expect, it } from "vitest";
import { displayWeight, kgToLb, lbToKg, toKg } from "#lib/units";
import { localDate, localWeekStart } from "#lib/time";

describe("units", () => {
  it("converts both ways", () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 6);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });
  it("lb entered -> stored kg -> displayed lb round-trips for common values", () => {
    for (let lb = 2.5; lb <= 1000; lb += 2.5) {
      expect(displayWeight(toKg(lb, "lb"), "lb")).toBe(lb);
    }
    expect(displayWeight(toKg(225, "lb"), "lb")).toBe(225);
    expect(displayWeight(toKg(222.2, "lb"), "lb")).toBe(222.2);
  });
  it("kg entered round-trips and rounds to 0.05", () => {
    for (let kg = 1.25; kg <= 500; kg += 1.25) expect(displayWeight(toKg(kg, "kg"), "kg")).toBe(kg);
    expect(displayWeight(100.012, "kg")).toBe(100);
    expect(displayWeight(100.03, "kg")).toBe(100.05);
  });
  it("stores kg input untouched", () => expect(toKg(82.5, "kg")).toBe(82.5));
});

describe("localDate", () => {
  it("uses the session's zone, not UTC", () => {
    // 2026-03-10 23:30 UTC is already 03-11 in Tokyo and still 03-10 in New York.
    const startedAt = "2026-03-10T23:30:00.000Z";
    expect(localDate({ startedAt, timeZone: "UTC" })).toBe("2026-03-10");
    expect(localDate({ startedAt, timeZone: "Asia/Tokyo" })).toBe("2026-03-11");
    expect(localDate({ startedAt, timeZone: "America/New_York" })).toBe("2026-03-10");
  });
  it("late evening in a western zone stays on the local day even though UTC rolled over", () => {
    // 22:30 local on 03-10 in Los Angeles (UTC-7, DST) = 05:30 UTC on 03-11.
    expect(localDate({ startedAt: "2026-03-11T05:30:00.000Z", timeZone: "America/Los_Angeles" })).toBe("2026-03-10");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(localDate({ startedAt: "2026-03-10T23:30:00.000Z", timeZone: "Not/AZone" })).toBe("2026-03-10");
  });
  it("week start honours the setting", () => {
    const s = { startedAt: "2026-03-11T12:00:00.000Z", timeZone: "UTC" }; // Wednesday
    expect(localWeekStart(s, 1)).toBe("2026-03-09");
    expect(localWeekStart(s, 0)).toBe("2026-03-08");
    expect(localWeekStart({ ...s, startedAt: "2026-03-09T12:00:00.000Z" }, 1)).toBe("2026-03-09"); // Monday itself
    expect(localWeekStart({ ...s, startedAt: "2026-03-08T12:00:00.000Z" }, 1)).toBe("2026-03-02"); // Sunday belongs to prior Mon-week
  });
});
