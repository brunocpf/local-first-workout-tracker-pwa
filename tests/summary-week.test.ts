import { describe, expect, it } from "vitest";
import { countSessionsThisWeek } from "#lib/progress/summary";

const s = (startedAt: string, timeZone = "UTC") => ({ startedAt, timeZone });
// Wed 2026-01-14
const now = new Date("2026-01-14T12:00:00Z");

describe("countSessionsThisWeek", () => {
  it("counts only sessions in the current week", () => {
    const list = [s("2026-01-12T08:00:00Z"), s("2026-01-14T08:00:00Z"), s("2026-01-11T08:00:00Z"), s("2026-01-19T08:00:00Z")];
    expect(countSessionsThisWeek(list, now, 1, "UTC")).toBe(2);
  });

  it("respects the week-start setting", () => {
    const sunday = s("2026-01-11T08:00:00Z");
    expect(countSessionsThisWeek([sunday], now, 1, "UTC")).toBe(0);
    expect(countSessionsThisWeek([sunday], now, 0, "UTC")).toBe(1);
    expect(countSessionsThisWeek([s("2026-01-10T08:00:00Z")], now, 6, "UTC")).toBe(1);
  });

  it("uses each session's own time zone for its local date", () => {
    // Sun 23:30 UTC is already Monday in Tokyo; Mon 00:30 UTC is still Sunday in Los Angeles.
    expect(countSessionsThisWeek([s("2026-01-11T23:30:00Z", "Asia/Tokyo")], now, 1, "UTC")).toBe(1);
    expect(countSessionsThisWeek([s("2026-01-12T00:30:00Z", "America/Los_Angeles")], now, 1, "UTC")).toBe(0);
  });

  it("reads now in the given zone", () => {
    const late = new Date("2026-01-11T23:30:00Z"); // Monday in Tokyo
    expect(countSessionsThisWeek([s("2026-01-12T01:00:00Z", "UTC")], late, 1, "Asia/Tokyo")).toBe(1);
    expect(countSessionsThisWeek([s("2026-01-12T01:00:00Z", "UTC")], late, 1, "UTC")).toBe(0);
  });

  it("returns 0 for no sessions", () => {
    expect(countSessionsThisWeek([], now, 1)).toBe(0);
  });
});
