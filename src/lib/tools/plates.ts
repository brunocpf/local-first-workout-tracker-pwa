import { kgToLb } from "#lib/units";
import type { PlateInventory, PlateStock, WeightUnit } from "#lib/types";

export const DEFAULT_BAR_KG = 20;

/** Standard plate sets. Counts are per side and generous, so a default never limits a normal load. */
export const DEFAULT_PLATE_INVENTORY: PlateInventory = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, count: 10 })),
  lb: [45, 35, 25, 10, 5, 2.5].map((weight) => ({ weight, count: 10 })),
};

export type PlateLoad = { weight: number; count: number };

export type PlateResult = {
  /** Plates to load on each side, heaviest first, in the display unit's plate system. */
  perSide: PlateLoad[];
  /** Bar plus plates, in the display unit. At or below the target. */
  achieved: number;
  /** Target minus achieved, in the display unit: 0 when exact, negative when the target is below the bar. */
  remainder: number;
};

/** Plate and bar weights are worked in whole hundredths, so 1.25 and 2.5 steps are exact and float noise can't drop a plate. */
const SCALE = 100;
/** Absorbs float error from kg <-> lb conversion before flooring to hundredths. */
const EPSILON = 1e-6;

const round2 = (x: number) => Math.round(x * 100) / 100 || 0; // `|| 0` turns -0 into 0

/**
 * Plates per side for `targetKg` (the stored weight) shown in `unit`. Uses that unit's plate system and bar
 * weight. Exact when the inventory allows; otherwise the heaviest load not above the target, with the rest as `remainder`.
 */
export function platesPerSide(
  targetKg: number,
  unit: WeightUnit,
  barKg: number,
  inventory: PlateInventory,
): PlateResult {
  const toUnit = (kg: number) => (unit === "lb" ? kgToLb(kg) : kg);
  const target = toUnit(targetKg);
  const bar = toUnit(barKg);
  const { perSide, total } = fillSide((target - bar) / 2, inventory[unit]);
  const achieved = bar + (2 * total) / SCALE;
  return { perSide, achieved: round2(achieved), remainder: round2(target - achieved) };
}

/**
 * Heaviest side load not above `target` (display unit), using the fewest plates for that load. A bounded
 * knapsack over whole hundredths, so limited counts and non-greedy combinations (e.g. 20 + 10 + 10 over 25 + 10)
 * are handled. Cost is roughly sizes × counts × target, which is tiny for real plate sets.
 */
function fillSide(target: number, stock: PlateStock[]) {
  const limit = Math.max(0, Math.floor(target * SCALE + EPSILON));
  // best[s] = fewest plates that sum to exactly s hundredths; Infinity when unreachable.
  let best = new Float64Array(limit + 1).fill(Infinity);
  best[0] = 0;
  const stages: { weight: number; step: number; take: Int32Array }[] = [];
  for (const { weight, count } of stock) {
    const step = Math.round(weight * SCALE);
    if (step <= 0 || count <= 0) continue;
    const next = Float64Array.from(best);
    const take = new Int32Array(limit + 1);
    for (let s = step; s <= limit; s++) {
      for (let k = 1; k <= count && k * step <= s; k++) {
        const plates = best[s - k * step] + k;
        if (plates < next[s]) {
          next[s] = plates;
          take[s] = k;
        }
      }
    }
    best = next;
    stages.push({ weight, step, take });
  }

  let total = limit;
  while (best[total] === Infinity) total--;

  const perSide: PlateLoad[] = [];
  let rest = total;
  for (let i = stages.length - 1; i >= 0; i--) {
    const { weight, step, take } = stages[i];
    const k = take[rest];
    if (k > 0) {
      perSide.push({ weight, count: k });
      rest -= k * step;
    }
  }
  perSide.sort((a, b) => b.weight - a.weight);
  return { perSide, total };
}
