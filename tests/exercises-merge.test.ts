import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { AppDB } from "#lib/storage/db";
import {
  createCustomExercise,
  ensureCatalogSeeded,
  mergeExercises,
  mergePreview,
} from "#lib/storage/exercises";
import type { Routine, WorkoutSession } from "#lib/types";

let n = 0;
let d: AppDB;
beforeEach(async () => {
  d = new AppDB(`exercises-merge-test-${Date.now()}-${n++}`);
  await ensureCatalogSeeded(d);
});
afterEach(async () => {
  d.close();
  await d.delete();
});

const now = "2026-01-01T10:00:00.000Z";

function session(id: string, ids: string[], startedAt = now): WorkoutSession {
  return {
    id,
    name: "Day",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    timeZone: "UTC",
    exercises: ids.map((exerciseId, i) => ({
      id: `${id}-e${i}`,
      exerciseId,
      exerciseNameSnapshot: `Snapshot of ${exerciseId}`,
      exerciseTypeSnapshot: "weighted_reps" as const,
      sets: [],
    })),
    exerciseIds: [...new Set(ids)],
    createdAt: now,
    updatedAt: now,
  };
}

function routine(id: string, ids: string[]): Routine {
  return {
    id,
    name: id,
    exercises: ids.map((exerciseId, i) => ({
      id: `${id}-x${i}`,
      exerciseId,
      prescribedSets: [],
    })),
    createdAt: now,
    updatedAt: now,
  };
}

async function setup() {
  const from = await createCustomExercise(
    { name: "Zercher Sqaut", exerciseType: "weighted_reps", aliases: ["zsq"] },
    d,
  );
  const into = await createCustomExercise(
    {
      name: "Zercher Squat",
      exerciseType: "weighted_reps",
      aliases: ["zercher"],
    },
    d,
  );
  return { from, into };
}

describe("mergeExercises", () => {
  it("re-points sessions, the exerciseIds index and routines; keeps name snapshots", async () => {
    const { from, into } = await setup();
    await d.sessions.bulkPut([
      session("s1", [from.id, into.id, from.id], "2026-01-01T10:00:00.000Z"),
      session("s2", [from.id], "2026-02-01T10:00:00.000Z"),
      session("s3", ["other"]),
    ]);
    await d.routines.bulkPut([
      routine("r1", [from.id, "other"]),
      routine("r2", ["other"]),
    ]);

    expect(await mergePreview(from.id, into.id, d)).toEqual({
      sessions: 2,
      routines: 1,
    });
    expect(await mergeExercises(from.id, into.id, d)).toEqual({
      sessions: 2,
      routines: 1,
    });

    const s1 = (await d.sessions.get("s1"))!;
    expect(s1.exercises.map((e) => e.exerciseId)).toEqual([
      into.id,
      into.id,
      into.id,
    ]);
    expect(s1.exerciseIds).toEqual([into.id]);
    expect(s1.exercises[0].exerciseNameSnapshot).toBe(`Snapshot of ${from.id}`);
    expect((await d.sessions.get("s3"))!.exerciseIds).toEqual(["other"]);
    expect(
      (await d.routines.get("r1"))!.exercises.map((e) => e.exerciseId),
    ).toEqual([into.id, "other"]);
    expect((await d.routines.get("r2"))!.exercises[0].exerciseId).toBe("other");
    expect(await d.exercises.get(from.id)).toBeUndefined();

    // previous values / PRs for `into` now include the merged history
    expect(
      (await d.sessions.where("exerciseIds").equals(into.id).toArray())
        .map((s) => s.id)
        .sort(),
    ).toEqual(["s1", "s2"]);
    expect(await d.sessions.where("exerciseIds").equals(from.id).count()).toBe(
      0,
    );
  });

  it("adds the old name and aliases to into.aliases without duplicates, and they survive reseed", async () => {
    const { from, into } = await setup();
    await mergeExercises(from.id, into.id, d);
    const merged = (await d.exercises.get(into.id))!;
    expect(merged.aliases).toEqual(["zercher", "Zercher Sqaut", "zsq"]);
    // reseed path: aliases are unioned, so custom rows are untouched and built-ins keep user aliases
    const target = SEED_EXERCISES[0];
    const s = await mergeExercises(
      (
        await createCustomExercise(
          { name: "Dup", exerciseType: "weighted_reps" },
          d,
        )
      ).id,
      target.id,
      d,
    );
    expect(s).toEqual({ sessions: 0, routines: 0 });
    const t = (await d.exercises.get(target.id))!;
    expect(t.aliases).toContain("Dup");
    const reseeded = new AppDB(d.name);
    await ensureCatalogSeeded(reseeded);
    expect((await reseeded.exercises.get(target.id))!.aliases).toContain("Dup");
    reseeded.close();
  });

  it("refuses built-in sources, self merges and unknown ids without changing anything", async () => {
    const { from, into } = await setup();
    await d.sessions.put(session("s1", [from.id]));
    await expect(
      mergeExercises(SEED_EXERCISES[0].id, into.id, d),
    ).rejects.toThrow("cannot be merged");
    await expect(mergeExercises(from.id, from.id, d)).rejects.toThrow("itself");
    await expect(mergeExercises(from.id, "nope", d)).rejects.toThrow(
      "Unknown exercise",
    );
    await expect(mergeExercises("nope", into.id, d)).rejects.toThrow(
      "Unknown exercise",
    );
    expect((await d.sessions.get("s1"))!.exercises[0].exerciseId).toBe(from.id);
    expect(await d.exercises.get(from.id)).toBeDefined();
  });

  it("leaves everything untouched when a write fails mid-merge", async () => {
    const { from, into } = await setup();
    await d.sessions.put(session("s1", [from.id]));
    await d.routines.put(routine("r1", [from.id]));
    const before = {
      s: await d.sessions.toArray(),
      r: await d.routines.toArray(),
      e: await d.exercises.toArray(),
    };
    const spy = vi
      .spyOn(d.exercises, "delete")
      .mockRejectedValue(new Error("boom"));
    await expect(mergeExercises(from.id, into.id, d)).rejects.toThrow();
    spy.mockRestore();
    expect(await d.sessions.toArray()).toEqual(before.s);
    expect(await d.routines.toArray()).toEqual(before.r);
    expect(await d.exercises.toArray()).toEqual(before.e);
  });
});
