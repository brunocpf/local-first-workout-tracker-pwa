// Substitutes for swapping an exercise mid-workout (PRD §4, T8.21). Pure: the caller supplies the catalog.
import type { Exercise } from "#lib/types";

export type SubstituteOptions = {
  /** Exercises to leave out, typically the ones already in the workout. */
  excludeIds?: readonly string[];
  /** Maximum number of suggestions (default 8). */
  limit?: number;
};

const sharesMuscle = (a: Exercise, b: Exercise) => a.primaryMuscles.some((m) => b.primaryMuscles.includes(m));
const compareName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

/**
 * Same movement pattern and primary muscle first, then any exercise training the same primary muscle.
 * Within each tier, the same exercise type (so the logged fields still make sense) comes first, then favorites, then name.
 * The exercise itself, archived exercises and `excludeIds` are never suggested.
 */
export function suggestSubstitutes(exercise: Exercise, catalog: readonly Exercise[], opts: SubstituteOptions = {}): Exercise[] {
  const excluded = new Set(opts.excludeIds);
  const tier = (c: Exercise) => {
    if (!sharesMuscle(exercise, c)) return undefined;
    return exercise.movementPattern !== undefined && c.movementPattern === exercise.movementPattern ? 0 : 1;
  };
  return catalog
    .filter((c) => c.id !== exercise.id && !c.archivedAt && !excluded.has(c.id))
    .flatMap((c) => {
      const t = tier(c);
      return t === undefined ? [] : [{ c, t }];
    })
    .sort(
      (a, b) =>
        a.t - b.t ||
        Number(b.c.exerciseType === exercise.exerciseType) - Number(a.c.exerciseType === exercise.exerciseType) ||
        Number(!!b.c.favorite) - Number(!!a.c.favorite) ||
        compareName(a.c, b.c),
    )
    .slice(0, opts.limit ?? 8)
    .map(({ c }) => c);
}
