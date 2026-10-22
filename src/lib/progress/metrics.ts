import { localDate } from "#lib/time";
import type { BodyMeasurement, ExerciseType, LoggedSet } from "#lib/types";

/** A set counts toward metrics when it is completed and not a warm-up. */
export const isCounted = (s: LoggedSet) =>
  s.completedAt !== undefined && s.type !== "warmup";

/** weight x reps of one counted set (kg). Missing values count as 0. */
export function setVolume(s: LoggedSet): number {
  return isCounted(s) ? (s.weight ?? 0) * (s.reps ?? 0) : 0;
}

/**
 * Latest bodyweight (kg) measured on or before the local calendar day `date` ("YYYY-MM-DD"), where each
 * measurement's day is taken in its own `timeZone`; later the same day counts. Any order. `undefined` when
 * there is none, in which case bodyweight-type exercises stay out of volume and PRs.
 */
export function bodyweightOn(measurements: readonly BodyMeasurement[], date: string): number | undefined {
  let best: BodyMeasurement | undefined;
  for (const m of measurements) {
    if (m.kind !== "bodyweight" || localDate({ startedAt: m.measuredAt, timeZone: m.timeZone }) > date) continue;
    if (!best || m.measuredAt > best.measuredAt) best = m;
  }
  return best?.value;
}

/** Types whose logged weight is relative to bodyweight (added or assistance). */
export const hasEffectiveLoad = (type: ExerciseType) => type === "weighted_bodyweight" || type === "assisted_bodyweight";

/**
 * Load actually moved (kg) by a `weighted_bodyweight` (bodyweight + added weight) or `assisted_bodyweight`
 * (bodyweight - assistance, floored at 0) set; `undefined` for other types or without a bodyweight.
 */
export function effectiveLoad(weight: number | undefined, type: ExerciseType, bodyweightKg: number | undefined): number | undefined {
  if (bodyweightKg === undefined) return undefined;
  if (type === "weighted_bodyweight") return bodyweightKg + (weight ?? 0);
  if (type === "assisted_bodyweight") return Math.max(0, bodyweightKg - (weight ?? 0));
  return undefined;
}

/**
 * The sets with `weight` replaced by the effective load, so the `weighted_reps` metrics (volume, PRs, e1RM)
 * apply unchanged; for assisted sets less assistance means a higher load, i.e. progress. Other types and an
 * unknown bodyweight return the sets untouched.
 */
export function withEffectiveLoad(sets: LoggedSet[], type: ExerciseType, bodyweightKg: number | undefined): LoggedSet[] {
  if (bodyweightKg === undefined || !hasEffectiveLoad(type)) return sets;
  return sets.map((s) => ({ ...s, weight: effectiveLoad(s.weight, type, bodyweightKg) }));
}

/**
 * Volume of an exercise's sets. `weighted_reps` always contributes. Weighted and assisted bodyweight exercises
 * contribute `effective load x reps` once a `bodyweightKg` is known and 0 until then; the other types are 0.
 */
export function exerciseVolume(
  sets: LoggedSet[],
  type: ExerciseType = "weighted_reps",
  bodyweightKg?: number,
): number {
  if (type === "weighted_reps") return sets.reduce((a, s) => a + setVolume(s), 0);
  if (bodyweightKg === undefined || !hasEffectiveLoad(type)) return 0;
  return withEffectiveLoad(sets, type, bodyweightKg).reduce((a, s) => a + setVolume(s), 0);
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
    if (volume > 0 && volume > (out.bestSessionVolume ?? 0))
      out.bestSessionVolume = volume;
    for (const s of sets) {
      const { weight, reps } = s;
      if (!isCounted(s) || !weight || weight <= 0 || !reps || reps < 1)
        continue;
      if (weight > (out.maxWeight ?? 0)) out.maxWeight = weight;
      if (reps <= 12 && weight > (out.repPRs[reps] ?? 0))
        out.repPRs[reps] = weight;
      const e = estimated1RM(weight, reps);
      if (e !== undefined && e > (out.bestE1RM ?? 0)) out.bestE1RM = e;
    }
  }
  return out;
}

/** One exercise's counted sets in one session, with the session's start time (ISO 8601). */
export type PrSession = { startedAt: string; sets: LoggedSet[] };

export type PrKind = "maxWeight" | "repMax" | "e1rm" | "sessionVolume";

export type PrEvent = {
  kind: PrKind;
  /** Exact rep count, for `repMax` only. */
  reps?: number;
  /** The new best: kg for maxWeight/repMax, estimated kg for e1rm, kg x reps for sessionVolume. */
  value: number;
  /** The set that achieved it (absent for `sessionVolume`, which is a sum over sets). */
  set?: LoggedSet;
};

export type SessionPrs = { startedAt: string; prs: PrEvent[] };

const validSet = (s: LoggedSet) =>
  isCounted(s) && !!s.weight && s.weight > 0 && !!s.reps && s.reps >= 1;

/**
 * New PRs per session for one `weighted_reps` exercise; `sessionsChronological` is oldest first.
 * A set is a new PR only if it strictly beats the best from *earlier sessions* (ties and
 * within-session progression do not count). Until an earlier session has a counted set
 * (the first session) nothing is flagged: there is no baseline to beat. After that, a rep count
 * never done before is a PR. Always recomputed from raw sets, never stored.
 */
export function prTimeline(sessionsChronological: PrSession[]): SessionPrs[] {
  const prior: LoggedSet[][] = [];
  let hasHistory = false;
  return sessionsChronological.map(({ startedAt, sets }) => {
    const prs = hasHistory ? prsAgainst(personalRecords(prior), sets) : [];
    prior.push(sets);
    if (sets.some(validSet)) hasHistory = true;
    return { startedAt, prs };
  });
}

/**
 * New PRs of one session's sets against the records of everything before it (`before`); the caller has
 * checked there is any baseline. One pass over `before` and `sets`, so the logger can ask on every change.
 */
export function prsAgainst(before: PersonalRecords, sets: LoggedSet[]): PrEvent[] {
  const prs: PrEvent[] = [];
  const best = {
    maxWeight: { v: before.maxWeight ?? 0, set: undefined as LoggedSet | undefined },
    e1rm: { v: before.bestE1RM ?? 0, set: undefined as LoggedSet | undefined },
  };
  const rep: Record<number, { v: number; set?: LoggedSet }> = {};
  for (const s of sets) {
    if (!validSet(s)) continue;
    const weight = s.weight!;
    const reps = s.reps!;
    if (weight > best.maxWeight.v) best.maxWeight = { v: weight, set: s };
    if (reps <= 12 && weight > (rep[reps]?.v ?? before.repPRs[reps] ?? 0)) rep[reps] = { v: weight, set: s };
    const e = estimated1RM(weight, reps);
    if (e !== undefined && e > best.e1rm.v) best.e1rm = { v: e, set: s };
  }
  if (best.maxWeight.set) prs.push({ kind: "maxWeight", value: best.maxWeight.v, set: best.maxWeight.set });
  for (const [r, { v, set }] of Object.entries(rep).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    prs.push({ kind: "repMax", reps: Number(r), value: v, set });
  }
  if (best.e1rm.set) prs.push({ kind: "e1rm", value: best.e1rm.v, set: best.e1rm.set });
  const volume = exerciseVolume(sets);
  if (volume > 0 && volume > (before.bestSessionVolume ?? 0)) prs.push({ kind: "sessionVolume", value: volume });
  return prs;
}

/** Whether any earlier session has a counted set, i.e. there is a baseline for `prsAgainst`. */
export const hasPrBaseline = (sessions: readonly PrSession[]) => sessions.some((s) => s.sets.some(validSet));

/** PRs from sessions that started strictly before `beforeIso`, for live "is this a PR?" checks. */
export function prsBefore(
  sessions: PrSession[],
  beforeIso: string,
): PersonalRecords {
  const cutoff = Date.parse(beforeIso);
  return personalRecords(
    sessions.filter((s) => Date.parse(s.startedAt) < cutoff).map((s) => s.sets),
  );
}
