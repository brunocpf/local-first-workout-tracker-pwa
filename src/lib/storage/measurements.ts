import Dexie from "dexie";
import { newId } from "#lib/ids";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import { currentTimeZone } from "#lib/time";
import { MEASUREMENT_KINDS, MEASUREMENT_MAX, type BodyMeasurement, type MeasurementKind } from "#lib/types";

/** Thrown by `addMeasurement` for an unknown kind, an out-of-range value or a malformed timestamp; nothing was written. */
export class InvalidMeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMeasurementError";
  }
}

export type NewMeasurement = {
  kind: MeasurementKind;
  value: number;
  /** ISO 8601 UTC instant; defaults to now. */
  measuredAt?: string;
  /** IANA zone; defaults to the device's. */
  timeZone?: string;
  notes?: string;
};

/** Validates and stores one measurement with a fresh id. Every function takes an optional database so tests can use a uniquely named one. */
export async function addMeasurement(input: NewMeasurement, database: AppDB = defaultDb): Promise<BodyMeasurement> {
  if (!MEASUREMENT_KINDS.includes(input.kind)) throw new InvalidMeasurementError(`Unknown measurement kind: ${String(input.kind)}`);
  if (!Number.isFinite(input.value) || input.value <= 0 || input.value > MEASUREMENT_MAX[input.kind])
    throw new InvalidMeasurementError(`${input.kind} must be above 0 and at most ${MEASUREMENT_MAX[input.kind]}`);
  const at = input.measuredAt ?? new Date().toISOString();
  // Round-trip so only canonical `...Z` instants are stored: string order must equal time order for the indexes.
  const time = Date.parse(at);
  if (Number.isNaN(time) || new Date(time).toISOString() !== at) throw new InvalidMeasurementError("measuredAt must be an ISO 8601 UTC instant");
  const notes = input.notes?.trim();
  const row: BodyMeasurement = {
    id: newId(),
    kind: input.kind,
    value: input.value,
    measuredAt: at,
    timeZone: input.timeZone || currentTimeZone(),
    ...(notes ? { notes } : {}),
  };
  await database.measurements.add(row);
  return row;
}

/** Measurements newest first, optionally only one kind and/or at most `limit` rows. */
export async function listMeasurements(
  { kind, limit }: { kind?: MeasurementKind; limit?: number } = {},
  database: AppDB = defaultDb,
): Promise<BodyMeasurement[]> {
  const query = kind
    ? database.measurements.where("[kind+measuredAt]").between([kind, Dexie.minKey], [kind, Dexie.maxKey]).reverse()
    : database.measurements.orderBy("measuredAt").reverse();
  return limit === undefined ? query.toArray() : query.limit(limit).toArray();
}

/** Deletes one measurement; a missing id is a no-op. */
export async function deleteMeasurement(id: string, database: AppDB = defaultDb): Promise<void> {
  await database.measurements.delete(id);
}
