import { describe, expect, it } from "vitest";
import { prsBefore, prTimeline, type PrSession } from "#lib/progress/metrics";
import type { LoggedSet } from "#lib/types";

const set = (
  weight: number,
  reps: number,
  over: Partial<LoggedSet> = {},
): LoggedSet => ({
  id: `${weight}x${reps}`,
  type: "normal",
  weight,
  reps,
  completedAt: "2026-01-01T10:00:00.000Z",
  ...over,
});
const day = (n: number, ...sets: LoggedSet[]): PrSession => ({
  startedAt: `2026-01-0${n}T09:00:00.000Z`,
  sets,
});
const kinds = (r: ReturnType<typeof prTimeline>[number]) =>
  r.prs.map((p) => p.kind + (p.reps ?? ""));

describe("prTimeline", () => {
  it("flags nothing in the first session", () => {
    expect(prTimeline([day(1, set(100, 5))])[0]!.prs).toEqual([]);
  });

  it("flags strict improvements with the achieving set", () => {
    const r = prTimeline([
      day(1, set(100, 5)),
      day(2, set(105, 5), set(90, 5)),
    ]);
    expect(kinds(r[1]!)).toEqual([
      "maxWeight",
      "repMax5",
      "e1rm",
      "sessionVolume",
    ]);
    expect(r[1]!.prs[0]!.set?.weight).toBe(105);
    expect(r[1]!.prs.at(-1)!.set).toBeUndefined();
  });

  it("does not count ties", () => {
    const r = prTimeline([day(1, set(100, 5)), day(2, set(100, 5))]);
    expect(r[1]!.prs).toEqual([]);
  });

  it("excludes warm-ups and incomplete sets", () => {
    const r = prTimeline([
      day(1, set(100, 5)),
      day(
        2,
        set(200, 5, { type: "warmup" }),
        set(200, 5, { completedAt: undefined }),
      ),
    ]);
    expect(r[1]!.prs).toEqual([]);
  });

  it("does not treat a warm-up-only first session as history", () => {
    const r = prTimeline([
      day(1, set(50, 5, { type: "warmup" })),
      day(2, set(100, 5)),
    ]);
    expect(r[1]!.prs).toEqual([]);
  });

  it("flags a rep count never done before, but not a lower weight at a known one", () => {
    const r = prTimeline([day(1, set(100, 5)), day(2, set(80, 8), set(95, 5))]);
    expect(kinds(r[1]!)).toEqual(["repMax8", "sessionVolume"]);
  });

  it("compares against earlier sessions, not earlier sets of the same session", () => {
    const r = prTimeline([
      day(1, set(100, 5)),
      day(2, set(110, 5), set(120, 5)),
    ]);
    const max = r[1]!.prs.find((p) => p.kind === "maxWeight")!;
    expect(max.value).toBe(120);
    expect(r[1]!.prs.filter((p) => p.kind === "repMax")).toHaveLength(1);
  });

  it("is a pure recomputation: removing a session changes later results", () => {
    const s = [day(1, set(100, 5)), day(2, set(110, 5)), day(3, set(105, 5))];
    expect(prTimeline(s)[2]!.prs.some((p) => p.kind === "maxWeight")).toBe(
      false,
    );
    expect(
      prTimeline([s[0]!, s[2]!])[1]!.prs.some((p) => p.kind === "maxWeight"),
    ).toBe(true);
  });
});

describe("prsBefore", () => {
  it("uses only sessions started strictly before the cutoff", () => {
    const s = [day(1, set(100, 5)), day(2, set(120, 3)), day(3, set(140, 1))];
    expect(prsBefore(s, "2026-01-03T09:00:00.000Z").maxWeight).toBe(120);
    expect(prsBefore(s, "2026-01-01T09:00:00.000Z")).toEqual({ repPRs: {} });
  });
});
