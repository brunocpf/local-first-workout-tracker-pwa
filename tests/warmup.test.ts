import { describe, expect, it } from "vitest";
import { settingsSchema } from "#lib/backup/format";
import { DEFAULT_SETTINGS } from "#lib/storage/settings";
import { DEFAULT_WARMUP_SCHEME, formatScheme, insertWarmups, parseScheme, warmupSets, workingWeight } from "#lib/tools/warmup";
import { lbToKg } from "#lib/units";
import type { LoggedSet, SessionExercise } from "#lib/types";

describe("warmupSets", () => {
  it("builds the default ramp rounded to loadable weights", () => {
    // 100 kg: bar, 40 -> 40, 60 -> 60, 80 -> 80 (all loadable with 1.25 steps)
    expect(warmupSets(100)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });

  it("rounds down to what the plates can make", () => {
    // 42.5 kg x 40 % = 17 -> below the bar, skipped; 60 % = 25.5 -> 25
    const sets = warmupSets(42.5);
    expect(sets.map((s) => s.weight)).toEqual([20, 25, 32.5]);
  });

  it("drops steps at or above the working weight and duplicates", () => {
    expect(warmupSets(20)).toEqual([]);
    expect(warmupSets(25).map((s) => s.weight)).toEqual([20]);
  });

  it("returns nothing without a usable working weight", () => {
    expect(warmupSets(0)).toEqual([]);
    expect(warmupSets(NaN)).toEqual([]);
  });

  it("works in the lb plate system and returns kg", () => {
    const sets = warmupSets(lbToKg(225), DEFAULT_WARMUP_SCHEME, { unit: "lb", barKg: lbToKg(45) });
    expect(sets.map((s) => Math.round((s.weight / lbToKg(1)) * 100) / 100)).toEqual([45, 90, 135, 180]);
  });
});

const set = (over: Partial<LoggedSet>): LoggedSet => ({ id: Math.random().toString(), type: "normal", ...over });
const exercise = (sets: LoggedSet[]): SessionExercise => ({
  id: "e",
  exerciseId: "x",
  exerciseNameSnapshot: "Squat",
  exerciseTypeSnapshot: "weighted_reps",
  sets,
});

describe("insertWarmups / workingWeight", () => {
  it("finds the first working weight, ignoring warm-ups", () => {
    expect(workingWeight([set({ type: "warmup", weight: 20 }), set({}), set({ weight: 100 })])).toBe(100);
  });

  it("inserts uncompleted warmup sets before the working sets", () => {
    const e = exercise([set({ id: "w", type: "warmup", weight: 20 }), set({ id: "a", weight: 100 })]);
    const added = insertWarmups(e, [{ weight: 60, reps: 3 }]);
    expect(e.sets.map((s) => s.id)).toEqual(["w", added[0].id, "a"]);
    expect(added[0]).toMatchObject({ type: "warmup", weight: 60, reps: 3 });
    expect(added[0].completedAt).toBeUndefined();
  });
});

describe("scheme text and settings", () => {
  it("round-trips the default scheme", () => {
    expect(formatScheme(DEFAULT_WARMUP_SCHEME)).toBe("bar x 10, 40 x 5, 60 x 3, 80 x 2");
    expect(parseScheme(formatScheme(DEFAULT_WARMUP_SCHEME))).toEqual(DEFAULT_WARMUP_SCHEME);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "40", "40 x", "150 x 5", "40 x 0", "abc"]) expect(parseScheme(bad)).toBeUndefined();
  });

  it("validates the scheme in backups", () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, warmupScheme: DEFAULT_WARMUP_SCHEME }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, warmupScheme: [{ percent: 500, reps: 1 }] }).success).toBe(false);
  });
});
