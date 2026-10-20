import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "#lib/storage/db";
import { importCompletedSessions, InvalidImportError, startSession } from "#lib/storage/sessions";
import type { WorkoutSession } from "#lib/types";

const iso = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();

const make = (id: string, over: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id,
  name: `Workout ${id}`,
  status: "completed",
  startedAt: iso(0),
  endedAt: iso(30),
  timeZone: "UTC",
  exercises: [
    { id: `${id}-e1`, exerciseId: "bench", exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets: [{ id: `${id}-s1`, type: "normal", weight: 60, reps: 5, completedAt: iso(5) }] },
    { id: `${id}-e2`, exerciseId: "bench", exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets: [] },
    { id: `${id}-e3`, exerciseId: "squat", exerciseNameSnapshot: "Squat", exerciseTypeSnapshot: "weighted_reps", sets: [] },
  ],
  exerciseIds: ["stale"],
  createdAt: iso(0),
  updatedAt: iso(0),
  ...over,
} as WorkoutSession);

beforeEach(async () => {
  await db.sessions.clear();
});

describe("importCompletedSessions", () => {
  it("inserts all sessions and recomputes exerciseIds", async () => {
    expect(await importCompletedSessions([make("a"), make("b")])).toBe(2);
    const rows = await db.sessions.toArray();
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    for (const r of rows) expect([...r.exerciseIds].sort()).toEqual(["bench", "squat"]);
    expect((await db.sessions.where("exerciseIds").equals("squat").count())).toBe(2);
  });

  it("is a no-op for an empty list", async () => {
    expect(await importCompletedSessions([])).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it("rejects a non-completed session without writing anything", async () => {
    await expect(importCompletedSessions([make("a"), make("b"), make("c", { status: "active", endedAt: undefined })])).rejects.toBeInstanceOf(InvalidImportError);
    expect(await db.sessions.count()).toBe(0);
  });

  it("rejects schema-invalid data without writing anything", async () => {
    await expect(importCompletedSessions([make("a"), make("b", { startedAt: "not a date" })])).rejects.toBeInstanceOf(InvalidImportError);
    expect(await db.sessions.count()).toBe(0);
  });

  it("writes nothing when the Nth insert fails (duplicate id inside the batch)", async () => {
    await expect(importCompletedSessions([make("a"), make("b"), make("c"), make("b")])).rejects.toThrow();
    expect(await db.sessions.count()).toBe(0);
  });

  it("writes nothing and keeps existing rows when an id already exists in the store", async () => {
    await importCompletedSessions([make("existing", { name: "Original" })]);
    await expect(importCompletedSessions([make("new1"), make("new2"), make("existing", { name: "Overwrite" })])).rejects.toThrow();
    const rows = await db.sessions.toArray();
    expect(rows.map((r) => r.id)).toEqual(["existing"]);
    expect(rows[0]!.name).toBe("Original");
  });

  it("stores plain copies: does not alias or mutate the input, drops rest timers", async () => {
    const input = make("a", { restTimer: { endsAt: iso(1), durationSeconds: 60 } });
    await importCompletedSessions([input]);
    expect(input.exerciseIds).toEqual(["stale"]);
    expect(input.restTimer).toBeDefined();
    const stored = (await db.sessions.get("a"))!;
    expect(stored.restTimer).toBeUndefined();
    expect(stored).not.toBe(input);
  });

  it("does not disturb an active session", async () => {
    const active = await startSession({ name: "Live" });
    await importCompletedSessions([make("a")]);
    expect((await db.sessions.get(active.id))?.status).toBe("active");
    expect(await db.sessions.count()).toBe(2);
  });
});
