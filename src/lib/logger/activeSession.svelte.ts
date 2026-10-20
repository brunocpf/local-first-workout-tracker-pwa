import { setCanUpdate } from "#lib/pwa/update.svelte";
import {
  discardSession,
  finishSession,
  getActiveSession,
  saveSession,
  SessionNotActiveError,
  startSession,
  type NewSession,
} from "#lib/storage/sessions";
import type { WorkoutSession } from "#lib/types";

export type Persist = "now" | "deferred";

/** How long a `'deferred'` write (typing) may wait before it is flushed. */
export const DEFERRED_MS = 500;

/**
 * The in-progress workout (ADR 0004): `session` is the in-memory source of truth, written through to
 * Dexie on every `mutate`. All DB operations run through one promise queue, so puts never land out of
 * order and a queued put can't resurrect a finished/discarded session. A failed write keeps the
 * in-memory state, sets `error` and stays dirty so the next write retries it, except `SessionNotActiveError`
 * (finished/discarded in another tab): then the stale session is dropped and `error` says why. No unload handlers:
 * `visibilitychange → hidden` and `pagehide` only flush pending deferred writes.
 */
export class ActiveSessionStore {
  session = $state<WorkoutSession | undefined>();
  error = $state<unknown>();

  #queue: Promise<unknown> = Promise.resolve();
  #dirty = false;
  /** The latest write failed (distinct from `error`, which other operations also set). */
  #writeFailed = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof document !== "undefined") {
      const flushIfHidden = () => document.visibilityState === "hidden" && void this.flush();
      document.addEventListener("visibilitychange", flushIfHidden);
      addEventListener("pagehide", () => void this.flush());
    }
  }

  get isActive() {
    return this.session !== undefined;
  }

  /** Replaces the whole session (start/load/finish/discard/cross-tab drop); per-session write state starts fresh. */
  #set(session: WorkoutSession | undefined) {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#dirty = false;
    this.#writeFailed = false;
    this.session = session;
    setCanUpdate(session === undefined);
  }

  /** Runs `op` after every earlier operation; the returned promise rejects with `op`'s error, the queue never does. */
  #enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(op);
    this.#queue = run.catch(() => {});
    return run;
  }

  /** Restores the active session from IndexedDB (root layout load). In-memory state wins if already present. */
  async load(): Promise<WorkoutSession | undefined> {
    if (this.session) return this.session;
    try {
      const stored = await this.#enqueue(() => getActiveSession());
      if (!this.session) this.#set(stored);
    } catch (e) {
      this.error = e;
    }
    return this.session;
  }

  /** Creates and persists a new active session. Throws (and sets `error`) e.g. `ActiveSessionExistsError` from another tab. */
  async start(input: NewSession): Promise<WorkoutSession> {
    if (this.session) throw new Error("A session is already active");
    try {
      const created = await this.#enqueue(() => startSession(input));
      this.error = undefined;
      this.#set(created);
      return this.session!;
    } catch (e) {
      this.error = e;
      throw e;
    }
  }

  /**
   * Applies `fn` to the reactive session in place, then persists: `'now'` for set completion/deletion
   * and structural changes, `'deferred'` for keystrokes (coalesced, flushed within `DEFERRED_MS`).
   */
  mutate(fn: (session: WorkoutSession) => void, { persist }: { persist: Persist }): Promise<void> {
    if (!this.session) throw new Error("No active session");
    fn(this.session);
    this.#dirty = true;
    if (persist === "now") return this.flush();
    if (this.#timer === undefined) this.#timer = setTimeout(() => void this.flush(), DEFERRED_MS);
    return Promise.resolve();
  }

  /** Writes any pending changes and waits for all queued writes. Resolves even on failure; check `error`. */
  flush(): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#dirty && this.session) {
      this.#dirty = false;
      // Snapshot now, not when the queued write runs: each write is exactly the state it was queued for.
      const current = this.session;
      const snapshot = $state.snapshot(current) as WorkoutSession;
      void this.#enqueue(() => this.#write(current, snapshot)).catch(() => {});
    }
    return this.#queue.then(() => {});
  }

  async #write(current: WorkoutSession, snapshot: WorkoutSession) {
    if (this.session !== current) return; // finished or discarded meanwhile
    try {
      const saved = await saveSession(snapshot);
      this.#writeFailed = false;
      this.error = undefined;
      // Keep memory identical to what was stored (these fields are maintained by `saveSession`).
      if (this.session === current) {
        current.exerciseIds = saved.exerciseIds;
        current.updatedAt = saved.updatedAt;
      }
    } catch (e) {
      this.error = e;
      if (this.session !== current) throw e;
      if (e instanceof SessionNotActiveError) {
        // Finished/discarded elsewhere: writing would resurrect it, so drop this tab's stale copy.
        this.#set(undefined);
      } else {
        this.#writeFailed = true;
        this.#dirty = true;
      }
      throw e;
    }
  }

  /** Flushes, then marks the session completed. Throws (session stays active) if the latest state couldn't be saved. */
  async finish(): Promise<WorkoutSession> {
    const id = this.#requireId();
    await this.flush();
    // A 'deferred' change made while flushing leaves it dirty without a failure: flush again.
    while (this.#dirty && !this.#writeFailed) await this.flush();
    if (this.#dirty) throw this.error ?? new Error("Latest workout state could not be saved");
    if (!this.session) throw this.error ?? new Error("No active session");
    try {
      const done = await this.#enqueue(() => finishSession(id));
      this.#set(undefined);
      return done;
    } catch (e) {
      this.error = e;
      throw e;
    }
  }

  /** Deletes the active session (the UI confirms first). Pending writes are dropped, queued ones run first. */
  async discard(): Promise<void> {
    const id = this.#requireId();
    const wasDirty = this.#dirty;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#dirty = false;
    try {
      await this.#enqueue(() => discardSession(id));
      this.error = undefined;
      this.#set(undefined);
    } catch (e) {
      this.error = e;
      // The session is still here: keep (and schedule) the changes the discard would have dropped.
      if (wasDirty || this.#dirty) {
        this.#dirty = true;
        this.#timer ??= setTimeout(() => void this.flush(), DEFERRED_MS);
      }
      throw e;
    }
  }

  #requireId() {
    if (!this.session) throw new Error("No active session");
    return this.session.id;
  }
}

export const active = new ActiveSessionStore();
