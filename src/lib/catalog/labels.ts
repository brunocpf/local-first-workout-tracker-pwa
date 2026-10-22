import { en, type MessageKey } from "#lib/messages";
import { t } from "#lib/i18n.svelte";

type Group = "muscle" | "equipment" | "type" | "setType" | "measure";

/** Display label for a vocabulary id; ids outside the vocabulary (custom or imported) are humanized. */
function label(group: Group, id: string): string {
  const key = `${group}.${id}`;
  if (key in en) return t(key as MessageKey);
  const s = id.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const muscleLabel = (id: string) => label("muscle", id);
export const equipmentLabel = (id: string) => label("equipment", id);
export const exerciseTypeLabel = (id: string) => label("type", id);
export const setTypeLabel = (id: string) => label("setType", id);

/** "Barbell · Quads", for list subtitles. */
export const joinLabels = (labels: string[]) => labels.join(" · ");

export const measurementLabel = (kind: string) => label("measure", kind);
