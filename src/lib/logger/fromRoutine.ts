import type { NewSession } from "#lib/storage/sessions";
import { createSessionExercise } from "#lib/logger/workout";
import type { Exercise, Routine } from "#lib/types";

export type SessionFromRoutine = {
  session: NewSession;
  /** Routine exercises whose exercise is missing from the catalog. They are left out of `session`. */
  skippedExerciseIds: string[];
};

/** Deep-copy into plain JSON data, so the result never aliases the routine or a `$state` proxy. */
const toPlain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Builds the input for `startSession` from a routine. The prescription is copied, so editing or deleting
 * the routine later never changes the session (ADR 0004). Exercises missing from `exercisesById` are skipped and reported.
 */
export function sessionInputFromRoutine(
  routine: Routine,
  exercisesById: ReadonlyMap<string, Pick<Exercise, "name" | "exerciseType">>,
): SessionFromRoutine {
  const plain = toPlain(routine);
  const exercises: NewSession["exercises"] = [];
  const skippedExerciseIds: string[] = [];

  for (const re of plain.exercises) {
    const exercise = exercisesById.get(re.exerciseId);
    if (!exercise) {
      skippedExerciseIds.push(re.exerciseId);
      continue;
    }
    exercises.push(
      createSessionExercise(
        { id: re.exerciseId, name: exercise.name, exerciseType: exercise.exerciseType },
        {
          prescribedSets: re.prescribedSets,
          restSeconds: re.restSeconds,
          supersetGroupId: re.supersetGroupId,
          notes: re.notes,
        },
      ),
    );
  }

  const session: NewSession = {
    name: plain.name,
    routineId: plain.id,
    routineNameSnapshot: plain.name,
    exercises,
  };
  if (plain.programId !== undefined) session.programId = plain.programId;

  return { session, skippedExerciseIds };
}
