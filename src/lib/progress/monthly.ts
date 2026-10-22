import { localDate } from "#lib/time";
import { exerciseVolume } from "#lib/progress/metrics";
import type { WorkoutSession } from "#lib/types";

export type MonthlyStats = {
  /** Local month of the session, "YYYY-MM" in the session's own time zone. */
  month: string;
  sessions: number;
  durationSeconds: number;
  /** kg x reps over counted sets (see `exerciseVolume`). */
  volume: number;
  /** Sets with `completedAt` set, any set type. */
  completedSets: number;
};

/**
 * Per-month totals for completed sessions, sorted by month ascending. Months with no completed
 * sessions are omitted. Active sessions are ignored. Derived on every call; nothing is stored.
 */
export function monthlyStats(sessions: WorkoutSession[]): MonthlyStats[] {
  const byMonth = new Map<string, MonthlyStats>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.endedAt) continue;
    const month = localDate(s).slice(0, 7);
    let m = byMonth.get(month);
    if (!m) {
      m = { month, sessions: 0, durationSeconds: 0, volume: 0, completedSets: 0 };
      byMonth.set(month, m);
    }
    m.sessions += 1;
    m.durationSeconds += Math.max(0, (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000);
    for (const ex of s.exercises) {
      m.volume += exerciseVolume(ex.sets, ex.exerciseTypeSnapshot);
      m.completedSets += ex.sets.filter((set) => set.completedAt !== undefined).length;
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
