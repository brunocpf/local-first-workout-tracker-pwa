import { normalizeName } from "#lib/catalog/search";
import type { ExerciseRefV1, ProgramImportV1 } from "./programSchema";

/** The catalog fields matching reads. Any `Exercise` satisfies it. */
export type MatchableExercise = { id: string; name: string; aliases: string[]; equipment: string[]; archivedAt?: string };

export type MatchCandidate = { exerciseId: string; score: number };
export type MatchResult =
  | { status: "matched"; exerciseId: string; via: "id" | "alias" | "name" }
  | { status: "suggested"; candidates: MatchCandidate[] }
  | { status: "unresolved" };

/** Minimum fuzzy score (0..1) for a candidate to be suggested. Fuzzy results never auto-apply. */
export const SUGGEST_THRESHOLD = 0.45;
/** Added to the score when the reference's equipment hint matches the candidate's equipment. */
export const EQUIPMENT_BOOST = 0.15;
export const MAX_CANDIDATES = 3;

const trigrams = (s: string): Set<string> => {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
};

/** Sørensen–Dice coefficient (2|A∩B| / (|A|+|B|)). */
function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

/** Mean of token-set Dice and trigram Dice, both on normalized text. */
function similarity(a: string, b: string): number {
  return (dice(new Set(a.split(" ")), new Set(b.split(" "))) + dice(trigrams(a), trigrams(b))) / 2;
}

/**
 * Resolve one reference: exact id → alias → normalized name → fuzzy suggestions → unresolved.
 * Archived exercises are never matched or suggested. An id that is unknown or archived falls
 * through to `ref.name`. A normalized alias/name shared by several exercises is `suggested`.
 */
export function matchExerciseRef(ref: ExerciseRefV1, catalog: readonly MatchableExercise[]): MatchResult {
  const active = catalog.filter((x) => x.archivedAt === undefined);
  if (ref.id !== undefined && active.some((x) => x.id === ref.id)) return { status: "matched", exerciseId: ref.id, via: "id" };
  if (ref.name === undefined) return { status: "unresolved" };
  const q = normalizeName(ref.name);
  if (q === "") return { status: "unresolved" };

  const exact = new Map<string, "name" | "alias">();
  for (const x of active) {
    if (normalizeName(x.name) === q) exact.set(x.id, "name");
    else if (x.aliases.some((a) => normalizeName(a) === q)) exact.set(x.id, "alias");
  }
  if (exact.size === 1) {
    const [[exerciseId, via]] = [...exact];
    return { status: "matched", exerciseId, via };
  }

  const hint = ref.equipment === undefined ? "" : normalizeName(ref.equipment);
  const scored: MatchCandidate[] = [];
  for (const x of active) {
    let score = exact.has(x.id) ? 1 : Math.max(...[x.name, ...x.aliases].map((f) => similarity(q, normalizeName(f))));
    if (score < SUGGEST_THRESHOLD) continue;
    if (hint !== "" && x.equipment.some((e) => normalizeName(e) === hint)) score = Math.min(1, score + EQUIPMENT_BOOST);
    scored.push({ exerciseId: x.id, score: Math.round(score * 1000) / 1000 });
  }
  if (scored.length === 0) return { status: "unresolved" };
  scored.sort((a, b) => b.score - a.score || (a.exerciseId < b.exerciseId ? -1 : 1));
  return { status: "suggested", candidates: scored.slice(0, MAX_CANDIDATES) };
}

/**
 * Match every exercise reference in a program. Keys use the same paths as `unresolvedExercises`
 * (`program.routines[i].exercises[j].exercise`).
 */
export function matchProgram(data: ProgramImportV1, catalog: readonly MatchableExercise[]): Map<string, MatchResult> {
  const out = new Map<string, MatchResult>();
  data.program.routines.forEach((r, ri) =>
    r.exercises.forEach((e, ei) =>
      out.set(`program.routines[${ri}].exercises[${ei}].exercise`, matchExerciseRef(e.exercise, catalog)),
    ),
  );
  return out;
}
