import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "#lib/storage/db";
import {
  ActiveSessionExistsError,
  completedSessionsWithExercise,
  discardSession,
  finishSession,
  getActiveSession,
  saveSession,
  SessionNotActiveError,
  startSession,
} from "#lib/storage/sessions";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "#lib/storage/settings";
import type { SessionExercise, WorkoutSession } from "#lib/types";

const ex = (exerciseId: string): SessionExercise => ({
  id: `se-${exerciseId}`,
  exerciseId,
  exerciseNameSnapshot: exerciseId.toUpperCase(),
  exerciseTypeSnapshot: "weighted_reps",
  prescribedSets: [{ id: "p1", type: "normal", repRange: [5, 5], targetWeight: 100 }],
  restSeconds: 120,
  sets: [{ id: "a", type: "normal", weight: 100, reps: 5, prescribedSetId: "p1", completedAt: "2026-01-01T10:05:00.000Z" }],
});

beforeEach(async () => {
  await db.sessions.clear();
  await db.settings.clear();
});

describe("session repository", () => {
  it("starts an active session and finds it again after save -> reload", async () => {
    const s = await startSession({ name: "Push", routineId: "r1", routineNameSnapshot: "Push A", exercises: [ex("bench")] });
    expect(s.status).toBe("active");
    expect(s.exerciseIds).toEqual(["bench"]);
    expect(s.timeZone).toBeTruthy();
    expect(await getActiveSession()).toEqual(s);
  });

  it("refuses a second active session", async () => {
    const first = await startSession({ name: "A" });
    await expect(startSession({ name: "B" })).rejects.toBeInstanceOf(ActiveSessionExistsError);
    await expect(startSession({ name: "B" })).rejects.toMatchObject({ activeSessionId: first.id });
    expect(await db.sessions.count()).toBe(1);
  });

  it("racing starts create only one session", async () => {
    const results = await Promise.allSettled([startSession({ name: "A" }), startSession({ name: "B" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.sessions.count()).toBe(1);
  });

  it("saveSession round-trips data, recomputes exerciseIds and bumps updatedAt", async () => {
    const s = await startSession({ name: "A" }, new Date("2026-01-01T10:00:00Z"));
    const edited: WorkoutSession = { ...s, exercises: [ex("squat"), ex("bench"), ex("squat")], exerciseIds: ["stale"] };
    const saved = await saveSession(edited, new Date("2026-01-01T10:10:00Z"));
    expect(saved.exerciseIds).toEqual(["squat", "bench"]);
    expect(saved.updatedAt).toBe("2026-01-01T10:10:00.000Z");
    expect(await db.sessions.get(s.id)).toEqual(saved);
    expect((await getActiveSession())?.exercises[0].prescribedSets?.[0].targetWeight).toBe(100);
  });

  it("saveSession accepts proxies (like Svelte $state) without DataCloneError", async () => {
    const s = await startSession({ name: "A" });
    const proxy = new Proxy({ ...s, exercises: [ex("bench")] }, {});
    proxy.exercises = new Proxy([ex("bench")], {});
    await expect(saveSession(proxy)).resolves.toBeTruthy();
    expect((await db.sessions.get(s.id))?.exerciseIds).toEqual(["bench"]);
  });

  it("saveSession refuses to activate a second session", async () => {
    await startSession({ name: "A" });
    const now = new Date().toISOString();
    const other: WorkoutSession = { id: "x", name: "X", status: "active", startedAt: now, timeZone: "UTC", exercises: [], exerciseIds: [], createdAt: now, updatedAt: now };
    await expect(saveSession(other)).rejects.toBeInstanceOf(ActiveSessionExistsError);
  });

  it("saveSession refuses to re-activate a finished, discarded or never-started session (stale tab)", async () => {
    const s = await startSession({ name: "A" });
    await finishSession(s.id);
    await expect(saveSession({ ...s, name: "stale" })).rejects.toBeInstanceOf(SessionNotActiveError);
    expect(await db.sessions.get(s.id)).toMatchObject({ status: "completed", name: "A" });

    const d = await startSession({ name: "B" });
    await discardSession(d.id);
    await expect(saveSession(d)).rejects.toBeInstanceOf(SessionNotActiveError);
    expect(await db.sessions.get(d.id)).toBeUndefined();
    // Completed sessions can still be edited.
    const done = (await db.sessions.get(s.id))!;
    await expect(saveSession({ ...done, name: "edited" })).resolves.toMatchObject({ status: "completed", name: "edited" });
  });

  it("finishSession sets endedAt, completes it, clears the rest timer", async () => {
    const s = await startSession({ name: "A", exercises: [ex("bench")] });
    await saveSession({ ...s, restTimer: { endsAt: "2026-01-01T10:02:00.000Z", durationSeconds: 90 } });
    const done = await finishSession(s.id, new Date("2026-01-01T11:00:00Z"));
    expect(done).toMatchObject({ status: "completed", endedAt: "2026-01-01T11:00:00.000Z" });
    expect(done.restTimer).toBeUndefined();
    expect(await getActiveSession()).toBeUndefined();
    expect((await db.sessions.get(s.id))?.restTimer).toBeUndefined();
    await expect(finishSession(s.id)).rejects.toThrow(/not active/);
    // A new session can start now.
    await expect(startSession({ name: "B" })).resolves.toBeTruthy();
  });

  it("discardSession deletes an active session but never history", async () => {
    const s = await startSession({ name: "A" });
    await discardSession(s.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await getActiveSession()).toBeUndefined();
    const t = await startSession({ name: "B" });
    await finishSession(t.id);
    await expect(discardSession(t.id)).rejects.toThrow(/refusing/);
    expect(await db.sessions.count()).toBe(1);
  });

  it("completedSessionsWithExercise returns matching completed sessions newest first", async () => {
    const mk = async (day: number, exercises: string[]) => {
      const s = await startSession({ name: `d${day}`, exercises: exercises.map(ex) }, new Date(Date.UTC(2026, 0, day, 10)));
      await finishSession(s.id, new Date(Date.UTC(2026, 0, day, 11)));
    };
    await mk(3, ["bench"]);
    await mk(1, ["bench", "row"]);
    await mk(2, ["squat"]);
    await mk(5, ["row", "bench"]);
    await startSession({ name: "active", exercises: [ex("bench")] }, new Date(Date.UTC(2026, 0, 9)));
    expect((await completedSessionsWithExercise("bench")).map((s) => s.name)).toEqual(["d5", "d3", "d1"]);
    expect((await completedSessionsWithExercise("bench", 2)).map((s) => s.name)).toEqual(["d5", "d3"]);
    expect(await completedSessionsWithExercise("deadlift")).toEqual([]);
  });
});

describe("settings", () => {
  it("returns defaults, then merges saved changes", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ weightUnit: "lb", weekStartsOn: 0 });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, weightUnit: "lb", weekStartsOn: 0 });
    expect(await db.settings.count()).toBe(1);
  });

  it("keeps every field when saves overlap (read-modify-write is atomic)", async () => {
    await Promise.all([
      saveSettings({ weightUnit: "lb" }),
      saveSettings({ theme: "dark" }),
      saveSettings({ defaultRestSeconds: 120 }),
    ]);
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, weightUnit: "lb", theme: "dark", defaultRestSeconds: 120 });
  });
});
