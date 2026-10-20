import { describe, expect, it } from "vitest";
import { monthGrid, monthQueryRange, sessionsByLocalDate, shiftMonth } from "#lib/progress/calendar";
import type { WorkoutSession } from "#lib/types";

const session = (over: Partial<WorkoutSession> & Pick<WorkoutSession, "id" | "startedAt">): WorkoutSession => ({
  name: "Workout",
  status: "completed",
  endedAt: over.startedAt,
  timeZone: "UTC",
  exercises: [],
  exerciseIds: [],
  createdAt: over.startedAt,
  updatedAt: over.startedAt,
  ...over,
});

describe("monthGrid", () => {
  it("pads October 2026 (starts Thursday) to Monday-first weeks", () => {
    const g = monthGrid(2026, 10, 1);
    expect(g).toHaveLength(5);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toEqual({ date: "2026-09-28", inMonth: false });
    expect(g[0][3]).toEqual({ date: "2026-10-01", inMonth: true });
    expect(g[4][6]).toEqual({ date: "2026-11-01", inMonth: false });
  });

  it("honours Sunday and Saturday week starts", () => {
    expect(monthGrid(2026, 10, 0)[0][0].date).toBe("2026-09-27");
    expect(monthGrid(2026, 10, 6)[0][0].date).toBe("2026-09-26");
  });

  it("has no leading padding when the 1st is the first weekday", () => {
    const g = monthGrid(2026, 6, 1); // 1 June 2026 is a Monday
    expect(g[0][0]).toEqual({ date: "2026-06-01", inMonth: true });
  });

  it("fits a 28-day month starting on the week start into 4 weeks", () => {
    const g = monthGrid(2027, 2, 1); // 1 Feb 2027 is a Monday
    expect(g).toHaveLength(4);
    expect(g.flat().every((d) => d.inMonth)).toBe(true);
  });

  it("needs 6 weeks when a long month starts late in the week", () => {
    expect(monthGrid(2026, 8, 1)).toHaveLength(6); // 1 Aug 2026 is a Saturday
  });

  it("counts every day of the month exactly once, including leap February", () => {
    const days = monthGrid(2028, 2, 1).flat().filter((d) => d.inMonth);
    expect(days.map((d) => d.date)).toEqual(Array.from({ length: 29 }, (_, i) => `2028-02-${String(i + 1).padStart(2, "0")}`));
  });

  it("crosses year boundaries", () => {
    const g = monthGrid(2026, 1, 1);
    expect(g[0][0].date).toBe("2025-12-29");
    expect(monthGrid(2026, 12, 1).at(-1)?.at(-1)?.date).toBe("2027-01-03");
  });
});

describe("sessionsByLocalDate", () => {
  it("groups by the session's own local day, not UTC and not the device zone", () => {
    const a = session({ id: "a", startedAt: "2026-10-14T23:30:00.000Z", timeZone: "Asia/Tokyo" }); // 15 Oct 08:30 in Tokyo
    const b = session({ id: "b", startedAt: "2026-10-14T02:00:00.000Z", timeZone: "America/Los_Angeles" }); // 13 Oct 19:00 in LA
    const m = sessionsByLocalDate([a, b]);
    expect(m.get("2026-10-15")?.map((s) => s.id)).toEqual(["a"]);
    expect(m.get("2026-10-13")?.map((s) => s.id)).toEqual(["b"]);
    expect(m.has("2026-10-14")).toBe(false);
  });

  it("keeps several sessions on one day, oldest first", () => {
    const late = session({ id: "late", startedAt: "2026-10-14T18:00:00.000Z" });
    const early = session({ id: "early", startedAt: "2026-10-14T07:00:00.000Z" });
    expect(sessionsByLocalDate([late, early]).get("2026-10-14")?.map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("ignores active sessions", () => {
    const active = session({ id: "x", startedAt: "2026-10-14T07:00:00.000Z", status: "active", endedAt: undefined });
    expect(sessionsByLocalDate([active]).size).toBe(0);
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    const s = session({ id: "u", startedAt: "2026-10-14T07:00:00.000Z", timeZone: "Not/AZone" });
    expect(sessionsByLocalDate([s]).get("2026-10-14")).toHaveLength(1);
  });
});

describe("shiftMonth / monthQueryRange", () => {
  it("wraps across years", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("pads the query window by a day each side so every zone's local days are covered", () => {
    expect(monthQueryRange(2026, 10)).toEqual({ from: "2026-09-30T00:00:00.000Z", to: "2026-11-02T00:00:00.000Z" });
    const edge = session({ id: "e", startedAt: "2026-09-30T14:30:00.000Z", timeZone: "Pacific/Kiritimati" }); // 1 Oct local
    const { from, to } = monthQueryRange(2026, 10);
    expect(edge.startedAt >= from && edge.startedAt < to).toBe(true);
  });
});
