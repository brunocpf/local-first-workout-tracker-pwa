import { normalizeName } from "#lib/catalog/search";
import { matchExerciseRef, type MatchableExercise, type MatchCandidate, type MatchResult } from "#lib/imports/matchExercises";

/**
 * Hevy `exercise_title` → built-in catalog id, for titles that are exact equivalents only.
 * Keys are normalized (`normalizeName`). A near miss (different equipment, attachment or
 * variation) is deliberately absent so the user decides. See docs/hevy-import.md §5.
 */
const HEVY_TITLE_TO_ID: Readonly<Record<string, string>> = {
  "bent over row barbell": "barbell_row",
  "lat pulldown cable": "lat_pulldown",
  "lat pulldown machine": "lat_pulldown",
  "lat pulldown close grip cable": "close_grip_lat_pulldown",
  "straight arm lat pulldown cable": "straight_arm_pulldown",
  "shrug dumbbell": "dumbbell_shrug",
  "bench press barbell": "barbell_bench_press",
  "incline bench press dumbbell": "incline_dumbbell_press",
  "chest press machine": "machine_chest_press",
  "chest fly machine": "pec_deck",
  "shoulder press dumbbell": "seated_dumbbell_press",
  "lateral raise dumbbell": "dumbbell_lateral_raise",
  "triceps rope pushdown": "triceps_pushdown",
  "bicep curl dumbbell": "dumbbell_curl",
  "squat barbell": "back_squat",
  "romanian deadlift barbell": "romanian_deadlift",
  "leg press machine": "leg_press",
  "leg extension machine": "leg_extension",
  "lying leg curl machine": "lying_leg_curl",
  "seated leg curl machine": "seated_leg_curl",
  "standing calf raise machine": "standing_calf_raise",
  "standing cable glute kickbacks": "cable_glute_kickback",
  "t bar row": "t_bar_row",
};

export type HevyNameResolution =
  | { status: "matched"; exerciseId: string; via: "table" | "id" | "alias" | "name" }
  | Exclude<MatchResult, { status: "matched" }>;

/** `Name (Equipment)` → base name and the parenthesised hint. No trailing group → no hint. */
export function splitHevyTitle(title: string): { base: string; hint?: string } {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(title.trim());
  if (m === null || m[2].trim() === "") return { base: title.trim() };
  return { base: m[1].trim(), hint: m[2].trim() };
}

const hintMatches = (hint: string, x: MatchableExercise) => {
  const h = normalizeName(hint).replace(/ /g, "_");
  return x.equipment.some((e) => normalizeName(e).replace(/ /g, "_") === h);
};

/**
 * Resolve one distinct Hevy exercise title. Order: curated table → full title → base name with
 * the equipment hint. Only exact table/name/alias hits are `matched`; an exact base-name hit whose
 * equipment contradicts (or can't confirm) the bracket text is downgraded to a suggestion, so
 * `Crunch (Machine)` never silently becomes the bodyweight `Crunch`.
 */
export function resolveHevyName(title: string, catalog: readonly MatchableExercise[]): HevyNameResolution {
  const active = catalog.filter((x) => x.archivedAt === undefined);
  const tabled = HEVY_TITLE_TO_ID[normalizeName(title)];
  if (tabled !== undefined && active.some((x) => x.id === tabled)) return { status: "matched", exerciseId: tabled, via: "table" };

  const full = matchExerciseRef({ name: title }, active);
  if (full.status === "matched") return full;

  const { base, hint } = splitHevyTitle(title);
  if (hint === undefined) return full;

  const byBase = matchExerciseRef({ name: base, equipment: hint }, active);
  if (byBase.status !== "matched") return byBase.status === "suggested" || full.status === "unresolved" ? byBase : full;
  const x = active.find((a) => a.id === byBase.exerciseId);
  if (x !== undefined && hintMatches(hint, x)) return byBase;
  const candidates: MatchCandidate[] = [{ exerciseId: byBase.exerciseId, score: 0.9 }];
  return { status: "suggested", candidates };
}
