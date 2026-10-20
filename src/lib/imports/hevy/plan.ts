import type { DuplicateMatch } from "#lib/imports/duplicates";
import { resolveHevyName, type HevyNameResolution } from "#lib/imports/hevy/exerciseMap";
import type { HevyExerciseSummary } from "#lib/imports/hevy/normalize";
import { newId } from "#lib/ids";
import type { Exercise, SessionExercise, WorkoutSession } from "#lib/types";

/**
 * Review state of a Hevy import -> what will be written (docs/hevy-import.md §5, §10). Pure: nothing here touches Dexie,
 * so the import screen can recompute it on every change and nothing is saved before the user confirms.
 */

/** The user's decision for one distinct Hevy exercise title. `undefined` = not decided yet. */
export type HevyChoice = { kind: "exercise"; exerciseId: string } | { kind: "create" } | { kind: "skip" };

export type HevyChoiceSource = "remembered" | "matched";

export interface HevyInitialChoices {
  /** Result of the name resolver per Hevy title (suggestions for the UI). */
  resolutions: Record<string, HevyNameResolution>;
  /** Pre-selected choices: remembered mappings, then exact matches. Everything else needs a decision. */
  choices: Record<string, HevyChoice>;
  sources: Record<string, HevyChoiceSource>;
}

export type HevyCatalogExercise = Pick<Exercise, "id" | "name" | "aliases" | "equipment" | "exerciseType" | "archivedAt">;

/** Remembered mappings win over the resolver; one pointing at a missing or archived exercise is ignored. */
export function initialChoices(
  exercises: readonly HevyExerciseSummary[],
  catalog: readonly HevyCatalogExercise[],
  remembered: Readonly<Record<string, string>> = {},
): HevyInitialChoices {
  const active = new Set(catalog.filter((x) => x.archivedAt === undefined).map((x) => x.id));
  const out: HevyInitialChoices = { resolutions: {}, choices: {}, sources: {} };
  for (const { title } of exercises) {
    const resolution = resolveHevyName(title, catalog);
    out.resolutions[title] = resolution;
    const known = Object.hasOwn(remembered, title) ? remembered[title] : undefined;
    if (known !== undefined && active.has(known)) {
      out.choices[title] = { kind: "exercise", exerciseId: known };
      out.sources[title] = "remembered";
    } else if (resolution.status === "matched") {
      out.choices[title] = { kind: "exercise", exerciseId: resolution.exerciseId };
      out.sources[title] = "matched";
    }
  }
  return out;
}

/** Exact duplicates are skipped by default; possible duplicates are imported unless the user deselects them. */
export const includeByDefault = (m: DuplicateMatch): boolean => m.status !== "duplicate";

export interface HevyPlanInput {
  drafts: readonly WorkoutSession[];
  exercises: readonly HevyExerciseSummary[];
  /** Per Hevy title. A missing entry is undecided. */
  choices: Readonly<Record<string, HevyChoice | undefined>>;
  catalog: readonly HevyCatalogExercise[];
  /** One per draft, from `findDuplicates`. */
  duplicates: readonly DuplicateMatch[];
  /** Per draft id: the user's override of `includeByDefault`. */
  include: Readonly<Record<string, boolean | undefined>>;
  /** Ids for exercises to create, per title. Missing titles get a fresh id (written into the map, so it stays stable). */
  createdIds: Map<string, string>;
  /** Used for `createdAt`/`updatedAt` of created exercises. */
  now?: Date;
}

export interface HevyPlan {
  /** Sessions to write, exercise ids and snapshots resolved. Empty sessions are already dropped. */
  sessions: WorkoutSession[];
  /** Custom exercises to create (title verbatim). */
  newExercises: Exercise[];
  /** Hevy title -> exercise id for choices worth remembering (`hevyExerciseMap`). */
  mappings: Record<string, string>;
  /** Hevy titles in imported workouts that still need a decision. */
  undecided: string[];
  counts: {
    workouts: number;
    sets: number;
    /** Sets dropped because their exercise was skipped. */
    skippedSets: number;
    /** Selected workouts left with nothing to import because every exercise was skipped. */
    emptiedWorkouts: number;
    /** Workouts the user (or the default) left out. */
    deselectedWorkouts: number;
  };
}

export function buildHevyPlan(input: HevyPlanInput): HevyPlan {
  const { drafts, choices, duplicates, include, createdIds } = input;
  const catalogById = new Map(input.catalog.map((x) => [x.id, x]));
  const summaryByTitle = new Map(input.exercises.map((e) => [e.title, e]));
  const now = (input.now ?? new Date()).toISOString();

  const selected = drafts.filter((d, i) => include[d.id] ?? includeByDefault(duplicates[i] ?? { status: "new" }));
  const undecided = new Set<string>();
  for (const d of selected)
    for (const e of d.exercises) {
      const c = choices[e.exerciseNameSnapshot];
      if (c === undefined || (c.kind === "exercise" && !catalogById.has(c.exerciseId))) undecided.add(e.exerciseNameSnapshot);
    }

  const newExercises: Exercise[] = [];
  const created = new Map<string, Exercise>();
  const createFor = (title: string): Exercise => {
    let x = created.get(title);
    if (x === undefined) {
      let id = createdIds.get(title);
      if (id === undefined) createdIds.set(title, (id = newId()));
      x = {
        id,
        name: title,
        aliases: [],
        primaryMuscles: [],
        secondaryMuscles: [],
        equipment: [],
        exerciseType: summaryByTitle.get(title)?.inferredType ?? "weighted_reps",
        isCustom: true,
        createdAt: now,
        updatedAt: now,
      };
      created.set(title, x);
      newExercises.push(x);
    }
    return x;
  };

  const sessions: WorkoutSession[] = [];
  const titleOf = new Map<string, string>(); // session exercise id -> Hevy title
  let sets = 0;
  let skippedSets = 0;
  let emptiedWorkouts = 0;
  if (undecided.size === 0) {
    for (const d of selected) {
      const exercises: SessionExercise[] = [];
      for (const e of d.exercises) {
        const title = e.exerciseNameSnapshot;
        const c = choices[title] as HevyChoice;
        if (c.kind === "skip") {
          skippedSets += e.sets.length;
          continue;
        }
        const target = c.kind === "create" ? createFor(title) : (catalogById.get(c.exerciseId) as HevyCatalogExercise);
        titleOf.set(e.id, title);
        exercises.push({
          ...e,
          exerciseId: target.id,
          exerciseNameSnapshot: target.name,
          exerciseTypeSnapshot: target.exerciseType,
        });
      }
      if (exercises.length === 0) {
        emptiedWorkouts++;
        continue;
      }
      // A superset needs two members; skipping one leaves the other standing alone.
      const members = new Map<string, number>();
      for (const e of exercises) if (e.supersetGroupId) members.set(e.supersetGroupId, (members.get(e.supersetGroupId) ?? 0) + 1);
      for (const e of exercises) if (e.supersetGroupId && (members.get(e.supersetGroupId) ?? 0) < 2) delete e.supersetGroupId;
      sets += exercises.reduce((n, e) => n + e.sets.length, 0);
      sessions.push({ ...d, exercises });
    }
  } else {
    // Counts for a plan that can't be committed yet: leave the rest empty rather than guess.
    for (const d of selected) sets += d.exercises.reduce((n, e) => n + e.sets.length, 0);
  }

  // Only titles that appear in the imported workouts are remembered.
  const mappings: Record<string, string> = {};
  for (const title of new Set(sessions.flatMap((s) => s.exercises.map((e) => titleOf.get(e.id) as string)))) {
    const c = choices[title];
    if (c?.kind === "create") mappings[title] = (created.get(title) as Exercise).id;
    else if (c?.kind === "exercise") mappings[title] = c.exerciseId;
  }

  return {
    sessions,
    newExercises,
    mappings,
    undecided: [...undecided].sort((a, b) => a.localeCompare(b)),
    counts: {
      workouts: undecided.size === 0 ? sessions.length : selected.length,
      sets,
      skippedSets,
      emptiedWorkouts,
      deselectedWorkouts: drafts.length - selected.length,
    },
  };
}
