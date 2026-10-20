import type { WeightUnit } from "#lib/types";

const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Value typed by the user in their unit -> kg for storage (full precision, no rounding). */
export const toKg = (value: number, unit: WeightUnit) => (unit === "lb" ? lbToKg(value) : value);

/**
 * Stored kg -> number to show, rounded to 2 decimals (PRD §10.3): any value typed with up to 2 decimals
 * shows again exactly, and conversion noise never leaks (225 lb -> 102.0582... kg -> 225).
 * Only for display; never write the result back.
 */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return Math.round((unit === "lb" ? kgToLb(kg) : kg) * 100) / 100;
}
