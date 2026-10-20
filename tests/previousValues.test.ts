import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alignPrevious, loadPreviousSets, prefillFor } from "#lib/logger/previousValues";
import { db } from "#lib/storage/db";
import { startSession, saveSession, finishSession } from "#lib/storage/sessions";
import type { LoggedSet, SetType } from "#lib/types";

let n = 0;
const done = (type: SetType, weight: number, reps = 5): LoggedSet => ({
  id: `s${n++}`, type, weight, reps, completedAt: "2026-01-01T00:00:00.000Z",
});
const cur = (...types: SetType[]) => types.map((type) => ({ type }));

describe("alignPrevious", () => {
  it("returns undefined for every set with no history", () => {
    expect(alignPrevious(cur("normal", "normal"), [])).toEqual([undefined, undefined]);
  });
  it("matches set N to previous set N", () => {
    const p = [done("normal", 60), done("normal", 70)];
    expect(alignPrevious(cur("normal", "normal"), p)).toEqual(p);
  });
  it("falls back to the last previous set for extra sets", () => {
    const p = [done("normal", 60), done("normal", 70)];
    expect(alignPrevious(cur("normal", "normal", "normal"), p)[2]).toBe(p[1]);
  });
  it("matches warm-ups and working sets in separate groups", () => {
    const p = [done("warmup", 20), done("normal", 80), done("warmup", 40), done("normal", 90)];
    const r = alignPrevious(cur("warmup", "warmup", "normal", "normal"), p);
    expect(r.map((x) => x?.weight)).toEqual([20, 40, 80, 90]);
  });
  it("treats drop and failure as working sets", () => {
    const p = [done("normal", 80), done("drop", 60), done("failure", 40)];
    expect(alignPrevious(cur("normal", "failure", "drop"), p).map((x) => x?.weight)).toEqual([80, 60, 40]);
  });
  it("gives a warm-up nothing when the previous session had none", () => {
    expect(alignPrevious(cur("warmup", "normal"), [done("normal", 80)])).toEqual([undefined, expect.objectContaining({ weight: 80 })]);
  });
  it("ignores previous sets that were never completed", () => {
    const skipped: LoggedSet = { id: "x", type: "normal", weight: 999, reps: 1 };
    const p = [done("normal", 60), skipped];
    expect(alignPrevious(cur("normal", "normal"), [skipped, ...p]).map((x) => x?.weight)).toEqual([60, 60]);
  });
});

describe("prefillFor", () => {
  const set = { type: "normal" as const };
  it("prefers previous values", () => {
    expect(prefillFor(set, { weight: 50, reps: 8 }, { targetWeight: 40, repRange: [10, 12] })).toEqual({ weight: 50, reps: 8 });
  });
  it("falls back to the prescription, using the lower rep bound", () => {
    expect(prefillFor(set, undefined, { targetWeight: 40, repRange: [10, 12] })).toEqual({ weight: 40, reps: 10 });
  });
  it("fills each field independently", () => {
    expect(prefillFor(set, { weight: 50 }, { repRange: [6, 8] })).toEqual({ weight: 50, reps: 6 });
  });
  it("returns nothing without history or prescription", () => {
    expect(prefillFor(set)).toEqual({});
  });
});

describe("loadPreviousSets", () => {
  beforeEach(async () => {
    await db.sessions.clear();
  });
  afterEach(async () => {
    await db.sessions.clear();
  });

  async function completed(startedAt: string, sets: LoggedSet[], exerciseId = "bench") {
    const s = await startSession({
      name: "w",
      exercises: [{ id: `se${n++}`, exerciseId, exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets }],
    }, new Date(startedAt));
    return finishSession(s.id, new Date(startedAt));
  }

  it("returns [] with no history", async () => {
    expect(await loadPreviousSets("bench")).toEqual([]);
  });
  it("returns the most recent completed session's sets", async () => {
    await completed("2026-01-01T10:00:00Z", [done("normal", 50)]);
    await completed("2026-01-03T10:00:00Z", [done("normal", 60), done("normal", 65)]);
    await completed("2026-01-02T10:00:00Z", [done("normal", 55)]);
    expect((await loadPreviousSets("bench")).map((s) => s.weight)).toEqual([60, 65]);
  });
  it("skips the excluded session and ignores other exercises and active sessions", async () => {
    await completed("2026-01-01T10:00:00Z", [done("normal", 50)]);
    const newer = await completed("2026-01-02T10:00:00Z", [done("normal", 60)]);
    await completed("2026-01-03T10:00:00Z", [done("normal", 99)], "squat");
    await startSession({ name: "active" }, new Date("2026-01-04T10:00:00Z"));
    expect((await loadPreviousSets("bench", { excludeSessionId: newer.id })).map((s) => s.weight)).toEqual([50]);
  });
  it("concatenates multiple occurrences of the exercise in order", async () => {
    const s = await startSession({
      name: "w",
      exercises: [
        { id: "a", exerciseId: "bench", exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets: [done("normal", 50)] },
        { id: "b", exerciseId: "bench", exerciseNameSnapshot: "Bench", exerciseTypeSnapshot: "weighted_reps", sets: [done("normal", 40)] },
      ],
    });
    await saveSession(s);
    await finishSession(s.id);
    expect((await loadPreviousSets("bench")).map((x) => x.weight)).toEqual([50, 40]);
  });
  it("skips a session where none of the exercise's sets were completed", async () => {
    await completed("2026-01-01T10:00:00Z", [done("normal", 50)]);
    await completed("2026-01-02T10:00:00Z", [{ id: "u", type: "normal", weight: 1, reps: 1 }]);
    expect((await loadPreviousSets("bench")).map((s) => s.weight)).toEqual([50]);
  });
});
