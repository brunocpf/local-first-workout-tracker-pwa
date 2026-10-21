import { z } from "zod";
import { isValidTimeZone } from "#lib/time";
import { MEASUREMENT_KINDS, MEASUREMENT_MAX } from "#lib/types";

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
