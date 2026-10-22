import { describe, expect, it } from "vitest";
import { settingsSchema } from "#lib/backup/format";
import { DEFAULT_PROGRESSION_INCREMENT, suggestProgression } from "#lib/progress/progression";
import { DEFAULT_SETTINGS } from "#lib/storage/settings";
import { lbToKg } from "#lib/units";
import type { LoggedSet, SetType } from "#lib/types";

const on = { weightUnit: "kg" as const, progressionEnabled: true, progressionIncrement: DEFAULT_PROGRESSION_INCREMENT };
const range = { repRange: [6, 8] as [number, number] };

let n = 0;
const set = (weight: number | undefined, reps: number, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `s${++n}`,
  type: "normal" as SetType,
  weight,
  reps,
  completedAt: "2026-03-01T10:00:00.000Z",
  ...over,
});

describe("suggestProgression", () => {
  it("adds the increment and returns to the bottom of the range when every working set hit the top", () => {
    const r = suggestProgression([set(60, 8), set(60, 8), set(60, 8)], range, on);
    expect(r).toMatchObject({ weightKg: 62.5, reps: 6 });
    expect(r?.reason).toContain("62.5");
    expect(r?.reason).toContain("60 kg");
  });

  it("keeps the weight and aims for one more rep than the weakest set otherwise", () => {
    const r = suggestProgression([set(60, 8), set(60, 7), set(60, 6)], range, on);
    expect(r).toMatchObject({ weightKg: 60, reps: 7 });
    expect(r?.reason).toMatch(/lowest: 6/);
  });

  it("never aims above the top of the range", () => {
    expect(suggestProgression([set(60, 8), set(60, 8), set(60, 7)], range, on)?.reps).toBe(8);
  });

  it("does not progress when sets used different weights, even if all reached the top", () => {
    const r = suggestProgression([set(60, 8), set(57.5, 8)], range, on);
    expect(r?.weightKg).toBe(60);
    expect(r?.reps).toBe(8);
    expect(r?.reason).toMatch(/different weights/);
  });

  it("ignores warm-up, drop and incomplete sets", () => {
    const sets = [
      set(30, 12, { type: "warmup" }),
      set(60, 8),
      set(60, 8),
      set(40, 12, { type: "drop" }),
      set(60, 3, { completedAt: undefined }),
    ];
    expect(suggestProgression(sets, range, on)).toMatchObject({ weightKg: 62.5, reps: 6 });
  });

  it("uses the lb increment (5 lb) in kg and shows the reason in lb", () => {
    const sets = [set(lbToKg(135), 8), set(lbToKg(135), 8)];
    const r = suggestProgression(sets, range, { ...on, weightUnit: "lb" });
    expect(r?.weightKg).toBeCloseTo(lbToKg(140), 10);
    expect(r?.reason).toContain("140 lb");
  });

  it("honours a custom increment", () => {
    const r = suggestProgression([set(100, 8)], range, { ...on, progressionIncrement: { kg: 5, lb: 10 } });
    expect(r?.weightKg).toBe(105);
  });

  it("treats a missing weight as 0 (bodyweight)", () => {
    expect(suggestProgression([set(undefined, 7)], range, on)).toMatchObject({ weightKg: 0, reps: 8 });
  });

  it("returns null when disabled, without a rep range, or without working sets", () => {
    expect(suggestProgression([set(60, 8)], range, { ...on, progressionEnabled: false })).toBeNull();
    expect(suggestProgression([set(60, 8)], {}, on)).toBeNull();
    expect(suggestProgression([set(30, 10, { type: "warmup" })], range, on)).toBeNull();
    expect(suggestProgression([], range, on)).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const sets = [set(60, 8)];
    const before = JSON.stringify(sets);
    suggestProgression(sets, range, on);
    expect(JSON.stringify(sets)).toBe(before);
  });
});

describe("progression settings", () => {
  it("are off by default with 2.5 kg / 5 lb increments", () => {
    expect(DEFAULT_SETTINGS.progressionEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.progressionIncrement).toEqual({ kg: 2.5, lb: 5 });
  });

  it("are optional in the backup schema, so older backups still validate", () => {
    const { progressionEnabled: _a, progressionIncrement: _b, ...old } = DEFAULT_SETTINGS;
    expect(settingsSchema.safeParse(old).success).toBe(true);
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, progressionIncrement: { kg: 0, lb: 5 } }).success).toBe(false);
  });
});
