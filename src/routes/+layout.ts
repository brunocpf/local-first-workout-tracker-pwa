import { initSettings } from "#lib/settings.svelte";
import { active } from "#lib/logger/activeSession.svelte";

export const ssr = false;
export const prerender = false;

/** Restore an interrupted workout before first render (PRD §8.7). Never throws; failures land in `active.error`. */
export async function load() {
  await Promise.all([initSettings(), active.load()]);
}
