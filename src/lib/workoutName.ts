import { t } from "#lib/i18n.svelte";
import { defaultWorkoutName } from "#lib/time";

/** Default name for a new blank workout, in the app language. */
export const localizedWorkoutName = (now = new Date()) => defaultWorkoutName(now, (part) => t(`workout.name.${part}`));
