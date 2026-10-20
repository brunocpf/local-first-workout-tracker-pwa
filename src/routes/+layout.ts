import { initSettings } from "#lib/settings.svelte";
import { active } from "#lib/logger/activeSession.svelte";
import { db } from "#lib/storage/db";

export const ssr = false;
export const prerender = false;

/**
 * Restore an interrupted workout before first render (PRD §8.7). Never throws; failures land in `active.error`.
 * Stops waiting once the database reports a problem (open error, blocked, hung open) so AppStatus can explain it;
 * the restore keeps running and fills in its state if the database recovers.
 */
export async function load() {
  await Promise.race([Promise.all([initSettings(), active.load()]), db.untilProblem()]);
}
