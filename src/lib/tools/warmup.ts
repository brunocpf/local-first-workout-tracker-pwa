import { newId } from "#lib/ids";
import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY, platesPerSide } from "#lib/tools/plates";
import { toKg } from "#lib/units";
import type { PlateInventory, SessionExercise, WarmupStep, WeightUnit, LoggedSet } from "#lib/types";

/** Empty bar × 10, then 40 / 60 / 80 % of the working weight. */
export const DEFAULT_WARMUP_SCHEME: WarmupStep[] = [
  { percent: 0, reps: 10 },
  { percent: 40, reps: 5 },
  { percent: 60, reps: 3 },
  { percent: 80, reps: 2 },
];

export type WarmupSet = { weight: number; reps: number };

type Loadout = { unit?: WeightUnit; barKg?: number; inventory?: PlateInventory };

/**
 * Warm-up sets (weight in kg) leading up to `workingWeightKg`, each rounded down to a weight the plates can make.
 * Steps that land at or above the working weight, below the bar, or on the previous step's weight are dropped.
 */
export function warmupSets(
  workingWeightKg: number,
  scheme: readonly WarmupStep[] = DEFAULT_WARMUP_SCHEME,
  { unit = "kg", barKg = DEFAULT_BAR_KG, inventory = DEFAULT_PLATE_INVENTORY }: Loadout = {},
): WarmupSet[] {
  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0) return [];
  const out: WarmupSet[] = [];
  for (const { percent, reps } of scheme) {
    const target = percent <= 0 ? barKg : (workingWeightKg * percent) / 100;
    if (target < barKg) continue;
    const { achieved } = platesPerSide(target, unit, barKg, inventory);
    const weight = Math.round(toKg(achieved, unit) * 1000) / 1000;
    if (weight >= workingWeightKg || weight === out.at(-1)?.weight) continue;
    out.push({ weight, reps });
  }
  return out;
}

/** The weight warm-ups build towards: the first working (non-warm-up) set that has one. */
export function workingWeight(sets: readonly LoggedSet[]): number | undefined {
  return sets.find((s) => s.type !== "warmup" && s.weight !== undefined && s.weight > 0)?.weight;
}

/** Inserts uncompleted warm-up sets before the first non-warm-up set (after any existing warm-ups). */
export function insertWarmups(se: SessionExercise, sets: readonly WarmupSet[]): LoggedSet[] {
  const created: LoggedSet[] = sets.map((s) => ({ id: newId(), type: "warmup", weight: s.weight, reps: s.reps }));
  const at = se.sets.findIndex((s) => s.type !== "warmup");
  se.sets.splice(at === -1 ? se.sets.length : at, 0, ...created);
  return created;
}

/** "bar x 10, 40 x 5": `bar` or 0 is the empty bar, other steps are a percent of the working weight. */
export function formatScheme(scheme: readonly WarmupStep[]): string {
  return scheme.map((s) => `${s.percent <= 0 ? "bar" : s.percent} x ${s.reps}`).join(", ");
}

export function parseScheme(text: string): WarmupStep[] | undefined {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 10) return undefined;
  const steps: WarmupStep[] = [];
  for (const part of parts) {
    const m = /^(bar|\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+)$/i.exec(part);
    if (!m) return undefined;
    const percent = m[1].toLowerCase() === "bar" ? 0 : Number(m[1]);
    const reps = Number(m[2]);
    if (percent > 100 || reps < 1 || reps > 100) return undefined;
    steps.push({ percent, reps });
  }
  return steps;
}
