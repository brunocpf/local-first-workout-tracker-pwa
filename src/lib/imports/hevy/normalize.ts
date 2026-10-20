import { newId } from "#lib/ids";
import { exerciseVolume } from "#lib/progress/metrics";
import { isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "#lib/time";
import type { HevyRow } from "#lib/imports/hevy/parse";
import type {
  ExerciseType,
  LoggedSet,
  SessionExercise,
  SetType,
  WorkoutSession,
} from "#lib/types";

/**
 * Validated Hevy rows -> completed `WorkoutSession` drafts (docs/hevy-import.md §3, §4, §6, §7).
 * Pure: no Dexie. Exercise resolution (T5.04) fills in `exerciseId` later; until then
 * `exerciseId` is `""`, `exerciseNameSnapshot` is the Hevy title and `exerciseTypeSnapshot` is inferred (§5).
 * Rows are already in kg / metres (the parser converts lb exports).
 */

export interface HevyNormalizeOptions {
  /** IANA zone the file's wall-clock times were logged in. Required: the file carries none. */
  timeZone: string;
  /** Used for `createdAt`/`updatedAt`. Default: now. */
  importedAt?: Date;
  /** `unsupportedColumnsWithData` from the parse result, echoed into the report. */
  unsupportedColumns?: readonly string[];
}

export interface HevyIssue {
  /** Workout title and start, for display. */
  workout?: string;
  message: string;
}

export interface HevyExerciseSummary {
  /** Hevy `exercise_title`, verbatim. */
  title: string;
  /** Exercise blocks (`SessionExercise` entries) across the drafts. */
  blocks: number;
  /** Imported sets across the drafts. */
  sets: number;
  /** Workouts containing it. */
  workouts: number;
  /** Type a new custom exercise would get (§5); drafts use it as `exerciseTypeSnapshot` until resolved. */
  inferredType: ExerciseType;
}

export interface HevyUnsupportedReport {
  /** Columns the importer does not understand that held data (ignored). */
  columns: string[];
  /** Empty sets (no weight, reps, duration or distance) that were not imported. */
  emptySetsSkipped: number;
  /** Unknown `set_type` values (imported as `normal`) with their row counts. */
  unknownSetTypes: { value: string; rows: number }[];
  /** Workouts not imported at all (unreadable start time, or no sets). */
  workoutsRejected: HevyIssue[];
  /** Everything else worth showing: DST adjustments, missing end times, conflicting notes, ... */
  warnings: HevyIssue[];
}

export interface HevyNormalizeResult {
  /** Completed sessions, oldest first. */
  drafts: WorkoutSession[];
  exercises: HevyExerciseSummary[];
  totals: { workouts: number; sets: number; volumeKg: number };
  unsupported: HevyUnsupportedReport;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const HEVY_TIME = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}) ?([AaPp])\.?[Mm]\.?$/;
const ISO_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;
const pad2 = (n: number) => String(n).padStart(2, "0");

type ParsedTime = { local: string } | { instant: string };

/** `Oct 13, 2026, 9:50 PM` (English) or ISO 8601 -> wall-clock string, or an exact instant when ISO carries an offset. */
function parseHevyTime(s: string): ParsedTime | undefined {
  const m = HEVY_TIME.exec(s.trim());
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    const day = +m[2];
    const year = +m[3];
    let hour = +m[4];
    const minute = +m[5];
    if (month < 0 || hour < 1 || hour > 12 || minute > 59) return undefined;
    const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (day < 1 || day > dim) return undefined;
    hour = (hour % 12) + (m[6].toLowerCase() === "p" ? 12 : 0);
    return {
      local: `${year}-${pad2(month + 1)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`,
    };
  }
  const iso = ISO_TIME.exec(s.trim());
  if (iso) {
    if (iso[3] === undefined) {
      const local = `${iso[1]}T${iso[2]}`;
      return Number.isNaN(Date.parse(`${local}:00Z`)) ? undefined : { local };
    }
    const zone = /^z$/i.test(iso[3])
      ? "Z"
      : iso[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const ms = Date.parse(`${iso[1]}T${iso[2]}:00${zone}`);
    return Number.isNaN(ms) ? undefined : { instant: new Date(ms).toISOString() };
  }
  return undefined;
}

/** Wall time in `timeZone` -> UTC ISO, plus whether it hit a DST gap or fold. */
function toInstant(
  t: ParsedTime,
  timeZone: string,
): { iso: string; dst?: "gap" | "fold" } | undefined {
  if ("instant" in t) return { iso: t.instant };
  const iso = zonedLocalToUtc(t.local, timeZone);
  if (iso === undefined) return undefined;
  if (utcToZonedLocal(iso, timeZone) !== t.local) return { iso, dst: "gap" };
  const ms = Date.parse(iso);
  for (const delta of [1_800_000, 3_600_000, 7_200_000]) {
    if (utcToZonedLocal(new Date(ms + delta).toISOString(), timeZone) === t.local)
      return { iso, dst: "fold" };
  }
  return { iso };
}

const SET_TYPES: Record<string, SetType> = {
  normal: "normal",
  warmup: "warmup",
  drop: "drop",
  dropset: "drop",
  drop_set: "drop",
  failure: "failure",
};

type Block = { title: string; rows: HevyRow[] };

/** Contiguous runs of one exercise title; a `set_index` restart at 0 starts a new block (§3). */
function toBlocks(rows: HevyRow[]): Block[] {
  const blocks: Block[] = [];
  for (const r of rows) {
    const last = blocks[blocks.length - 1];
    if (
      last === undefined ||
      last.title !== r.exerciseTitle ||
      (r.setIndex === 0 && last.rows.length > 0)
    )
      blocks.push({ title: r.exerciseTitle, rows: [r] });
    else last.rows.push(r);
  }
  for (const b of blocks) {
    if (b.rows.every((r) => r.setIndex !== undefined))
      b.rows = b.rows
        .map((r, i) => ({ r, i }))
        .sort((a, b2) => a.r.setIndex! - b2.r.setIndex! || a.i - b2.i)
        .map((x) => x.r);
  }
  return blocks;
}

const hasData = (r: HevyRow) =>
  r.weightKg !== undefined ||
  r.reps !== undefined ||
  r.durationSeconds !== undefined ||
  r.distanceMeters !== undefined;

/** §5: type for a new custom exercise, from all rows of one title in the file. */
export function inferExerciseType(title: string, rows: readonly HevyRow[]): ExerciseType {
  const anyWeight = rows.some((r) => r.weightKg !== undefined);
  const anyReps = rows.some((r) => r.reps !== undefined);
  if (rows.some((r) => r.distanceMeters !== undefined) && !anyWeight)
    return "distance";
  if (rows.some((r) => r.durationSeconds !== undefined) && !anyWeight && !anyReps)
    return "duration";
  if (/\(\s*assisted/i.test(title)) return "assisted_bodyweight";
  if (!anyWeight && anyReps) return "bodyweight_reps";
  return "weighted_reps";
}

const withoutUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;

export function normalizeHevyRows(
  rows: readonly HevyRow[],
  options: HevyNormalizeOptions,
): HevyNormalizeResult {
  if (!isValidTimeZone(options.timeZone))
    throw new RangeError(`Unknown time zone: ${options.timeZone}`);
  const { timeZone } = options;
  const importedAt = (options.importedAt ?? new Date()).toISOString();

  const rejected: HevyIssue[] = [];
  const warnings: HevyIssue[] = [];
  const unknownTypes = new Map<string, number>();
  let emptySetsSkipped = 0;

  const inferred = new Map<string, ExerciseType>();
  const byTitle = new Map<string, HevyRow[]>();
  for (const r of rows) {
    const list = byTitle.get(r.exerciseTitle);
    if (list) list.push(r);
    else byTitle.set(r.exerciseTitle, [r]);
  }
  for (const [title, list] of byTitle)
    inferred.set(title, inferExerciseType(title, list));

  // Workout = same (title, start_time, end_time); rows need not be adjacent.
  const workouts = new Map<string, HevyRow[]>();
  for (const r of rows) {
    const key = JSON.stringify([r.title, r.startTime, r.endTime]);
    const list = workouts.get(key);
    if (list) list.push(r);
    else workouts.set(key, [r]);
  }

  const drafts: WorkoutSession[] = [];
  for (const wrows of workouts.values()) {
    const first = wrows[0];
    const label = `${first.title || "Workout"} (${first.startTime})`;
    const issue = (message: string): HevyIssue => ({ workout: label, message });

    const start = parseHevyTime(first.startTime);
    const startAt = start && toInstant(start, timeZone);
    if (startAt === undefined) {
      rejected.push(
        issue(`Unrecognized start time "${first.startTime}" (expected e.g. "Oct 13, 2026, 9:50 PM").`),
      );
      continue;
    }
    if (startAt.dst)
      warnings.push(
        issue(
          startAt.dst === "gap"
            ? "Start time does not exist in this time zone (DST gap); moved forward."
            : "Start time is ambiguous in this time zone (DST fold); the earlier occurrence was used.",
        ),
      );

    let endedAt: string | undefined;
    if (first.endTime !== "") {
      const end = parseHevyTime(first.endTime);
      const endAt = end && toInstant(end, timeZone);
      if (endAt === undefined)
        warnings.push(issue(`Unrecognized end time "${first.endTime}"; ignored.`));
      else if (endAt.iso < startAt.iso)
        warnings.push(issue("End time is before the start time; ignored."));
      else {
        endedAt = endAt.iso;
        if (endAt.dst)
          warnings.push(issue(`End time falls in a DST ${endAt.dst}; adjusted.`));
      }
    } else warnings.push(issue("No end time; the workout has no duration."));
    const completedAt = endedAt ?? startAt.iso;

    const blocks = toBlocks(wrows);
    const supersetBlocks = new Map<string, number>();
    for (const b of blocks) {
      const id = b.rows[0].supersetId;
      if (id !== "") supersetBlocks.set(id, (supersetBlocks.get(id) ?? 0) + 1);
    }
    const supersetGroups = new Map<string, string>();
    for (const [id, n] of supersetBlocks) if (n >= 2) supersetGroups.set(id, newId());

    const exercises: SessionExercise[] = [];
    for (const b of blocks) {
      const sets: LoggedSet[] = [];
      for (const r of b.rows) {
        if (!hasData(r)) {
          emptySetsSkipped++;
          continue;
        }
        const key = r.setType.trim().toLowerCase();
        let type = SET_TYPES[key];
        if (type === undefined) {
          type = "normal";
          unknownTypes.set(r.setType, (unknownTypes.get(r.setType) ?? 0) + 1);
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
            completedAt,
          }),
        );
      }
      if (sets.length === 0) continue;
      const notes = [...new Set(b.rows.map((r) => r.exerciseNotes).filter((n) => n !== ""))];
      if (notes.length > 1)
        warnings.push(
          issue(`"${b.title}" has different notes on different sets; only the first was kept.`),
        );
      const groupId = supersetGroups.get(b.rows[0].supersetId);
      exercises.push(
        withoutUndefined<SessionExercise>({
          id: newId(),
          exerciseId: "",
          exerciseNameSnapshot: b.title,
          exerciseTypeSnapshot: inferred.get(b.title) ?? "weighted_reps",
          supersetGroupId: groupId,
          notes: notes[0] ?? "",
          sets,
        }),
      );
    }
    if (exercises.length === 0) {
      rejected.push(issue("No sets with data."));
      continue;
    }

    const description = wrows.map((r) => r.description).find((d) => d !== "");
    if (first.title === "") warnings.push(issue('Empty title; named "Workout".'));
    drafts.push(
      withoutUndefined<WorkoutSession>({
        id: newId(),
        name: first.title || "Workout",
        status: "completed",
        startedAt: startAt.iso,
        endedAt,
        timeZone,
        notes: description,
        exercises,
        exerciseIds: [],
        createdAt: importedAt,
        updatedAt: importedAt,
      }),
    );
  }
  // Array.prototype.sort is stable: equal starts keep file order.
  drafts.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));

  const summaries = new Map<string, HevyExerciseSummary & { seen: Set<string> }>();
  let sets = 0;
  let volumeKg = 0;
  for (const d of drafts) {
    for (const e of d.exercises) {
      let s = summaries.get(e.exerciseNameSnapshot);
      if (s === undefined) {
        s = {
          title: e.exerciseNameSnapshot,
          blocks: 0,
          sets: 0,
          workouts: 0,
          inferredType: e.exerciseTypeSnapshot,
          seen: new Set(),
        };
        summaries.set(e.exerciseNameSnapshot, s);
      }
      s.blocks++;
      s.sets += e.sets.length;
      s.seen.add(d.id);
      sets += e.sets.length;
      volumeKg += exerciseVolume(e.sets, e.exerciseTypeSnapshot);
    }
  }
  const exercises = [...summaries.values()]
    .map(({ seen, ...s }) => ({ ...s, workouts: seen.size }))
    .sort((a, b) => b.sets - a.sets || a.title.localeCompare(b.title));

  return {
    drafts,
    exercises,
    totals: { workouts: drafts.length, sets, volumeKg },
    unsupported: {
      columns: [...(options.unsupportedColumns ?? [])],
      emptySetsSkipped,
      unknownSetTypes: [...unknownTypes].map(([value, n]) => ({ value, rows: n })),
      workoutsRejected: rejected,
      warnings,
    },
  };
}
