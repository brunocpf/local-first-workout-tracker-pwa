import { z } from "zod";
import { CsvError, parseCsvRecords } from "#lib/imports/csv";
import { lbToKg } from "#lib/units";

/**
 * Hevy "Export Workout Data" CSV -> validated raw rows (docs/hevy-import.md §1, §2, §8).
 * Grouping into workouts/sessions, time zones and exercise matching are later steps (T5.03+).
 * The file is untrusted: size/row limits, text caps, control characters stripped.
 */
export const MAX_HEVY_BYTES = 10 * 1024 * 1024;
export const MAX_HEVY_ROWS = 200_000;
export const MAX_REPORTED_ERRORS = 50;

const REQUIRED = ["title", "start_time", "exercise_title", "set_type"] as const;
const KG_COLUMNS = [
  "title",
  "start_time",
  "end_time",
  "description",
  "exercise_title",
  "superset_id",
  "exercise_notes",
  "set_index",
  "set_type",
  "weight_kg",
  "reps",
  "distance_km",
  "duration_seconds",
  "rpe",
];
const LB_COLUMNS = KG_COLUMNS.map((c) =>
  c === "weight_kg" ? "weight_lbs" : c === "distance_km" ? "distance_miles" : c,
);
const KNOWN = new Set([...KG_COLUMNS, ...LB_COLUMNS]);
const MILE_M = 1609.344;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL, "").trim())
    .pipe(z.string().max(max));
const optNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? undefined : Number(s)))
    .pipe(z.number().finite().min(min).max(max).optional());
const optInt = (min: number, max: number) =>
  optNumber(min, max).refine(
    (n) => n === undefined || Number.isInteger(n),
    "must be an integer",
  );

const rowSchema = z.object({
  title: text(200),
  start_time: text(100).pipe(z.string().min(1, "start_time is required")),
  end_time: text(100),
  description: text(5000),
  exercise_title: text(200).pipe(
    z.string().min(1, "exercise_title is required"),
  ),
  superset_id: text(100),
  exercise_notes: text(5000),
  set_index: optInt(0, 100_000),
  set_type: text(50),
  weight: optNumber(0, 100_000),
  reps: optInt(0, 100_000),
  distance: optNumber(0, 1_000_000),
  duration_seconds: optInt(0, 1_000_000),
  rpe: optNumber(0, 1000), // range handled below: out-of-range -> omitted + warning
});

export type HevyUnits = "kg" | "lb";

/** One CSV data row, validated. Weight in kg, distance in metres (converted for lb exports). */
export interface HevyRow {
  /** 1-based CSV line of the record's first line (the header is line 1). */
  row: number;
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  exerciseTitle: string;
  supersetId: string;
  exerciseNotes: string;
  setIndex?: number;
  setType: string;
  weightKg?: number;
  reps?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  rpe?: number;
}

export interface HevyParseIssue {
  row?: number;
  message: string;
}

export type HevyParseResult =
  | {
      ok: true;
      rows: HevyRow[];
      units: HevyUnits;
      warnings: HevyParseIssue[];
      /** Data rows rejected for validation errors (not in `rows`). */
      errors: HevyParseIssue[];
      errorCount: number;
      /** Unknown header columns, ignored. */
      unsupportedColumns: string[];
      /** Subset of unsupportedColumns that held at least one non-empty value. */
      unsupportedColumnsWithData: string[];
    }
  | { ok: false; errors: HevyParseIssue[] };

const fail = (message: string): HevyParseResult => ({
  ok: false,
  errors: [{ message }],
});

const trimDistance = (m: number) => Math.round(m * 1000) / 1000;

export function parseHevyCsv(input: string): HevyParseResult {
  if (input.length > MAX_HEVY_BYTES) return fail("File is larger than 10 MB.");
  let records: ReturnType<typeof parseCsvRecords>;
  try {
    records = parseCsvRecords(input);
  } catch (e) {
    if (e instanceof CsvError) return fail(`${e.message} (line ${e.line}).`);
    throw e;
  }
  if (records.length === 0) return fail("The file is empty.");
  if (records.length - 1 > MAX_HEVY_ROWS)
    return fail("The file has more than 200000 rows.");

  const header = records[0].fields.map((h) =>
    h.replace(CONTROL, "").trim().toLowerCase(),
  );
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length)
    return fail(
      `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  const hasKg = header.includes("weight_kg") || header.includes("distance_km");
  const hasLb =
    header.includes("weight_lbs") || header.includes("distance_miles");
  if (hasKg && hasLb)
    return fail(
      "Ambiguous units: the header has both metric and imperial columns.",
    );
  const units: HevyUnits = hasLb ? "lb" : "kg";
  const weightCol = units === "lb" ? "weight_lbs" : "weight_kg";
  const distCol = units === "lb" ? "distance_miles" : "distance_km";

  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  const unsupportedColumns = header.filter(
    (h, i) => h !== "" && !KNOWN.has(h) && index.get(h) === i,
  );
  const dupes = header.filter((h, i) => h !== "" && index.get(h) !== i);
  const warnings: HevyParseIssue[] = [];
  if (dupes.length)
    warnings.push({
      message: `Duplicate column ignored: ${[...new Set(dupes)].join(", ")}.`,
    });
  const unsupportedWithData = new Set<string>();

  const get = (rec: string[], col: string) => {
    const i = index.get(col);
    return i === undefined ? "" : (rec[i] ?? "");
  };

  const rows: HevyRow[] = [];
  const errors: HevyParseIssue[] = [];
  let errorCount = 0;
  const addError = (row: number, message: string) => {
    errorCount++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push({ row, message });
  };
  let badRpe = 0;

  for (let r = 1; r < records.length; r++) {
    const rec = records[r].fields;
    const line = records[r].line;
    for (const col of unsupportedColumns)
      if (get(rec, col).trim() !== "") unsupportedWithData.add(col);
    if (
      rec.length > header.length &&
      rec.slice(header.length).some((f) => f.trim() !== "")
    ) {
      addError(
        line,
        `Row has ${rec.length} fields, expected ${header.length}.`,
      );
      continue;
    }
    const parsed = rowSchema.safeParse({
      title: get(rec, "title"),
      start_time: get(rec, "start_time"),
      end_time: get(rec, "end_time"),
      description: get(rec, "description"),
      exercise_title: get(rec, "exercise_title"),
      superset_id: get(rec, "superset_id"),
      exercise_notes: get(rec, "exercise_notes"),
      set_index: get(rec, "set_index"),
      set_type: get(rec, "set_type"),
      weight: get(rec, weightCol),
      reps: get(rec, "reps"),
      distance: get(rec, distCol),
      duration_seconds: get(rec, "duration_seconds"),
      rpe: get(rec, "rpe"),
    });
    if (!parsed.success) {
      const msgs = parsed.error.issues.map(
        (i) => `${i.path.join(".") || "row"}: ${i.message}`,
      );
      addError(line, msgs.join("; "));
      continue;
    }
    const v = parsed.data;
    let rpe = v.rpe;
    if (
      rpe !== undefined &&
      !(rpe >= 1 && rpe <= 10 && Number.isInteger(rpe * 2))
    ) {
      badRpe++;
      rpe = undefined;
    }
    rows.push({
      row: line,
      title: v.title,
      startTime: v.start_time,
      endTime: v.end_time,
      description: v.description,
      exerciseTitle: v.exercise_title,
      supersetId: v.superset_id,
      exerciseNotes: v.exercise_notes,
      setIndex: v.set_index,
      setType: v.set_type,
      weightKg:
        v.weight === undefined
          ? undefined
          : units === "lb"
            ? lbToKg(v.weight)
            : v.weight,
      reps: v.reps,
      distanceMeters:
        v.distance === undefined
          ? undefined
          : trimDistance(v.distance * (units === "lb" ? MILE_M : 1000)),
      durationSeconds: v.duration_seconds,
      rpe,
    });
  }

  if (errorCount > errors.length)
    warnings.push({
      message: `${errorCount - errors.length} more row errors not shown.`,
    });
  if (badRpe)
    warnings.push({
      message: `${badRpe} rpe value(s) outside 1–10 in 0.5 steps were ignored.`,
    });
  if (unsupportedColumns.length) {
    warnings.push({
      message: `Unsupported columns ignored: ${unsupportedColumns.join(", ")}.`,
    });
  }

  return {
    ok: true,
    rows,
    units,
    warnings,
    errors,
    errorCount,
    unsupportedColumns,
    unsupportedColumnsWithData: unsupportedColumns.filter((c) =>
      unsupportedWithData.has(c),
    ),
  };
}
