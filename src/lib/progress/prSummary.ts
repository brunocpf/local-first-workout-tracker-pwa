import { isCounted, personalRecords } from "#lib/progress/metrics";
import { localDate } from "#lib/time";
import type { ExerciseType, WorkoutSession } from "#lib/types";

/** Where a best was first achieved (ties keep the earliest session). */
export type PrRecord = { value: number; date: string; sessionId: string };

export type PrSummaryData = {
  maxWeight?: PrRecord;
  bestE1RM?: PrRecord;
  bestSessionVolume?: PrRecord;
  /** Best weight per exact rep count 1..12. */
  repPRs: { reps: number; record: PrRecord }[];
  /** Most reps in one counted set (bodyweight-type exercises). */
  bestReps?: PrRecord;
};

const BODYWEIGHT: ReadonlySet<ExerciseType> = new Set(["bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight"]);

/** PRs for one exercise with the session that set each, from raw sets. Warm-ups and incomplete sets never count. */
export function prSummary(sessions: readonly WorkoutSession[], exerciseId: string, type: ExerciseType): PrSummaryData {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const out: PrSummaryData = { repPRs: [] };
  const reps = new Map<number, PrRecord>();
  const beat = (cur: PrRecord | undefined, value: number | undefined, date: string, sessionId: string) =>
    value !== undefined && value > (cur?.value ?? 0) ? { value, date, sessionId } : cur;

  for (const s of ordered) {
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
    if (!sets.some(isCounted)) continue;
    const date = localDate(s);
    if (type === "weighted_reps") {
      const pr = personalRecords([sets]);
      out.maxWeight = beat(out.maxWeight, pr.maxWeight, date, s.id);
      out.bestE1RM = beat(out.bestE1RM, pr.bestE1RM, date, s.id);
      out.bestSessionVolume = beat(out.bestSessionVolume, pr.bestSessionVolume, date, s.id);
      for (const [r, w] of Object.entries(pr.repPRs)) {
        const rec = beat(reps.get(Number(r)), w, date, s.id);
        if (rec) reps.set(Number(r), rec);
      }
    } else if (BODYWEIGHT.has(type)) {
      out.bestReps = beat(out.bestReps, Math.max(0, ...sets.filter(isCounted).map((x) => x.reps ?? 0)), date, s.id);
    }
  }
  out.repPRs = [...reps].sort((a, b) => a[0] - b[0]).map(([r, record]) => ({ reps: r, record }));
  return out;
}
