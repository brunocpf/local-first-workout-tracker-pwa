// Previous values and set prefill (PRD §8.4). Alignment and prefill are pure; only the loader reads Dexie.
import { newestCompletedSessionWith } from "#lib/storage/sessions";
import type { LoggedSet, PrescribedSet, SetType, WorkoutSession } from "#lib/types";

export type SetGroup = "warmup" | "working";
export type SetValues = { weight?: number; reps?: number };

/** Warm-ups only match warm-ups; normal/drop/failure sets all match each other. */
export const setGroupOf = (type: SetType): SetGroup => (type === "warmup" ? "warmup" : "working");

/**
 * For each current set, the previous set it lines up with (or undefined). Set N matches previous set N within
 * the same group; extra sets reuse the group's last previous set. Previous sets without `completedAt` are ignored.
 */
export function alignPrevious(
  currentSets: readonly Pick<LoggedSet, "type">[],
  previousSets: readonly LoggedSet[],
): (LoggedSet | undefined)[] {
  const prev: Record<SetGroup, LoggedSet[]> = { warmup: [], working: [] };
  for (const p of previousSets) if (p.completedAt) prev[setGroupOf(p.type)].push(p);
  const seen: Record<SetGroup, number> = { warmup: 0, working: 0 };
  return currentSets.map((s) => {
    const g = setGroupOf(s.type);
    const list = prev[g];
    const n = seen[g]++;
    return list[n] ?? list.at(-1);
  });
}

/**
 * Sets (completed or not) for the exercise from the most recent completed session that has any completed set of it,
 * all occurrences concatenated in order. Pass the active session's id as `excludeSessionId`.
 */
export async function loadPreviousSets(exerciseId: string, opts: { excludeSessionId?: string } = {}): Promise<LoggedSet[]> {
  const setsOf = (s: WorkoutSession) => s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
  const session = await newestCompletedSessionWith(exerciseId, (s) => s.id !== opts.excludeSessionId && setsOf(s).some((x) => x.completedAt));
  return session ? setsOf(session) : [];
}

/** Previous values first (each field independently), else the prescription (target weight, lower bound of rep range), else nothing. */
export function prefillFor(
  _set: Pick<LoggedSet, "type">,
  previous?: Pick<LoggedSet, "weight" | "reps">,
  prescribed?: Pick<PrescribedSet, "targetWeight" | "repRange">,
): SetValues {
  const out: SetValues = {};
  const weight = previous?.weight ?? prescribed?.targetWeight;
  const reps = previous?.reps ?? prescribed?.repRange?.[0];
  if (weight !== undefined) out.weight = weight;
  if (reps !== undefined) out.reps = reps;
  return out;
}
