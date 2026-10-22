import { completedSessionsWithExercise } from "#lib/storage/sessions";
import { hasPrBaseline, personalRecords, prsAgainst, type PersonalRecords, type PrEvent, type PrSession } from "#lib/progress/metrics";
import { formatNumber } from "#lib/numberInput";
import { displayWeight } from "#lib/units";
import type { LoggedSet, WeightUnit, WorkoutSession } from "#lib/types";

/** One exercise's sets across a session (an exercise can appear more than once). */
const setsOf = (s: Pick<WorkoutSession, "exercises">, exerciseId: string) =>
  s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);

/** Sessions that started strictly before `current`, as `PrSession`s (oldest first order is not required). */
export function priorPrSessions(sessions: readonly WorkoutSession[], exerciseId: string, current: Pick<WorkoutSession, "id" | "startedAt">): PrSession[] {
  return sessions
    .filter((s) => s.id !== current.id && s.status === "completed" && s.startedAt < current.startedAt)
    .map((s) => ({ startedAt: s.startedAt, sets: setsOf(s, exerciseId) }))
    .filter((s) => s.sets.length > 0);
}

/** What a session must beat to set a PR: the records of `prior`, or undefined without history (nothing is flagged then). */
export function prBaseline(prior: readonly PrSession[]): PersonalRecords | undefined {
  return hasPrBaseline(prior) ? personalRecords(prior.map((s) => s.sets)) : undefined;
}

/** New PRs of `current` for one `weighted_reps` exercise (PRD §10.1: strictly beats earlier sessions; none without history). */
export function newPrs(prior: readonly PrSession[], current: PrSession): PrEvent[] {
  const baseline = prBaseline(prior);
  return baseline ? prsAgainst(baseline, current.sets) : [];
}

/** Ids of the sets in `current` that are a new PR; the logger and history badge these. Recomputed, never stored. */
export function prSetIds(prior: readonly PrSession[], current: PrSession): Set<string> {
  return prSetIdsAgainst(prBaseline(prior), current.sets);
}

/** Like `prSetIds` with the baseline computed once, so the logger can re-ask on every change without rescanning history. */
export function prSetIdsAgainst(baseline: PersonalRecords | undefined, sets: LoggedSet[]): Set<string> {
  return new Set(baseline ? prsAgainst(baseline, sets).flatMap((p) => (p.set ? [p.set.id] : [])) : []);
}

export type ExercisePrs = { exerciseId: string; name: string; prs: PrEvent[] };

/** Completed sessions with the exercise that started before `session` (what the logger compares against). */
export async function loadPriorPrSessions(exerciseId: string, session: Pick<WorkoutSession, "id" | "startedAt">): Promise<PrSession[]> {
  return priorPrSessions(await completedSessionsWithExercise(exerciseId), exerciseId, session);
}

/** New PRs per `weighted_reps` exercise of a session, from storage. Exercises without a PR are omitted. */
export async function loadSessionPrs(session: WorkoutSession): Promise<ExercisePrs[]> {
  const out: ExercisePrs[] = [];
  const seen = new Set<string>();
  for (const ex of session.exercises) {
    if (ex.exerciseTypeSnapshot !== "weighted_reps" || seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    const prior = await loadPriorPrSessions(ex.exerciseId, session);
    const prs = newPrs(prior, { startedAt: session.startedAt, sets: setsOf(session, ex.exerciseId) });
    if (prs.length > 0) out.push({ exerciseId: ex.exerciseId, name: ex.exerciseNameSnapshot, prs });
  }
  return out;
}

/** Short label for one PR, e.g. `Max weight 100 kg`, `5-rep max 90 kg`, `Est. 1RM 116.7 kg`, `Session volume 2,400 kg`. */
export function describePr(pr: PrEvent, unit: WeightUnit): string {
  const kg = `${formatNumber(displayWeight(pr.value, unit))} ${unit}`;
  switch (pr.kind) {
    case "maxWeight":
      return `Max weight ${kg}`;
    case "repMax":
      return `${pr.reps}-rep max ${kg}`;
    case "e1rm":
      return `Est. 1RM ${kg}`;
    case "sessionVolume":
      return `Session volume ${kg}`;
  }
}
