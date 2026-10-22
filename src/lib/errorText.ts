import { t } from "#lib/i18n.svelte";
import type { MessageKey } from "#lib/messages";

/** English messages thrown or returned by domain code, mapped to the key that renders them in the app language. */
const KNOWN: Record<string, MessageKey> = {
  "Name is required.": "err.nameRequired",
  "Routine has no exercises.": "err.noExercises",
  "Rest must be positive.": "err.restPositive",
  "No sets.": "err.noSets",
  "Reps must be positive.": "err.repsPositive",
  "Min reps exceed max reps.": "err.repsRange",
  "Value must be positive.": "err.valuePositive",
  "RIR cannot be negative.": "err.rirNegative",
  "The session has invalid data": "err.sessionInvalid",
  "Start and end times must be valid": "err.timesInvalid",
  "A workout can't end before it starts": "err.endBeforeStart",
  "Unknown time zone": "err.zone",
  "Nothing to share: add exercises with sets first.": "err.shareNothing",
  "This link's content is too large.": "err.linkContentLarge",
  "This browser can't create share links.": "err.noCreateLinks",
  "This plan is too large to share.": "err.planLarge",
  "This browser can't open share links.": "err.noOpenLinks",
  "This link is too large to import.": "err.linkLarge",
  "This link is damaged or incomplete.": "err.linkDamaged",
};

/** The message in the app language when it is a known one (e.g. `InvalidSessionEditError`); anything else is shown as it is. */
export const errorText = (message: string): string => {
  const key = KNOWN[message];
  return key ? t(key) : message;
};
