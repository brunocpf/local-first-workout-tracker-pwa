import { z } from "zod";
import { isValidTimeZone } from "#lib/time";
import { MEASUREMENT_KINDS, MEASUREMENT_MAX, type LengthUnit, type MeasurementKind, type WeightUnit } from "#lib/types";
import { displayLength, displayWeight, toCm, toKg } from "#lib/units";

/**
 * The single definition of a valid body measurement: `addMeasurement` (storage/measurements.ts) validates new rows with
 * it and the backup format (backup/format.ts) validates backed-up ones, so a stored row can always be exported and
 * restored. `measuredAt` must be the canonical `toISOString()` form (`z.iso.datetime()` alone also accepts no-millisecond
 * and offset forms, which break text order = time order in the `measuredAt` indexes).
 */
export const measurementSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(MEASUREMENT_KINDS),
    value: z.number().finite().positive(),
    measuredAt: z
      .iso.datetime()
      .max(40)
      .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString() === s, "must be a UTC timestamp like 2026-03-01T07:00:00.000Z"),
    timeZone: z.string().max(100).refine(isValidTimeZone, "unknown time zone"),
    notes: z.string().max(1000).optional(),
  })
  .refine((m) => m.value <= MEASUREMENT_MAX[m.kind], { path: ["value"], message: "value is out of range for this kind" });

export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  bodyweight: "Bodyweight",
  body_fat: "Body fat",
  neck: "Neck",
  shoulders: "Shoulders",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  arm: "Arm",
  forearm: "Forearm",
  thigh: "Thigh",
  calf: "Calf",
};

/** Unit a kind is shown and typed in: bodyweight follows the weight unit, body fat is %, the rest follow the length unit. */
export function measurementUnit(kind: MeasurementKind, units: { weightUnit: WeightUnit; lengthUnit?: LengthUnit }): string {
  if (kind === "bodyweight") return units.weightUnit;
  return kind === "body_fat" ? "%" : (units.lengthUnit ?? "cm");
}

/** Stored value (kg / % / cm) -> number to show in the user's unit. */
export function displayMeasurement(kind: MeasurementKind, stored: number, units: { weightUnit: WeightUnit; lengthUnit?: LengthUnit }): number {
  if (kind === "bodyweight") return displayWeight(stored, units.weightUnit);
  if (kind === "body_fat") return Math.round(stored * 100) / 100;
  return displayLength(stored, units.lengthUnit ?? "cm");
}

/** Value typed in the user's unit -> stored value (kg / % / cm). */
export function toStoredMeasurement(kind: MeasurementKind, typed: number, units: { weightUnit: WeightUnit; lengthUnit?: LengthUnit }): number {
  if (kind === "bodyweight") return toKg(typed, units.weightUnit);
  if (kind === "body_fat") return typed;
  return toCm(typed, units.lengthUnit ?? "cm");
}
