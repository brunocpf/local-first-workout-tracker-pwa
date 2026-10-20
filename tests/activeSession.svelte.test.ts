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
    await vi.advanceTimersByTimeAsync(DEFERRED_MS - 50);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    // No explicit flush: the timer alone must write it.
    await vi.waitFor(async () => expect((await sessions.getActiveSession())!.notes).toBe("hey"));
    expect(save).toHaveBeenCalledOnce();
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

    const flush = vi.spyOn(store, "flush");
    await store.mutate((s) => (s.notes = "pagehide"), { persist: "deferred" });
    dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledOnce(); // synchronously, not by the deferred timer
    // The event alone writes it (no explicit flush).
    await vi.waitFor(async () => expect((await sessions.getActiveSession())!.notes).toBe("pagehide"));

    await store.mutate((s) => (s.notes = "visible"), { persist: "deferred" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(DEFERRED_MS / 2);
    expect(save).toHaveBeenCalledTimes(2); // still visible and before the deferred delay: not written
    expect(flush).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      await store.mutate((s) => (s.notes = "hidden"), { persist: "deferred" });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(flush).toHaveBeenCalledTimes(2);
      await vi.waitFor(async () => expect((await sessions.getActiveSession())!.notes).toBe("hidden"));
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
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

  it("keeps retrying when an earlier write fails while later ones are queued", async () => {
    const store = await started();
    const err = new Error("disk");
    const real = sessions.saveSession;
    const save = vi.spyOn(sessions, "saveSession").mockRejectedValueOnce(err).mockRejectedValueOnce(err);
    const a = store.mutate((s) => (s.name = "A"), { persist: "now" });
    const b = store.mutate((s) => (s.name = "B"), { persist: "now" });
    await Promise.all([a, b]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.error).toBe(err);
    expect((await sessions.getActiveSession())!.name).toBe("Push");

    save.mockImplementation(real);
    await store.flush(); // nothing new was mutated, but the failed state is still pending
    expect(store.error).toBeUndefined();
    expect((await sessions.getActiveSession())!.name).toBe("B");
  });

  it("an earlier failure is healed by a later queued write", async () => {
    const store = await started();
    const err = new Error("disk");
    vi.spyOn(sessions, "saveSession").mockRejectedValueOnce(err);
    const a = store.mutate((s) => (s.name = "A"), { persist: "now" });
    const b = store.mutate((s) => (s.name = "B"), { persist: "now" });
    await Promise.all([a, b]);
    expect(store.error).toBeUndefined();
    expect((await sessions.getActiveSession())!.name).toBe("B");
  });

  it("finish includes a deferred change made while it was flushing", async () => {
    const store = await started();
    await store.mutate((s) => (s.notes = "a"), { persist: "deferred" });
    const finishing = store.finish();
    await store.mutate((s) => (s.notes = "b"), { persist: "deferred" });
    const done = await finishing;
    expect(done.notes).toBe("b");
    expect(store.isActive).toBe(false);
  });

  it("a write failure in an ended session doesn't leak into the next one's finish", async () => {
    const store = await started();
    vi.spyOn(sessions, "saveSession").mockRejectedValueOnce(new Error("disk"));
    await store.mutate((s) => (s.name = "lost"), { persist: "now" });
    await store.discard();
    await store.start({ name: "Next" });
    const finishing = store.finish();
    await store.mutate((s) => (s.notes = "during flush"), { persist: "deferred" });
    const done = await finishing;
    expect(done).toMatchObject({ name: "Next", notes: "during flush", status: "completed" });
    expect(store.isActive).toBe(false);
  });

  it("a failed discard keeps pending typed changes and still saves them", async () => {
    const store = await started();
    fakeTimers();
    await store.mutate((s) => (s.notes = "typed"), { persist: "deferred" });
    const err = new Error("blocked");
    vi.spyOn(sessions, "discardSession").mockRejectedValueOnce(err);
    await expect(store.discard()).rejects.toBe(err);
    expect(store.isActive).toBe(true);
    await vi.advanceTimersByTimeAsync(DEFERRED_MS);
    await vi.waitFor(async () => expect((await sessions.getActiveSession())!.notes).toBe("typed"));
  });

  it.each(["finish", "discard"] as const)("a stale tab can't resurrect a session another tab ended (%s)", async (how) => {
    const tabA = await started();
    const tabB = new ActiveSessionStore();
    await tabB.load();
    const id = tabB.session!.id;
    await tabB[how]();

    await tabA.mutate((s) => (s.name = "stale edit"), { persist: "now" });
    expect(tabA.error).toBeInstanceOf(sessions.SessionNotActiveError);
    expect(tabA.isActive).toBe(false);
    expect(await sessions.getActiveSession()).toBeUndefined();
    const stored = await db.sessions.get(id);
    if (how === "finish") expect(stored).toMatchObject({ status: "completed", name: "Push" });
    else expect(stored).toBeUndefined();
  });

  it("a stale tab's finish fails instead of resurrecting the session", async () => {
    const tabA = await started();
    const tabB = new ActiveSessionStore();
    await tabB.load();
    await tabB.finish();
    await tabA.mutate((s) => (s.notes = "x"), { persist: "deferred" });
    await expect(tabA.finish()).rejects.toBeInstanceOf(sessions.SessionNotActiveError);
    expect(tabA.isActive).toBe(false);
    expect(await sessions.getActiveSession()).toBeUndefined();
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
