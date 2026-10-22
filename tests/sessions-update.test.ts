import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "#lib/storage/db";
import {
  InvalidSessionEditError,
  createCompletedSession,
  finishSession,
  getSession,
  listCompletedSessions,
  startSession,
  updateCompletedSession,
} from "#lib/storage/sessions";
import { localDate, localWeekStart } from "#lib/time";
import { createSessionExercise } from "#lib/logger/workout";

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i));
const ex = (id: string) => createSessionExercise({ id, name: id, exerciseType: "weighted_reps" });

beforeEach(async () => {
  await db.sessions.clear();
  await db.routines.clear();
});

async function completed(name = "A") {
  const s = await startSession({ name, exercises: [ex("squat")] }, at(0));
  return finishSession(s.id, at(30));
}

describe("updateCompletedSession", () => {
  it("saves edits, recomputes exerciseIds, keeps status completed", async () => {
    const s = await completed();
    const edited = structuredClone(s);
    edited.name = "Renamed";
    edited.exercises.push(ex("bench"));
    edited.exercises.splice(0, 1);
    const saved = await updateCompletedSession(edited, at(60));
    expect(saved.status).toBe("completed");
    expect(saved.exerciseIds).toEqual(["bench"]);
    expect(saved.updatedAt).toBe(at(60).toISOString());
    expect((await getSession(s.id))?.name).toBe("Renamed");
    expect(await db.sessions.where("exerciseIds").equals("squat").count()).toBe(0);
    expect(await db.sessions.where("exerciseIds").equals("bench").count()).toBe(1);
  });

  it("rejects endedAt before startedAt and leaves the row untouched", async () => {
    const s = await completed();
    await expect(updateCompletedSession({ ...s, endedAt: at(-5).toISOString() })).rejects.toBeInstanceOf(InvalidSessionEditError);
    expect(await getSession(s.id)).toEqual(s);
  });

  it("accepts zero duration and rejects a missing endedAt", async () => {
    const s = await completed();
    await expect(updateCompletedSession({ ...s, endedAt: s.startedAt })).resolves.toBeTruthy();
    const { endedAt: _e, ...noEnd } = s;
    await expect(updateCompletedSession(noEnd)).rejects.toBeInstanceOf(InvalidSessionEditError);
  });

  it("refuses to create or to touch an active session", async () => {
    const s = await completed();
    await expect(updateCompletedSession({ ...s, id: "ghost" })).rejects.toThrow(/not found/);
    const active = await startSession({ name: "live" }, at(100));
    await expect(updateCompletedSession({ ...active, status: "completed", endedAt: at(101).toISOString() })).rejects.toThrow(/not completed/);
    expect((await getSession(active.id))?.status).toBe("active");
  });

  it("never changes the active session or routines", async () => {
    const s = await completed();
    const active = await startSession({ name: "live" }, at(100));
    await db.routines.put({ id: "r1", name: "R", exercises: [], createdAt: "x", updatedAt: "x" });
    await updateCompletedSession({ ...s, name: "Edited" });
    expect(await getSession(active.id)).toEqual(active);
    expect((await db.routines.get("r1"))?.name).toBe("R");
  });
});

describe("updateCompletedSession validation", () => {
  it("clamps completed set times into the session range", async () => {
    const s = await completed();
    const edited = structuredClone(s);
    const sets = edited.exercises[0].sets;
    sets.push({ id: "early", type: "normal", reps: 5, completedAt: at(-10).toISOString() });
    sets.push({ id: "late", type: "normal", reps: 5, completedAt: at(90).toISOString() });
    sets.push({ id: "inside", type: "normal", reps: 5, completedAt: at(10).toISOString() });
    sets.push({ id: "open", type: "normal", reps: 5 });
    const saved = await updateCompletedSession(edited);
    const byId = Object.fromEntries(saved.exercises[0].sets.map((x) => [x.id, x.completedAt]));
    expect(byId).toEqual({ early: s.startedAt, late: s.endedAt, inside: at(10).toISOString(), open: undefined });
  });

  it("rejects out-of-range weight or reps and malformed shapes", async () => {
    const s = await completed();
    const withSet = (set: object) => {
      const e = structuredClone(s);
      e.exercises[0].sets = [{ id: "x", type: "normal", ...set }];
      return e;
    };
    for (const bad of [{ weight: -1 }, { weight: 5000 }, { reps: 2.5 }, { reps: -3 }, { reps: 1e6 }]) {
      await expect(updateCompletedSession(withSet(bad))).rejects.toBeInstanceOf(InvalidSessionEditError);
    }
    await expect(updateCompletedSession({ ...s, name: "x".repeat(300) })).rejects.toBeInstanceOf(InvalidSessionEditError);
    await expect(updateCompletedSession(withSet({ weight: 100, reps: 5 }))).resolves.toBeTruthy();
    expect(await getSession(s.id)).toMatchObject({ exercises: [{ sets: [{ weight: 100, reps: 5 }] }] });
  });
});

describe("createCompletedSession", () => {
  const past = { name: "Old", startedAt: "2026-01-04T23:30:00.000Z", endedAt: "2026-01-05T00:30:00.000Z", timeZone: "America/Los_Angeles" };

  it("creates a completed session with its zone, exerciseIds and listed in history", async () => {
    const s = await createCompletedSession({ ...past, routineId: "r1", exercises: [ex("squat"), ex("bench")] }, at(5));
    expect(s).toMatchObject({ status: "completed", startedAt: past.startedAt, endedAt: past.endedAt, timeZone: past.timeZone, routineId: "r1" });
    expect(s.exerciseIds).toEqual(["squat", "bench"]);
    expect(s.createdAt).toBe(at(5).toISOString());
    expect(await getSession(s.id)).toEqual(s);
    expect((await listCompletedSessions()).map((x) => x.id)).toEqual([s.id]);
    expect(await db.sessions.where("exerciseIds").equals("squat").count()).toBe(1);
  });

  it("lands on the local date of its zone, not the UTC one", async () => {
    const s = await createCompletedSession(past);
    expect(localDate(s)).toBe("2026-01-04");
    expect(localWeekStart(s, 1)).toBe("2025-12-29");
  });

  it("defaults the zone to the device's and never touches the active session", async () => {
    const active = await startSession({ name: "live" }, at(100));
    const { timeZone: _tz, ...noZone } = past;
    const s = await createCompletedSession(noZone);
    expect(s.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    expect(await getSession(active.id)).toEqual(active);
    expect(s.status).toBe("completed");
  });

  it("rejects an end before the start, bad times and unknown zones without writing", async () => {
    await expect(createCompletedSession({ ...past, endedAt: "2026-01-04T23:00:00.000Z" })).rejects.toBeInstanceOf(InvalidSessionEditError);
    await expect(createCompletedSession({ ...past, startedAt: "nope" })).rejects.toBeInstanceOf(InvalidSessionEditError);
    await expect(createCompletedSession({ ...past, timeZone: "Mars/Olympus" })).rejects.toBeInstanceOf(InvalidSessionEditError);
    expect(await db.sessions.count()).toBe(0);
  });

  it("accepts zero duration and can then be edited like any completed session", async () => {
    const s = await createCompletedSession({ ...past, endedAt: past.startedAt, exercises: [ex("squat")] });
    const edited = structuredClone(s);
    edited.exercises[0].sets.push({ id: "a", type: "normal", reps: 5, weight: 100, completedAt: past.startedAt });
    const saved = await updateCompletedSession(edited);
    expect(saved.exercises[0].sets).toHaveLength(1);
  });
});
