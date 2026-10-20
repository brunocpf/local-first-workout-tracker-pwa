import type { ExerciseType, LoggedSet } from "#lib/types";

/** A set counts toward metrics when it is completed and not a warm-up. */
export const isCounted = (s: LoggedSet) => s.completedAt !== undefined && s.type !== "warmup";

/** weight x reps of one counted set (kg). Missing values count as 0. */
export function setVolume(s: LoggedSet): number {
  return isCounted(s) ? (s.weight ?? 0) * (s.reps ?? 0) : 0;
}

/**
 * Volume of an exercise's sets. Only `weighted_reps` contributes: bodyweight-type exercises
 * need a bodyweight measurement to be meaningful and are excluded (0) until one exists.
 */
export function exerciseVolume(sets: LoggedSet[], type: ExerciseType = "weighted_reps"): number {
  return type === "weighted_reps" ? sets.reduce((a, s) => a + setVolume(s), 0) : 0;
}

/** Epley estimate; only defined for 1..12 reps (see docs/data-model.md). */
export function estimated1RM(weight: number, reps: number): number | undefined {
  if (weight <= 0 || reps < 1 || reps > 12) return undefined;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export type PersonalRecords = {
  maxWeight?: number;
  /** Best weight for each exact rep count 1..12. */
  repPRs: Record<number, number>;
  bestE1RM?: number;
  bestSessionVolume?: number;
};

/** PRs for one `weighted_reps` exercise, from its sets grouped per session. Always recomputed, never stored. */
export function personalRecords(sessions: LoggedSet[][]): PersonalRecords {
  const out: PersonalRecords = { repPRs: {} };
  for (const sets of sessions) {
    const volume = exerciseVolume(sets);
    if (volume > 0 && volume > (out.bestSessionVolume ?? 0)) out.bestSessionVolume = volume;
    for (const s of sets) {
      const { weight, reps } = s;
      if (!isCounted(s) || !weight || weight <= 0 || !reps || reps < 1) continue;
      if (weight > (out.maxWeight ?? 0)) out.maxWeight = weight;
      if (reps <= 12 && weight > (out.repPRs[reps] ?? 0)) out.repPRs[reps] = weight;
      const e = estimated1RM(weight, reps);
      if (e !== undefined && e > (out.bestE1RM ?? 0)) out.bestE1RM = e;
    }
  }
  return out;
}
