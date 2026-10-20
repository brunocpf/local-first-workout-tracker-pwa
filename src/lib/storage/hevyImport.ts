import { db } from "#lib/storage/db";
import { importCompletedSessions } from "#lib/storage/sessions";
import { getSettings, saveSettings } from "#lib/storage/settings";
import type { HevyPlan } from "#lib/imports/hevy/plan";
import type { WorkoutIdentity } from "#lib/imports/duplicates";

/** Past sessions whose start lies in [`fromIso` − 10 min, `toIso` + 10 min]: all that duplicate detection can match (docs/hevy-import.md §10). */
export async function listSessionIdentitiesAround(fromIso: string, toIso: string): Promise<WorkoutIdentity[]> {
  const pad = 11 * 60_000;
  const lower = new Date(Date.parse(fromIso) - pad).toISOString();
  const upper = new Date(Date.parse(toIso) + pad).toISOString();
  const rows = await db.sessions.where("startedAt").between(lower, upper, true, true).toArray();
  return rows.filter((s) => s.status === "completed").map(({ startedAt, name }) => ({ startedAt, name }));
}

/**
 * Writes a confirmed Hevy import in one transaction: new custom exercises, the sessions (via `importCompletedSessions`)
 * and the remembered title mappings. Any failure leaves all three untouched. Returns the number of sessions written.
 */
export async function commitHevyImport(plan: HevyPlan): Promise<number> {
  return db.transaction("rw", db.exercises, db.sessions, db.settings, async () => {
    if (plan.newExercises.length > 0) await db.exercises.bulkAdd(structuredClone(plan.newExercises));
    const written = await importCompletedSessions(plan.sessions);
    const hevyExerciseMap = { ...(await getSettings()).hevyExerciseMap, ...plan.mappings };
    await saveSettings({ hevyExerciseMap });
    return written;
  });
}
