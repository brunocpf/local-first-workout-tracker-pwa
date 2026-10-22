import { db as defaultDb, type AppDB } from "#lib/storage/db";
import { localDate } from "#lib/time";
import type { WorkoutSession } from "#lib/types";

/** Column order is part of the format; see docs/csv-format.md. */
export const CSV_COLUMNS = [
  "session_id",
  "session_name",
  "started_at",
  "ended_at",
  "local_date",
  "time_zone",
  "routine_name",
  "exercise_id",
  "exercise_name",
  "exercise_order",
  "set_order",
  "set_type",
  "weight_kg",
  "reps",
  "duration_s",
  "distance_m",
  "rpe",
  "rir",
  "completed",
  "notes",
] as const;

const FORMULA_START = /^[=+\-@]/;

/** RFC 4180 quoting, plus a leading `'` on text that a spreadsheet could read as a formula. */
export function csvCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per logged set of the given sessions (callers pass completed sessions). */
export function sessionsToCsv(sessions: WorkoutSession[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const s of sessions) {
    s.exercises.forEach((ex, ei) => {
      ex.sets.forEach((set, si) => {
        lines.push(
          [
            s.id,
            s.name,
            s.startedAt,
            s.endedAt,
            localDate(s),
            s.timeZone,
            s.routineNameSnapshot,
            ex.exerciseId,
            ex.exerciseNameSnapshot,
            ei + 1,
            si + 1,
            set.type,
            set.weight,
            set.reps,
            set.durationSeconds,
            set.distance,
            set.rpe,
            set.rir,
            set.completedAt !== undefined,
            set.notes,
          ]
            .map(csvCell)
            .join(","),
        );
      });
    });
  }
  return lines.join("\r\n") + "\r\n";
}

/** UTF-8 BOM so Excel detects the encoding; the CSV parser strips it. */
export function csvBlob(csv: string): Blob {
  return new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
}

export function csvFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `workout-history-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
}

/** All completed sessions, oldest first. */
export async function buildHistoryCsv(database: AppDB = defaultDb): Promise<string> {
  const sessions = await database.sessions
    .where("[status+startedAt]")
    .between(["completed", ""], ["completed", "￿"], true, true)
    .toArray();
  return sessionsToCsv(sessions);
}
