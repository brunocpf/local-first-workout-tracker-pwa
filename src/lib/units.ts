import type { WeightUnit } from "#lib/types";

const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Value typed by the user in their unit -> kg for storage (full precision, no rounding). */
export const toKg = (value: number, unit: WeightUnit) => (unit === "lb" ? lbToKg(value) : value);

/**
 * Stored kg -> number to show. Rounded to 0.1 lb / 0.05 kg so conversion noise never
 * leaks (225 lb -> 102.0582... kg -> 225). Only for display; never write the result back.
 */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 20) / 20;
}
