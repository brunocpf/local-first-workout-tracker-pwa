import { displayWeight, lbToKg } from "#lib/units";
import type { LoggedSet, UserSettings, WeightUnit } from "#lib/types";

/** Load added when every working set reaches the top of the rep range, in each unit's own system. */
export const DEFAULT_PROGRESSION_INCREMENT: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };

export type ProgressionSuggestion = {
  weightKg: number;
  reps: number;
  /** Human-readable (English) explanation of the rule that produced the suggestion. */
  reason: string;
  /** The same explanation as data, for rendering in the app language. */
  why: ProgressionWhy;
};

export type ProgressionWhy =
  | { kind: "increase"; sets: number; high: number; low: number; weightKg: number; incrementKg: number }
  | { kind: "stay"; high: number; lowest: number; weightKg: number; reps: number }
  | { kind: "mixed"; weightKg: number; reps: number };

type ProgressionSettings = Pick<UserSettings, "weightUnit" | "progressionEnabled" | "progressionIncrement">;

/** Weights within this many kg count as the same load (guards unit-conversion noise). */
const SAME_WEIGHT_KG = 0.01;

const label = (kg: number, unit: WeightUnit) => `${displayWeight(kg, unit)} ${unit}`;

/**
 * Double progression (PRD §17). Looks at the completed working sets (warm-up and drop sets excluded) of the
 * last session of an exercise: if all of them hit the top of the rep range at the same weight, suggest
 * adding the increment and starting again at the bottom of the range; otherwise keep the (heaviest) weight and
 * aim for one more rep than the weakest set, up to the top of the range. Missing weights count as 0.
 *
 * Returns `null` when progression is off or there is nothing to base a suggestion on. It only suggests:
 * nothing is applied automatically.
 */
export function suggestProgression(
  lastSessionSets: readonly LoggedSet[],
  prescription: { repRange?: readonly [number, number] },
  settings: ProgressionSettings,
): ProgressionSuggestion | null {
  if (!settings.progressionEnabled || !prescription.repRange) return null;
  const [low, high] = prescription.repRange;
  const sets = lastSessionSets.filter(
    (s) => s.completedAt && s.type !== "warmup" && s.type !== "drop" && s.reps !== undefined && s.reps > 0,
  );
  if (sets.length === 0) return null;

  const unit = settings.weightUnit;
  const increment = settings.progressionIncrement ?? DEFAULT_PROGRESSION_INCREMENT;
  const incrementKg = unit === "lb" ? lbToKg(increment.lb) : increment.kg;

  const weights = sets.map((s) => s.weight ?? 0);
  const topWeight = Math.max(...weights);
  const sameWeight = weights.every((w) => topWeight - w <= SAME_WEIGHT_KG);

  if (sameWeight && sets.every((s) => (s.reps ?? 0) >= high)) {
    return {
      weightKg: topWeight + incrementKg,
      reps: low,
      reason: `All ${sets.length} working set${sets.length === 1 ? "" : "s"} reached ${high} reps at ${label(topWeight, unit)}, so add ${label(incrementKg, unit)} (to ${label(topWeight + incrementKg, unit)}) and aim for ${low} reps.`,
      why: { kind: "increase", sets: sets.length, high, low, weightKg: topWeight, incrementKg },
    };
  }

  const atTop = sets.filter((s) => topWeight - (s.weight ?? 0) <= SAME_WEIGHT_KG);
  const weakest = Math.min(...atTop.map((s) => s.reps ?? 0));
  const reps = Math.min(high, weakest + 1);
  const reason = sameWeight
    ? `Not every working set reached ${high} reps yet (lowest: ${weakest}), so stay at ${label(topWeight, unit)} and aim for ${reps} reps.`
    : `Working sets used different weights, so stay at the heaviest, ${label(topWeight, unit)}, and aim for ${reps} reps.`;
  const why: ProgressionWhy = sameWeight ? { kind: "stay", high, lowest: weakest, weightKg: topWeight, reps } : { kind: "mixed", weightKg: topWeight, reps };
  return { weightKg: topWeight, reps, reason, why };
}
