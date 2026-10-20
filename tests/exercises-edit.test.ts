import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { AppDB } from "#lib/storage/db";
import {
  createCustomExercise,
  deleteCustomExercise,
  ensureCatalogSeeded,
  ExerciseInUseError,
  isExerciseReferenced,
  updateCustomExercise,
} from "#lib/storage/exercises";
import type { WorkoutSession } from "#lib/types";

let n = 0;
let d: AppDB;
beforeEach(async () => {
  d = new AppDB(`exercises-edit-test-${Date.now()}-${n++}`);
  await ensureCatalogSeeded(d);
});
afterEach(async () => {
  d.close();
  await d.delete();
});

const now = "2026-01-01T10:00:00.000Z";

/** A completed session row with snapshots, as the logger would write it. */
function sessionWith(exerciseId: string, name: string, type: WorkoutSession["exercises"][number]["exerciseTypeSnapshot"]): WorkoutSession {
  return {
    id: `s-${exerciseId}`,
    name: "Push day",
    status: "completed",
    startedAt: now,
    endedAt: now,
    timeZone: "UTC",
    exercises: [
      {
        id: "se-1",
        exerciseId,
        exerciseNameSnapshot: name,
        exerciseTypeSnapshot: type,
        sets: [],
      },
    ],
    exerciseIds: [exerciseId],
    createdAt: now,
    updatedAt: now,
  };
}

describe("updateCustomExercise", () => {
  it("renames a custom exercise but leaves past session name snapshots unchanged", async () => {
    const c = await createCustomExercise({ name: "Zercher Hold", exerciseType: "duration" }, d);
    const past = sessionWith(c.id, "Zercher Hold", "duration");
    await d.sessions.put(past);

    const updated = await updateCustomExercise(c.id, { name: "  Zercher Squat  " }, d);

    expect(updated.name).toBe("Zercher Squat");
    expect((await d.exercises.get(c.id))!.name).toBe("Zercher Squat");
    expect(await d.sessions.get(past.id)).toEqual(past);
    expect((await d.sessions.get(past.id))!.exercises[0].exerciseNameSnapshot).toBe("Zercher Hold");
  });

  it("edits muscles, equipment, aliases and type on custom exercises", async () => {
    const c = await createCustomExercise({ name: "Sled Push", exerciseType: "distance" }, d);
    const updated = await updateCustomExercise(
      c.id,
      {
        primaryMuscles: ["quads"],
        secondaryMuscles: ["glutes"],
        equipment: ["sled"],
        aliases: ["prowler", "prowler", "prowler"],
        exerciseType: "weighted_reps",
      },
      d,
    );
    expect(updated).toMatchObject({
      primaryMuscles: ["quads"],
      secondaryMuscles: ["glutes"],
      equipment: ["sled"],
      aliases: ["prowler"],
      exerciseType: "weighted_reps",
    });
    expect((await d.exercises.get(c.id))!.updatedAt).not.toBe(c.updatedAt);
  });

  it("rejects an empty name and unknown ids", async () => {
    const c = await createCustomExercise({ name: "Sled Push", exerciseType: "distance" }, d);
    await expect(updateCustomExercise(c.id, { name: "   " }, d)).rejects.toThrow("cannot be empty");
    await expect(updateCustomExercise("nope", { name: "x" }, d)).rejects.toThrow("Unknown exercise");
    expect((await d.exercises.get(c.id))!.name).toBe("Sled Push");
  });

  it("lets built-ins change favorite, archived and aliases only", async () => {
    const seed = SEED_EXERCISES[0];
    const updated = await updateCustomExercise(
      seed.id,
      { favorite: true, archived: true, aliases: ["my alias"] },
      d,
    );
    expect(updated).toMatchObject({ favorite: true, name: seed.name });
    expect(updated.archivedAt).toBeTruthy();
    expect(updated.aliases).toEqual(expect.arrayContaining([...seed.aliases, "my alias"]));

    await updateCustomExercise(seed.id, { archived: false }, d);
    expect((await d.exercises.get(seed.id))!.archivedAt).toBeUndefined();
  });

  it("rejects renaming or retyping a built-in, and changes nothing", async () => {
    const seed = SEED_EXERCISES[0];
    const before = await d.exercises.get(seed.id);
    await expect(updateCustomExercise(seed.id, { name: "Renamed" }, d)).rejects.toThrow("cannot change name");
    await expect(
      updateCustomExercise(seed.id, { favorite: true, equipment: ["bench"] }, d),
    ).rejects.toThrow("cannot change equipment");
    expect(await d.exercises.get(seed.id)).toEqual(before);
  });
});

describe("isExerciseReferenced", () => {
  it("is false for an unused exercise", async () => {
    const c = await createCustomExercise({ name: "Lonely", exerciseType: "duration" }, d);
    expect(await isExerciseReferenced(c.id, d)).toBe(false);
  });

  it("finds references in sessions via the exerciseIds index", async () => {
    const c = await createCustomExercise({ name: "Logged", exerciseType: "duration" }, d);
    await d.sessions.put(sessionWith(c.id, "Logged", "duration"));
    expect(await isExerciseReferenced(c.id, d)).toBe(true);
  });

  it("finds references in routines by scanning their exercises", async () => {
    const c = await createCustomExercise({ name: "Planned", exerciseType: "duration" }, d);
    await d.routines.put({
      id: "r-1",
      name: "Routine",
      exercises: [{ id: "re-1", exerciseId: c.id, prescribedSets: [] }],
      createdAt: now,
      updatedAt: now,
    });
    expect(await isExerciseReferenced(c.id, d)).toBe(true);
  });
});

describe("deleteCustomExercise", () => {
  it("deletes an unused custom exercise", async () => {
    const c = await createCustomExercise({ name: "Scratch", exerciseType: "duration" }, d);
    await deleteCustomExercise(c.id, d);
    expect(await d.exercises.get(c.id)).toBeUndefined();
  });

  it("refuses to delete a referenced exercise and keeps it intact", async () => {
    const c = await createCustomExercise({ name: "Used", exerciseType: "duration" }, d);
    await d.sessions.put(sessionWith(c.id, "Used", "duration"));
    await expect(deleteCustomExercise(c.id, d)).rejects.toBeInstanceOf(ExerciseInUseError);
    expect(await d.exercises.get(c.id)).toBeTruthy();
  });

  it("never deletes built-ins, even when unreferenced", async () => {
    const seed = SEED_EXERCISES[0];
    await expect(deleteCustomExercise(seed.id, d)).rejects.toThrow("archive it instead");
    expect(await d.exercises.get(seed.id)).toBeTruthy();
  });
});
