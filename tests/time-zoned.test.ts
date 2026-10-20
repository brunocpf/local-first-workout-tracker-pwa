import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "#lib/time";

describe("utcToZonedLocal", () => {
  it("shows wall-clock time in the given zone", () => {
    expect(utcToZonedLocal("2026-03-10T23:30:00.000Z", "Asia/Tokyo")).toBe("2026-03-11T08:30");
    expect(utcToZonedLocal("2026-03-10T23:30:00.000Z", "America/New_York")).toBe("2026-03-10T19:30");
    expect(utcToZonedLocal("2026-03-10T00:05:00.000Z", "UTC")).toBe("2026-03-10T00:05");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(utcToZonedLocal("2026-03-10T10:00:00.000Z", "Nope/Zone")).toBe("2026-03-10T10:00");
  });
});

describe("zonedLocalToUtc", () => {
  it("inverts utcToZonedLocal for ordinary times", () => {
    expect(zonedLocalToUtc("2026-03-11T08:30", "Asia/Tokyo")).toBe("2026-03-10T23:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T12:00", "Europe/Lisbon")).toBe("2026-07-01T11:00:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("2026-03-11", "UTC")).toBeUndefined();
    expect(zonedLocalToUtc("", "UTC")).toBeUndefined();
  });
  it("round-trips every hour around the spring-forward day (New York, 2026-03-08)", () => {
    for (let h = 0; h < 48; h++) {
      const iso = new Date(Date.UTC(2026, 2, 7, 12) + h * 3_600_000).toISOString();
      const local = utcToZonedLocal(iso, "America/New_York");
      expect(zonedLocalToUtc(local, "America/New_York")).toBe(iso);
    }
  });
  it("round-trips the fall-back day, resolving the repeated hour to the earlier instant (New York, 2026-11-01)", () => {
    expect(zonedLocalToUtc("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    // The second 01:30 (EST) shows the same wall time; the edit field cannot tell them apart.
    expect(utcToZonedLocal("2026-11-01T06:30:00.000Z", "America/New_York")).toBe("2026-11-01T01:30");
    for (const iso of ["2026-11-01T03:30:00.000Z", "2026-11-01T07:30:00.000Z", "2026-11-01T12:00:00.000Z"]) {
      expect(zonedLocalToUtc(utcToZonedLocal(iso, "America/New_York"), "America/New_York")).toBe(iso);
    }
  });
  it("shifts a non-existent time forward by the gap", () => {
    expect(zonedLocalToUtc("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z"); // = 03:30 EDT
  });
  it("handles a half-hour DST zone (Lord Howe)", () => {
    for (const iso of ["2026-04-04T13:00:00.000Z", "2026-04-04T16:00:00.000Z", "2026-10-03T15:45:00.000Z"]) {
      expect(zonedLocalToUtc(utcToZonedLocal(iso, "Australia/Lord_Howe"), "Australia/Lord_Howe")).toBe(iso);
    }
  });
});
