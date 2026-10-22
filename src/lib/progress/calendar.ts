import { localDate } from "#lib/time";
import type { WorkoutSession } from "#lib/types";

export type CalendarDay = {
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  /** False for the leading/trailing days that pad the first and last week. */
  inMonth: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Weeks of a month, each with 7 days starting on `weekStartsOn` (0 = Sunday ... 6 = Saturday). `month` is 1-12.
 * Pure calendar arithmetic on plain dates, so no time zone or DST can shift a day.
 */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1 | 6): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const prefix = `${year}-${pad2(month)}`;
  const start = Date.UTC(year, month - 1, 1 - lead);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = isoDay(new Date(start + (w * 7 + d) * 86_400_000));
      return { date, inMonth: date.startsWith(prefix) };
    }),
  );
}

/** Completed sessions keyed by the local day they started on (the session's own time zone), oldest first within a day. */
export function sessionsByLocalDate(sessions: WorkoutSession[]): Map<string, WorkoutSession[]> {
  const byDate = new Map<string, WorkoutSession[]>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const date = localDate(s);
    const list = byDate.get(date);
    if (list) list.push(s);
    else byDate.set(date, [s]);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return byDate;
}

/** `{ year, month }` shifted by whole months (`month` is 1-12). */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * UTC `startedAt` bounds (inclusive start, exclusive end) that contain every session whose local day falls in the month,
 * whatever its time zone (zones span UTC-12 to UTC+14, so the window is padded by one day each side).
 */
export function monthQueryRange(year: number, month: number): { from: string; to: string } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - 86_400_000).toISOString(),
    to: new Date(Date.UTC(year, month, 1) + 86_400_000).toISOString(),
  };
}
