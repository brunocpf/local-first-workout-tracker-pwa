import { SEED_EXERCISES_BY_ID } from "#lib/catalog/seed";
import { SEED_PT_BR } from "#lib/catalog/seed.pt-BR";
import { i18n, type Locale } from "#lib/i18n.svelte";
import type { Exercise } from "#lib/types";

type Localizable = Pick<Exercise, "id" | "name" | "aliases" | "isCustom"> & Partial<Pick<Exercise, "instructions" | "formCues">>;

const unique = (list: string[]) => [...new Set(list)];

/**
 * Display copy of a built-in exercise in `locale`; custom exercises, other locales and unknown ids come back
 * unchanged. A field the user changed (it differs from the seed text) is kept as they wrote it. The English
 * name and aliases stay searchable as aliases. Never write the result back to storage.
 */
export function localizeExercise<T extends Localizable>(ex: T, locale: Locale = i18n.locale): T {
  const pt = locale === "pt-BR" && !ex.isCustom ? SEED_PT_BR[ex.id] : undefined;
  const seed = SEED_EXERCISES_BY_ID.get(ex.id);
  if (!pt || !seed) return ex;
  const edited = ex.name !== seed.name;
  return {
    ...ex,
    name: edited ? ex.name : pt.name,
    aliases: unique([...(edited ? [] : pt.aliases), ...(edited ? [] : [ex.name]), ...ex.aliases, ...pt.aliases]),
    ...(ex.instructions === seed.instructions ? { instructions: pt.instructions } : {}),
    ...(ex.formCues === undefined || JSON.stringify(ex.formCues) === JSON.stringify(seed.formCues) ? { formCues: pt.formCues } : {}),
  };
}

export const localizeExercises = <T extends Localizable>(list: readonly T[], locale: Locale = i18n.locale): T[] =>
  locale === "pt-BR" ? list.map((e) => localizeExercise(e, locale)) : [...list];

/**
 * Name to show for an exercise referenced by a snapshot (session or routine). Snapshots are never rewritten:
 * a built-in exercise whose snapshot still holds the seed English name is shown in the current language.
 */
export function exerciseLabel(exerciseId: string, snapshotName: string, locale: Locale = i18n.locale): string {
  if (locale !== "pt-BR") return snapshotName;
  const seed = SEED_EXERCISES_BY_ID.get(exerciseId);
  return seed && seed.name === snapshotName ? (SEED_PT_BR[exerciseId]?.name ?? snapshotName) : snapshotName;
}
