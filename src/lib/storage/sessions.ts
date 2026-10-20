import Dexie from "dexie";
import { db } from "#lib/storage/db";
import { newId } from "#lib/ids";
import { currentTimeZone } from "#lib/time";
import type { SessionExercise, WorkoutSession } from "#lib/types";

export class ActiveSessionExistsError extends Error {
  constructor(public readonly activeSessionId: string) {
    super(`Session ${activeSessionId} is already active`);
    this.name = "ActiveSessionExistsError";
  }
}

export type NewSession = {
  name: string;
  routineId?: string;
  programId?: string;
  routineNameSnapshot?: string;
  exercises?: SessionExercise[];
};

/** Distinct exercise IDs in a session; what the `*exerciseIds` index is built from. */
export const exerciseIdsOf = (s: Pick<WorkoutSession, "exercises">) => [...new Set(s.exercises.map((e) => e.exerciseId))];

/**
 * Deep-copy into plain JSON data. Svelte `$state` proxies make IndexedDB's structured clone throw
 * DataCloneError, so every write goes through this; callers don't need `$state.snapshot()`.
 * The model is JSON-only (strings, numbers, booleans, arrays, objects; no Date/Map), so this is lossless.
 */
const toPlain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const activeRange = () => db.sessions.where("[status+startedAt]").between(["active", Dexie.minKey], ["active", Dexie.maxKey]);

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  return activeRange().last();
}

/** Creates the active session. Throws `ActiveSessionExistsError` if one exists (checked in the same transaction as the write, so it holds across tabs). */
export async function startSession(input: NewSession, now = new Date()): Promise<WorkoutSession> {
  return db.transaction("rw", db.sessions, async () => {
    const existing = await activeRange().last();
    if (existing) throw new ActiveSessionExistsError(existing.id);
    const iso = now.toISOString();
    const session: WorkoutSession = {
      ...toPlain(input),
      id: newId(),
      exercises: toPlain(input.exercises ?? []),
      status: "active",
      startedAt: iso,
      timeZone: currentTimeZone(),
      exerciseIds: [],
      createdAt: iso,
      updatedAt: iso,
    };
    session.exerciseIds = exerciseIdsOf(session);
    await db.sessions.add(session);
    return session;
  });
}

/**
 * Upsert. Recomputes `exerciseIds` and `updatedAt`, writes atomically, and returns what was stored.
 * Accepts `$state` proxies. Refuses to make a second session active.
 */
export async function saveSession(session: WorkoutSession, now = new Date()): Promise<WorkoutSession> {
  const plain = toPlain(session);
  plain.exerciseIds = exerciseIdsOf(plain);
  plain.updatedAt = now.toISOString();
  return db.transaction("rw", db.sessions, async () => {
    if (plain.status === "active") {
      const other = await activeRange().filter((s) => s.id !== plain.id).first();
      if (other) throw new ActiveSessionExistsError(other.id);
    }
    await db.sessions.put(plain);
    return plain;
  });
}

/** Marks an active session completed, stops its rest timer. Unlogged (no `completedAt`) sets are kept but ignored by metrics. */
export async function finishSession(id: string, now = new Date()): Promise<WorkoutSession> {
  return db.transaction("rw", db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw new Error(`Session ${id} not found`);
    if (s.status !== "active") throw new Error(`Session ${id} is not active`);
    const { restTimer: _timer, ...rest } = s;
    const done: WorkoutSession = {
      ...rest,
      status: "completed",
      endedAt: now.toISOString(),
      exerciseIds: exerciseIdsOf(s),
      updatedAt: now.toISOString(),
    };
    await db.sessions.put(done);
    return done;
  });
}

/** Deletes an ACTIVE session (UI must confirm first). Completed sessions can't be discarded here. */
export async function discardSession(id: string): Promise<void> {
  await db.transaction("rw", db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    if (s.status !== "active") throw new Error(`Session ${id} is not active; refusing to delete history`);
    await db.sessions.delete(id);
  });
}

/** Completed sessions containing the exercise, newest first (previous values, PRs). Uses the `*exerciseIds` index. */
export async function completedSessionsWithExercise(exerciseId: string, limit?: number): Promise<WorkoutSession[]> {
  const all = await db.sessions.where("exerciseIds").equals(exerciseId).filter((s) => s.status === "completed").toArray();
  all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return limit === undefined ? all : all.slice(0, limit);
}
