import { describe, expect, it } from "vitest";
import { settingsSchema } from "#lib/backup/format";
import { lbToKg } from "#lib/units";
import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY, platesPerSide } from "#lib/tools/plates";
import { DEFAULT_SETTINGS } from "#lib/storage/settings";
import type { PlateInventory } from "#lib/types";

const kgBar = DEFAULT_BAR_KG;
const lbBar = lbToKg(45);

describe("platesPerSide (kg)", () => {
  it("loads the exact plates when the target is reachable", () => {
    // 62.5 kg with a 20 kg bar: 21.25 kg per side = 20 + 1.25 (the only two-plate way).
    const r = platesPerSide(62.5, "kg", kgBar, DEFAULT_PLATE_INVENTORY);
    expect(r.perSide).toEqual([
      { weight: 20, count: 1 },
      { weight: 1.25, count: 1 },
    ]);
    expect(r.achieved).toBe(62.5);
    expect(r.remainder).toBe(0);
  });

  it("returns the bar alone for a target equal to the bar", () => {
    expect(platesPerSide(20, "kg", kgBar, DEFAULT_PLATE_INVENTORY)).toEqual({
      perSide: [],
      achieved: 20,
      remainder: 0,
    });
  });

  it("rounds down to the nearest achievable weight and states the remainder", () => {
    // 101 kg: 40.5 kg per side is not a multiple of 1.25, so 40 kg per side (100 kg) is the nearest lower load.
    const r = platesPerSide(101, "kg", kgBar, DEFAULT_PLATE_INVENTORY);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(1);
    expect(r.perSide.reduce((sum, p) => sum + p.weight * p.count, 0)).toBe(40);
  });

  it("finds an exact load that a greedy fill would miss when counts are limited", () => {
    // 40 kg per side. Greedy takes 25 then 10 and gets stuck at 35. 20 + 10 + 10 is exact.
    const inventory: PlateInventory = {
      kg: [
        { weight: 25, count: 1 },
        { weight: 20, count: 1 },
        { weight: 10, count: 2 },
      ],
      lb: [],
    };
    const r = platesPerSide(100, "kg", kgBar, inventory);
    expect(r.perSide).toEqual([
      { weight: 20, count: 1 },
      { weight: 10, count: 2 },
    ]);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(0);
  });

  it("reports a negative remainder when the target is below the bar", () => {
    const r = platesPerSide(15, "kg", kgBar, DEFAULT_PLATE_INVENTORY);
    expect(r).toEqual({ perSide: [], achieved: 20, remainder: -5 });
  });

  it("uses only the kg plates when the unit is kg", () => {
    const inventory: PlateInventory = { kg: [{ weight: 10, count: 10 }], lb: [{ weight: 45, count: 10 }] };
    const r = platesPerSide(40, "kg", 0, inventory);
    expect(r.perSide).toEqual([{ weight: 10, count: 2 }]);
    expect(r.achieved).toBe(40);
  });
});

describe("platesPerSide (lb)", () => {
  it("loads lb plates for a 135 lb target on a 45 lb bar", () => {
    const r = platesPerSide(lbToKg(135), "lb", lbBar, DEFAULT_PLATE_INVENTORY);
    expect(r.perSide).toEqual([{ weight: 45, count: 1 }]);
    expect(r.achieved).toBe(135);
    expect(r.remainder).toBe(0);
  });

  it("uses two 45 lb plates per side for 225 lb", () => {
    const r = platesPerSide(lbToKg(225), "lb", lbBar, DEFAULT_PLATE_INVENTORY);
    expect(r.perSide).toEqual([{ weight: 45, count: 2 }]);
    expect(r.achieved).toBe(225);
    expect(r.remainder).toBe(0);
  });

  it("states the remainder when 2.5 lb steps cannot reach the target", () => {
    // 137.5 lb: 46.25 lb per side. Nearest lower with lb plates is 45 per side (135 lb total), 2.5 lb short.
    const r = platesPerSide(lbToKg(137.5), "lb", lbBar, DEFAULT_PLATE_INVENTORY);
    expect(r.perSide).toEqual([{ weight: 45, count: 1 }]);
    expect(r.achieved).toBe(135);
    expect(r.remainder).toBe(2.5);
  });
});

describe("plate settings", () => {
  it("defaults to a 20 kg bar and the standard plate sets", () => {
    expect(DEFAULT_SETTINGS.barWeightKg).toBe(20);
    expect(DEFAULT_SETTINGS.plateInventory).toEqual(DEFAULT_PLATE_INVENTORY);
  });

  it("keeps the bar and plate inventory through the backup settings schema", () => {
    const parsed = settingsSchema.parse({ ...DEFAULT_SETTINGS, barWeightKg: 20.41, plateInventory: DEFAULT_PLATE_INVENTORY });
    expect(parsed.barWeightKg).toBe(20.41);
    expect(parsed.plateInventory).toEqual(DEFAULT_PLATE_INVENTORY);
  });

  it("rejects a plate with a non-positive weight", () => {
    const bad = { ...DEFAULT_SETTINGS, plateInventory: { kg: [{ weight: 0, count: 1 }], lb: [] } };
    expect(settingsSchema.safeParse(bad).success).toBe(false);
  });
});
