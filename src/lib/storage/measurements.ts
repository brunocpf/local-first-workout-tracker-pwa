import Dexie from "dexie";
import { measurementSchema } from "#lib/backup/format";
import { newId } from "#lib/ids";
import { db as defaultDb, type AppDB } from "#lib/storage/db";
import { currentTimeZone } from "#lib/time";
import type { BodyMeasurement, MeasurementKind } from "#lib/types";

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

/** Validates (with the backup's `measurementSchema`, so anything stored can be exported) and stores one measurement with a fresh id. Every function takes an optional database so tests can use a uniquely named one. */
export async function addMeasurement(input: NewMeasurement, database: AppDB = defaultDb): Promise<BodyMeasurement> {
  const notes = input.notes?.trim();
  const checked = measurementSchema.safeParse({
    id: newId(),
    kind: input.kind,
    value: input.value,
    measuredAt: input.measuredAt ?? new Date().toISOString(),
    timeZone: input.timeZone || currentTimeZone(),
    ...(notes ? { notes } : {}),
  });
  if (!checked.success)
    throw new InvalidMeasurementError(checked.error.issues.map((i) => `${i.path.join(".") || "measurement"}: ${i.message}`).join("; "));
  await database.measurements.add(checked.data);
  return checked.data;
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
