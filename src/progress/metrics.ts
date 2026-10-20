import type { CompletedSet } from "../types";

/** Volume of one completed weighted set: weight x reps. Others count as 0. */
export function setVolume(s: CompletedSet): number {
  if (!s.completed || s.type === "warmup") return 0;
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export const exerciseVolume = (sets: CompletedSet[]) => sets.reduce((a, s) => a + setVolume(s), 0);

/** Epley estimate; only defined for 1..12 reps (see docs/data-model.md). */
export function estimated1RM(weight: number, reps: number): number | undefined {
  if (weight <= 0 || reps < 1 || reps > 12) return undefined;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Remaining whole seconds for a timestamp-based rest timer. */
export const remainingSeconds = (endsAt: number, now = Date.now()) =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));
