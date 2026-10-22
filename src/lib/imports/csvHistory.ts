import { CsvError, parseCsvRecords } from "#lib/imports/csv";
import type { HevyNameResolution } from "#lib/imports/hevy/exerciseMap";
import {
  inferExerciseType,
  parseHevyTime,
  toInstant,
  type HevyExerciseSummary,
} from "#lib/imports/hevy/normalize";
import { initialChoices, type HevyCatalogExercise, type HevyChoice, type HevyChoiceSource } from "#lib/imports/hevy/plan";
import { newId } from "#lib/ids";
import { exerciseVolume } from "#lib/progress/metrics";
import { isValidTimeZone } from "#lib/time";
import { lbToKg } from "#lib/units";
import type { ExerciseType, LoggedSet, SessionExercise, SetType, WorkoutSession } from "#lib/types";

/**
 * CSV history import with explicit column mapping (PRD §12.2, docs/csv-format.md). Any app's CSV:
 * the user maps columns to fields, picks units and a time zone; rows are grouped into completed
 * `WorkoutSession` drafts. Pure: no Dexie. Exercise resolution, duplicates and the write reuse the
 * Hevy import (`buildHevyPlan`, `findDuplicates`, `commitHevyImport`). The file is untrusted:
 * size/row limits, text caps, control characters stripped, nothing evaluated.
 */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 200_000;
const MAX_COLUMNS = 500;
export const MAX_REPORTED = 50;

export interface CsvTable {
  headers: string[];
  rows: { fields: string[]; line: number }[];
  delimiter: string;
}

export type CsvTableResult = { ok: true; table: CsvTable } | { ok: false; error: string };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** `,` / `;` / tab, whichever occurs most in the header line outside quotes (Excel in many locales writes `;`). */
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const c of text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && c in counts) counts[c]++;
  }
  return counts[";"] > counts[","] && counts[";"] >= counts["\t"] ? ";" : counts["\t"] > counts[","] ? "\t" : ",";
}

export function readCsvTable(text: string): CsvTableResult {
  if (text.length > MAX_CSV_BYTES) return { ok: false, error: "File is larger than 10 MB." };
  let records: ReturnType<typeof parseCsvRecords>;
  const delimiter = detectDelimiter(text);
  try {
    records = parseCsvRecords(text, delimiter);
  } catch (e) {
    if (e instanceof CsvError) return { ok: false, error: `${e.message} (line ${e.line}).` };
    throw e;
  }
  if (records.length === 0) return { ok: false, error: "The file is empty." };
  if (records.length - 1 > MAX_CSV_ROWS) return { ok: false, error: `The file has more than ${MAX_CSV_ROWS} rows.` };
  const headers = records[0].fields.map((h) => h.replace(CONTROL, "").trim());
  if (headers.length > MAX_COLUMNS) return { ok: false, error: `The file has more than ${MAX_COLUMNS} columns.` };
  if (headers.every((h) => h === "")) return { ok: false, error: "The first row has no column names." };
  if (records.length === 1) return { ok: false, error: "The file has a header row but no data rows." };
  return { ok: true, table: { headers, rows: records.slice(1), delimiter } };
}

export const CSV_FIELDS = [
  "exerciseName",
  "startedAt",
  "localDate",
  "endedAt",
  "timeZone",
  "sessionId",
  "sessionName",
  "routineName",
  "exerciseId",
  "exerciseOrder",
  "setOrder",
  "setType",
  "weight",
  "reps",
  "duration",
  "distance",
  "rpe",
  "rir",
  "completed",
  "notes",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

/** Field -> 0-based column index; an absent field is not in the file. */
export type CsvMapping = Partial<Record<CsvField, number>>;

export const CSV_FIELD_LABELS: Record<CsvField, { label: string; hint?: string }> = {
  exerciseName: { label: "Exercise name", hint: "Required." },
  startedAt: { label: "Start time", hint: "A date and time (ISO 8601 or like “Oct 13, 2026, 9:50 PM”), or just a date. Required unless there is a local date column." },
  localDate: { label: "Local date", hint: "YYYY-MM-DD; used when there is no start time." },
  endedAt: { label: "End time" },
  timeZone: { label: "Time zone column", hint: "IANA name such as Europe/Lisbon. Rows without a valid one use the zone chosen below." },
  sessionId: { label: "Workout id", hint: "Rows with the same id are one workout. Without it, the same start and name are one workout." },
  sessionName: { label: "Workout name" },
  routineName: { label: "Routine name" },
  exerciseId: { label: "Exercise id", hint: "Matches your catalog exactly when it is one of this app's ids." },
  exerciseOrder: { label: "Exercise position" },
  setOrder: { label: "Set position" },
  setType: { label: "Set type", hint: "normal, warmup, drop or failure." },
  weight: { label: "Weight" },
  reps: { label: "Reps" },
  duration: { label: "Duration" },
  distance: { label: "Distance" },
  rpe: { label: "RPE" },
  rir: { label: "RIR" },
  completed: { label: "Completed", hint: "true/false. Empty means completed." },
  notes: { label: "Set notes" },
};

/** Normalized header (lower case, runs of other characters -> `_`) -> synonyms, best first. Our own export headers come first. */
const SYNONYMS: Record<CsvField, string[]> = {
  exerciseName: ["exercise_name", "exercise_title", "exercise", "movement", "exercise_title"],
  startedAt: ["started_at", "start_time", "start", "date_time", "datetime", "workout_date", "date", "timestamp"],
  localDate: ["local_date"],
  endedAt: ["ended_at", "end_time", "end", "finished_at"],
  timeZone: ["time_zone", "timezone", "tz"],
  sessionId: ["session_id", "workout_id"],
  sessionName: ["session_name", "workout_name", "workout", "title"],
  routineName: ["routine_name", "routine"],
  exerciseId: ["exercise_id"],
  exerciseOrder: ["exercise_order", "exercise_position"],
  setOrder: ["set_order", "set_index", "set_number", "set"],
  setType: ["set_type"],
  weight: ["weight_kg", "weight_lbs", "weight_lb", "weight", "load"],
  reps: ["reps", "repetitions"],
  duration: ["duration_s", "duration_seconds", "duration_sec", "duration"],
  distance: ["distance_m", "distance_km", "distance_miles", "distance_mi", "distance"],
  rpe: ["rpe"],
  rir: ["rir"],
  completed: ["completed"],
  notes: ["notes", "set_notes", "note"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Auto-map: our own export's headers map exactly; common synonyms from other apps are tried next. Each column is used once. */
export function suggestMapping(headers: readonly string[]): CsvMapping {
  const normalized = headers.map(normHeader);
  const used = new Set<number>();
  const mapping: CsvMapping = {};
  for (const field of CSV_FIELDS) {
    for (const synonym of SYNONYMS[field]) {
      const i = normalized.findIndex((h, idx) => h === synonym && !used.has(idx));
      if (i !== -1) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

export type WeightColumnUnit = "kg" | "lb";
export type DistanceColumnUnit = "m" | "km" | "mi";
export type DurationColumnUnit = "s" | "min";

export interface CsvUnits {
  weight: WeightColumnUnit;
  distance: DistanceColumnUnit;
  duration: DurationColumnUnit;
}

/** Unit hints from the mapped header names; our own export is kg / m / s. */
export function suggestUnits(headers: readonly string[], mapping: CsvMapping): CsvUnits {
  const head = (f: CsvField) => (mapping[f] === undefined ? "" : normHeader(headers[mapping[f]] ?? ""));
  const w = head("weight");
  const d = head("distance");
  const t = head("duration");
  return {
    weight: /(^|_)(lb|lbs|pounds?)($|_)/.test(w) ? "lb" : "kg",
    distance: /(^|_)(mi|miles?)($|_)/.test(d) ? "mi" : /(^|_)km($|_)/.test(d) ? "km" : "m",
    duration: /(^|_)(min|mins|minutes?)($|_)/.test(t) ? "min" : "s",
  };
}

/** What stops an import with this mapping; empty = fine. */
export function mappingIssues(mapping: CsvMapping): string[] {
  const issues: string[] = [];
  if (mapping.exerciseName === undefined) issues.push("Choose the column with the exercise name.");
  if (mapping.startedAt === undefined && mapping.localDate === undefined) issues.push("Choose a start time or local date column.");
  if (!(["weight", "reps", "duration", "distance"] as const).some((f) => mapping[f] !== undefined))
    issues.push("Choose at least one of weight, reps, duration or distance.");
  return issues;
}

export interface CsvImportOptions {
  /** IANA zone for times without an offset and rows without a (valid) zone column. */
  timeZone: string;
  units: CsvUnits;
  /** Used for `createdAt`/`updatedAt`. Default: now. */
  importedAt?: Date;
}

export interface CsvIssue {
  /** Workout name and start, or `Row N`. */
  where?: string;
  message: string;
}

export interface CsvNormalizeResult {
  /** Completed sessions, oldest first. `exerciseId` is `""` until resolved by `buildHevyPlan`. */
  drafts: WorkoutSession[];
  exercises: HevyExerciseSummary[];
  /** First valid `exercise_id` seen per exercise name (for matching this app's own export). */
  exerciseIds: Record<string, string>;
  totals: { workouts: number; sets: number; volumeKg: number };
  report: {
    /** Rows left out for an invalid cell (first `MAX_REPORTED` listed). */
    rowErrors: CsvIssue[];
    rowErrorCount: number;
    emptySetsSkipped: number;
    unknownSetTypes: { value: string; rows: number }[];
    workoutsRejected: CsvIssue[];
    warnings: CsvIssue[];
  };
}

type Row = {
  line: number;
  groupKey: string;
  sessionId?: string;
  sessionName: string;
  start: string;
  end: string;
  zone: string;
  routine: string;
  exerciseId?: string;
  exerciseName: string;
  exerciseOrder?: number;
  setOrder?: number;
  setType: string;
  weightKg?: number;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  notes: string;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const MILE_M = 1609.344;
const KM_M = 1000;

/** A text cell: control characters out, the export's formula guard (`'` before `= + - @`) undone. */
function textCell(raw: string, max: number, trim = true): string {
  let s = raw.replace(CONTROL, "");
  if (trim) s = s.trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1);
  return s.length > max ? s.slice(0, max) : s;
}

type Parsed<T> = { ok: true; value: T | undefined } | { ok: false };

function numberCell(raw: string, min: number, max: number, integer = false): Parsed<number> {
  let s = raw.trim();
  if (s === "") return { ok: true, value: undefined };
  s = s.replace(/^([+-]?\d+),(\d+)$/, "$1.$2"); // decimal comma
  if (!NUMBER.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return { ok: false };
  return { ok: true, value: n };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function durationCell(raw: string, unit: DurationColumnUnit): Parsed<number> {
  const s = raw.trim();
  const clock = /^(\d{1,4}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (clock) {
    const [h, m, sec] = clock[3] === undefined ? [0, +clock[1], +clock[2]] : [+clock[1], +clock[2], +clock[3]];
    if (m > 59 || sec > 59) return { ok: false };
    return { ok: true, value: h * 3600 + m * 60 + sec };
  }
  const n = numberCell(s, 0, 1_000_000);
  if (!n.ok || n.value === undefined) return n;
  const seconds = Math.round(unit === "min" ? n.value * 60 : n.value);
  return seconds > 1_000_000 ? { ok: false } : { ok: true, value: seconds };
}

function boolCell(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase();
  if (["true", "1", "yes", "y", "x"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

const SET_TYPES: Record<string, SetType> = {
  normal: "normal",
  working: "normal",
  warmup: "warmup",
  "warm-up": "warmup",
  "warm up": "warmup",
  drop: "drop",
  dropset: "drop",
  "drop set": "drop",
  drop_set: "drop",
  failure: "failure",
  "to failure": "failure",
};

const withoutUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** A date alone is a noon start, so a DST gap at midnight can't move the day. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function parseWhen(raw: string, zone: string): { iso: string; dst?: "gap" | "fold" } | undefined {
  const s = raw.trim();
  const t = parseHevyTime(DATE_ONLY.test(s) ? `${s}T12:00` : s);
  return t && toInstant(t, zone);
}

type Block = { name: string; order?: number; exerciseId?: string; rows: Row[] };

/** Rows of one workout -> exercise blocks. With an exercise position column blocks are keyed by it, else contiguous runs of one name. */
function toBlocks(rows: Row[]): Block[] {
  const blocks: Block[] = [];
  const byOrder = new Map<number, Block>();
  for (const r of rows) {
    const last = blocks[blocks.length - 1];
    let block: Block | undefined;
    if (r.exerciseOrder !== undefined) {
      block = byOrder.get(r.exerciseOrder);
      if (block !== undefined && block.name !== r.exerciseName) block = undefined;
    } else if (last !== undefined && last.order === undefined && last.name === r.exerciseName) {
      // A set position that restarts at 1 starts a new block of the same exercise.
      const prev = last.rows[last.rows.length - 1].setOrder;
      block = r.setOrder !== undefined && prev !== undefined && r.setOrder <= prev ? undefined : last;
    }
    if (block === undefined) {
      block = { name: r.exerciseName, order: r.exerciseOrder, exerciseId: r.exerciseId, rows: [] };
      blocks.push(block);
      if (r.exerciseOrder !== undefined) byOrder.set(r.exerciseOrder, block);
    }
    block.rows.push(r);
  }
  if (blocks.length > 1 && blocks.every((b) => b.order !== undefined)) blocks.sort((a, b) => (a.order as number) - (b.order as number));
  for (const b of blocks)
    if (b.rows.length > 1 && b.rows.every((r) => r.setOrder !== undefined))
      b.rows = b.rows
        .map((r, i) => ({ r, i }))
        .sort((x, y) => (x.r.setOrder as number) - (y.r.setOrder as number) || x.i - y.i)
        .map((x) => x.r);
  return blocks;
}

export function normalizeCsvHistory(table: CsvTable, mapping: CsvMapping, options: CsvImportOptions): CsvNormalizeResult {
  if (!isValidTimeZone(options.timeZone)) throw new RangeError(`Unknown time zone: ${options.timeZone}`);
  const issues = mappingIssues(mapping);
  if (issues.length > 0) throw new RangeError(issues[0]);
  const { units } = options;
  const importedAt = (options.importedAt ?? new Date()).toISOString();

  const cell = (fields: string[], f: CsvField): string => (mapping[f] === undefined ? "" : (fields[mapping[f]] ?? ""));

  let rowErrorCount = 0;
  const rowErrors: CsvIssue[] = [];
  const rowError = (line: number, message: string) => {
    rowErrorCount++;
    if (rowErrors.length < MAX_REPORTED) rowErrors.push({ where: `Row ${line}`, message });
  };
  const unknownTypes = new Map<string, number>();
  const rejected: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  let emptySetsSkipped = 0;
  let truncatedNotes = 0;

  // Pass 1: validate every row.
  const groups = new Map<string, Row[]>();
  const typeRows = new Map<string, Row[]>();
  const exerciseIds: Record<string, string> = {};
  for (const { fields, line } of table.rows) {
    const exerciseName = textCell(cell(fields, "exerciseName"), 200);
    if (exerciseName === "") {
      rowError(line, "No exercise name.");
      continue;
    }
    const bad = (what: string) => rowError(line, `Invalid ${what}.`);

    const weight = numberCell(cell(fields, "weight"), 0, 100_000);
    if (!weight.ok) {
      bad("weight");
      continue;
    }
    const reps = numberCell(cell(fields, "reps"), 0, 100_000, true);
    if (!reps.ok) {
      bad("reps");
      continue;
    }
    const duration = durationCell(cell(fields, "duration"), units.duration);
    if (!duration.ok) {
      bad("duration");
      continue;
    }
    const distance = numberCell(cell(fields, "distance"), 0, 1_000_000);
    if (!distance.ok) {
      bad("distance");
      continue;
    }
    const exerciseOrder = numberCell(cell(fields, "exerciseOrder"), 0, 100_000, true);
    const setOrder = numberCell(cell(fields, "setOrder"), 0, 100_000, true);
    if (!exerciseOrder.ok || !setOrder.ok) {
      bad(exerciseOrder.ok ? "set position" : "exercise position");
      continue;
    }
    // Out-of-range effort ratings are left out, not fatal.
    const rpe = numberCell(cell(fields, "rpe"), 0, 10);
    const rir = numberCell(cell(fields, "rir"), 0, 20);

    const rawId = cell(fields, "exerciseId").trim();
    const sessionIdRaw = cell(fields, "sessionId").trim();
    const sessionName = textCell(cell(fields, "sessionName"), 200);
    const start = (cell(fields, "startedAt").trim() || cell(fields, "localDate").trim());
    const end = cell(fields, "endedAt").trim();
    const completed = boolCell(cell(fields, "completed")) ?? true;
    const rawNotes = textCell(cell(fields, "notes"), 100_000, false);
    if (rawNotes.length > 2000) truncatedNotes++;

    const row: Row = withoutUndefined<Row>({
      line,
      groupKey: sessionIdRaw !== "" ? JSON.stringify(["id", sessionIdRaw]) : JSON.stringify(["start", start, sessionName]),
      sessionId: SAFE_ID.test(sessionIdRaw) ? sessionIdRaw : undefined,
      sessionName,
      start,
      end,
      zone: cell(fields, "timeZone").trim(),
      routine: textCell(cell(fields, "routineName"), 200),
      exerciseId: SAFE_ID.test(rawId) ? rawId : undefined,
      exerciseName,
      exerciseOrder: exerciseOrder.value,
      setOrder: setOrder.value,
      setType: cell(fields, "setType").trim(),
      weightKg: weight.value === undefined ? undefined : units.weight === "lb" ? lbToKg(weight.value) : weight.value,
      reps: reps.value,
      durationSeconds: duration.value,
      distanceMeters:
        distance.value === undefined ? undefined : units.distance === "m" ? distance.value : round3(distance.value * (units.distance === "km" ? KM_M : MILE_M)),
      rpe: rpe.ok ? rpe.value : undefined,
      rir: rir.ok ? rir.value : undefined,
      completed,
      notes: rawNotes.slice(0, 2000),
    });
    if (!rpe.ok || !rir.ok) warnings.push({ where: `Row ${line}`, message: `${!rpe.ok ? "RPE" : "RIR"} out of range; ignored.` });

    const g = groups.get(row.groupKey);
    if (g) g.push(row);
    else groups.set(row.groupKey, [row]);
    const t = typeRows.get(exerciseName);
    if (t) t.push(row);
    else typeRows.set(exerciseName, [row]);
    if (row.exerciseId !== undefined && exerciseIds[exerciseName] === undefined) exerciseIds[exerciseName] = row.exerciseId;
  }
  if (rowErrorCount > rowErrors.length) warnings.push({ message: `${rowErrorCount - rowErrors.length} more rows had invalid values and were left out.` });
  if (truncatedNotes > 0) warnings.push({ message: `${truncatedNotes} set notes were longer than 2000 characters and were shortened.` });

  const hasData = (r: Row) => r.weightKg !== undefined || r.reps !== undefined || r.durationSeconds !== undefined || r.distanceMeters !== undefined;
  const inferred = new Map<string, ExerciseType>();
  for (const [name, list] of typeRows) inferred.set(name, inferExerciseType(name, list));

  // Pass 2: groups -> sessions.
  const usedIds = new Set<string>();
  const drafts: WorkoutSession[] = [];
  for (const wrows of groups.values()) {
    const first = wrows[0];
    const label = `${first.sessionName || "Workout"} (${first.start || "no start"})`;
    const issue = (message: string): CsvIssue => ({ where: label, message });

    let zone = options.timeZone;
    if (first.zone !== "") {
      if (isValidTimeZone(first.zone)) zone = first.zone;
      else warnings.push(issue(`Unknown time zone "${first.zone.slice(0, 60)}"; used ${options.timeZone}.`));
    }
    const start = first.start === "" ? undefined : parseWhen(first.start, zone);
    if (start === undefined) {
      rejected.push(issue(`Unrecognized start time "${first.start.slice(0, 60)}".`));
      continue;
    }
    if (start.dst) warnings.push(issue(start.dst === "gap" ? "Start time does not exist in this time zone (DST gap); moved forward." : "Start time is ambiguous in this time zone (DST fold); the earlier occurrence was used."));
    let endedAt: string | undefined;
    if (first.end !== "") {
      const end = parseWhen(first.end, zone);
      if (end === undefined) warnings.push(issue(`Unrecognized end time "${first.end.slice(0, 60)}"; ignored.`));
      else if (end.iso < start.iso) warnings.push(issue("End time is before the start time; ignored."));
      else endedAt = end.iso;
    }
    const completedAt = endedAt ?? start.iso;

    const exercises: SessionExercise[] = [];
    for (const b of toBlocks(wrows)) {
      const sets: LoggedSet[] = [];
      for (const r of b.rows) {
        if (!hasData(r)) {
          emptySetsSkipped++;
          continue;
        }
        const key = r.setType.toLowerCase();
        let type: SetType = "normal";
        if (key !== "") {
          const known = SET_TYPES[key];
          if (known === undefined) unknownTypes.set(r.setType, (unknownTypes.get(r.setType) ?? 0) + 1);
          else type = known;
        }
        sets.push(
          withoutUndefined<LoggedSet>({
            id: newId(),
            type,
            weight: r.weightKg,
            reps: r.reps,
            durationSeconds: r.durationSeconds,
            distance: r.distanceMeters,
            rpe: r.rpe,
            rir: r.rir,
            completedAt: r.completed ? completedAt : undefined,
            notes: r.notes === "" ? undefined : r.notes,
          }),
        );
      }
      if (sets.length === 0) continue;
      exercises.push({
        id: newId(),
        exerciseId: "",
        exerciseNameSnapshot: b.name,
        exerciseTypeSnapshot: inferred.get(b.name) ?? "weighted_reps",
        sets,
      });
    }
    if (exercises.length === 0) {
      rejected.push(issue("No sets with data."));
      continue;
    }
    // Limits of the stored format (backup/format.ts): a workout beyond them can't be written.
    if (exercises.length > 200 || exercises.some((e) => e.sets.length > 500)) {
      rejected.push(issue("Too many exercises or sets in one workout (limit 200 exercises, 500 sets each)."));
      continue;
    }

    let id = first.sessionId;
    if (id === undefined || usedIds.has(id)) id = newId();
    usedIds.add(id);
    drafts.push(
      withoutUndefined<WorkoutSession>({
        id,
        name: first.sessionName || "Workout",
        status: "completed",
        startedAt: start.iso,
        endedAt,
        timeZone: zone,
        routineNameSnapshot: first.routine === "" ? undefined : first.routine,
        exercises,
        exerciseIds: [],
        createdAt: importedAt,
        updatedAt: importedAt,
      }),
    );
  }
  // Stable: equal starts keep file order.
  drafts.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));

  const summaries = new Map<string, HevyExerciseSummary & { seen: Set<string> }>();
  let sets = 0;
  let volumeKg = 0;
  for (const d of drafts)
    for (const e of d.exercises) {
      let s = summaries.get(e.exerciseNameSnapshot);
      if (s === undefined) {
        s = { title: e.exerciseNameSnapshot, blocks: 0, sets: 0, workouts: 0, inferredType: e.exerciseTypeSnapshot, seen: new Set() };
        summaries.set(e.exerciseNameSnapshot, s);
      }
      s.blocks++;
      s.sets += e.sets.length;
      s.seen.add(d.id);
      sets += e.sets.length;
      volumeKg += exerciseVolume(e.sets, e.exerciseTypeSnapshot);
    }

  return {
    drafts,
    exercises: [...summaries.values()].map(({ seen, ...s }) => ({ ...s, workouts: seen.size })).sort((a, b) => b.sets - a.sets || a.title.localeCompare(b.title)),
    exerciseIds,
    totals: { workouts: drafts.length, sets, volumeKg },
    report: {
      rowErrors,
      rowErrorCount,
      emptySetsSkipped,
      unknownSetTypes: [...unknownTypes].map(([value, n]) => ({ value, rows: n })),
      workoutsRejected: rejected,
      warnings,
    },
  };
}

export interface CsvInitialChoices {
  resolutions: Record<string, HevyNameResolution>;
  choices: Record<string, HevyChoice>;
  sources: Record<string, HevyChoiceSource>;
}

/**
 * Pre-selected exercise decisions: an `exercise_id` that is an active catalog exercise wins (this app's own export),
 * then the name resolver (`initialChoices`). Everything else needs a decision.
 */
export function csvInitialChoices(
  exercises: readonly HevyExerciseSummary[],
  catalog: readonly HevyCatalogExercise[],
  exerciseIds: Readonly<Record<string, string>> = {},
): CsvInitialChoices {
  const out: CsvInitialChoices = initialChoices(exercises, catalog);
  const active = new Set(catalog.filter((x) => x.archivedAt === undefined).map((x) => x.id));
  for (const { title } of exercises) {
    const id = Object.hasOwn(exerciseIds, title) ? exerciseIds[title] : undefined;
    if (id !== undefined && active.has(id)) {
      out.resolutions[title] = { status: "matched", exerciseId: id, via: "id" };
      out.choices[title] = { kind: "exercise", exerciseId: id };
      out.sources[title] = "matched";
    }
  }
  return out;
}

/**
 * Ids to give exercises the user chooses to create: the file's own `exercise_id`, so a re-import of this app's export
 * restores the same ids. Only when that id is unused (in the catalog, archived ones included) and unique in the file.
 */
export function reservedExerciseIds(
  exercises: readonly HevyExerciseSummary[],
  catalog: readonly Pick<HevyCatalogExercise, "id">[],
  exerciseIds: Readonly<Record<string, string>>,
): Map<string, string> {
  const taken = new Set(catalog.map((x) => x.id));
  const reserved = new Map<string, string>();
  for (const { title } of exercises) {
    const id = Object.hasOwn(exerciseIds, title) ? exerciseIds[title] : undefined;
    if (id !== undefined && !taken.has(id)) {
      taken.add(id);
      reserved.set(title, id);
    }
  }
  return reserved;
}

/** Drafts whose id is already stored get a fresh one: importing must never overwrite or abort on an id clash. */
export function freshenTakenIds(drafts: readonly WorkoutSession[], taken: ReadonlySet<string>): WorkoutSession[] {
  return drafts.map((d) => (taken.has(d.id) ? { ...d, id: newId() } : d));
}
