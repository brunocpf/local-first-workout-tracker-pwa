import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#lib/storage/db";
import * as sessions from "#lib/storage/sessions";
import { ActiveSessionStore, DEFERRED_MS } from "#lib/logger/activeSession.svelte";
import { addSet, completeSet, createSessionExercise, updateSet } from "#lib/logger/workout";

const canUpdate = vi.hoisted(() => ({ value: true }));
vi.mock("#lib/pwa/update.svelte", () => ({ setCanUpdate: (v: boolean) => (canUpdate.value = v) }));

const bench = { id: "bench", name: "Bench", exerciseType: "weighted_reps" as const };

beforeEach(async () => {
  await db.sessions.clear();
  canUpdate.value = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Only setTimeout is faked, and it keeps advancing with real time so fake-indexeddb (which uses it) still runs.
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });

async function started() {
  const store = new ActiveSessionStore();
  await store.start({ name: "Push" });
  return store;
}

describe("active session store", () => {
  it("restores identical state in a new instance after a 'now' mutate", async () => {
    const store = await started();
    await store.mutate((s) => s.exercises.push(createSessionExercise(bench, { prescribedSets: [{ id: "p", type: "normal" }] })), { persist: "now" });
    await store.mutate((s) => {
      updateSet(s.exercises[0], s.exercises[0].sets[0].id, { weight: 60, reps: 8 });
      completeSet(s.exercises[0].sets[0], {}, "2026-01-01T10:00:00.000Z");
    }, { persist: "now" });

    const reloaded = new ActiveSessionStore();
    await reloaded.load();
    expect(reloaded.isActive).toBe(true);
    expect($state.snapshot(reloaded.session)).toEqual($state.snapshot(store.session));
    expect(reloaded.session!.exerciseIds).toEqual(["bench"]);
  });

  it("loads nothing when no session is active, and in-memory state wins over a second load", async () => {
    const empty = new ActiveSessionStore();
    expect(await empty.load()).toBeUndefined();
    expect(empty.isActive).toBe(false);

    const store = await started();
    store.session!.name = "unsaved";
    await store.load();
    expect(store.session!.name).toBe("unsaved");
  });

  it("persists rapid mutations in order", async () => {
    const store = await started();
    const puts: string[] = [];
    const real = sessions.saveSession;
    let first = true;
    vi.spyOn(sessions, "saveSession").mockImplementation(async (s, now) => {
      // Make the first write slow: a second write must still wait for it.
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 20));
      }
      puts.push(s.name);
      return real(s, now);
    });
    const a = store.mutate((s) => (s.name = "A"), { persist: "now" });
    const b = store.mutate((s) => (s.name = "B"), { persist: "now" });
    await Promise.all([a, b]);
    expect(puts).toEqual(["A", "B"]);
    expect((await sessions.getActiveSession())!.name).toBe("B");
  });

  it("coalesces deferred writes and flushes them after the delay", async () => {
    const store = await started();
    fakeTimers();
    const save = vi.spyOn(sessions, "saveSession");
    await store.mutate((s) => (s.notes = "h"), { persist: "deferred" });
    await store.mutate((s) => (s.notes = "he"), { persist: "deferred" });
    await store.mutate((s) => (s.notes = "hey"), { persist: "deferred" });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEFERRED_MS);
    await store.flush();
    expect(save).toHaveBeenCalledOnce();
    expect((await sessions.getActiveSession())!.notes).toBe("hey");
  });

  it("flushes pending deferred changes with the next 'now' write and on hide", async () => {
    const store = await started();
    fakeTimers();
    const save = vi.spyOn(sessions, "saveSession");
    await store.mutate((s) => (s.notes = "typed"), { persist: "deferred" });
    await store.mutate((s) => s.exercises.push(createSessionExercise(bench)), { persist: "now" });
    expect(save).toHaveBeenCalledOnce();
    expect((await sessions.getActiveSession())!.notes).toBe("typed");
    await vi.advanceTimersByTimeAsync(DEFERRED_MS * 2);
    expect(save).toHaveBeenCalledOnce(); // timer was cancelled by the 'now' write

    await store.mutate((s) => (s.notes = "hidden"), { persist: "deferred" });
    dispatchEvent(new Event("pagehide"));
    await store.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect((await sessions.getActiveSession())!.notes).toBe("hidden");
  });

  it("surfaces save errors, keeps in-memory state and retries on the next write", async () => {
    const store = await started();
    const quota = new DOMException("full", "QuotaExceededError");
    const save = vi.spyOn(sessions, "saveSession").mockRejectedValue(quota);
    await store.mutate((s) => s.exercises.push(createSessionExercise(bench)), { persist: "now" });
    expect(store.error).toBe(quota);
    expect(store.session!.exercises).toHaveLength(1);
    expect((await sessions.getActiveSession())!.exercises).toHaveLength(0);

    // finish retries the unsaved state first and refuses to complete a session whose latest state isn't stored.
    await expect(store.finish()).rejects.toBe(quota);
    expect(store.isActive).toBe(true);
    expect((await sessions.getActiveSession())!.status).toBe("active");

    save.mockRestore();
    await store.mutate((s) => addSet(s.exercises[0]), { persist: "now" });
    expect(store.error).toBeUndefined();
    expect((await sessions.getActiveSession())!.exercises[0].sets).toHaveLength(1);
  });

  it("surfaces ActiveSessionExistsError from another tab", async () => {
    await sessions.startSession({ name: "Other tab" });
    const store = new ActiveSessionStore();
    await expect(store.start({ name: "Mine" })).rejects.toBeInstanceOf(sessions.ActiveSessionExistsError);
    expect(store.error).toBeInstanceOf(sessions.ActiveSessionExistsError);
    expect(store.isActive).toBe(false);
  });

  it("blocks app updates while active; finish and discard end the session", async () => {
    const store = await started();
    expect(canUpdate.value).toBe(false);
    await store.mutate((s) => (s.notes = "last words"), { persist: "deferred" });
    const done = await store.finish();
    expect(done.status).toBe("completed");
    expect(done.notes).toBe("last words");
    expect(store.isActive).toBe(false);
    expect(canUpdate.value).toBe(true);
    expect(await sessions.getActiveSession()).toBeUndefined();

    const next = await started();
    expect(canUpdate.value).toBe(false);
    const id = next.session!.id;
    void next.mutate((s) => (s.name = "queued"), { persist: "now" });
    await next.discard();
    expect(canUpdate.value).toBe(true);
    expect(await db.sessions.get(id)).toBeUndefined(); // the queued put didn't resurrect it

    const reloaded = new ActiveSessionStore();
    await reloaded.load();
    expect(reloaded.isActive).toBe(false);
  });

  it("restoring an active session on load blocks updates", async () => {
    await sessions.startSession({ name: "Interrupted" });
    const store = new ActiveSessionStore();
    await store.load();
    expect(store.session!.name).toBe("Interrupted");
    expect(canUpdate.value).toBe(false);
  });
});
