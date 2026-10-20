import Dexie from "dexie";
import { z } from "zod";
import { sessionSchema } from "#lib/backup/format";
import { db } from "#lib/storage/db";
import { newId } from "#lib/ids";
import { currentTimeZone, isValidTimeZone } from "#lib/time";
import type { SessionExercise, WorkoutSession } from "#lib/types";

export class ActiveSessionExistsError extends Error {
  constructor(public readonly activeSessionId: string) {
    super(`Session ${activeSessionId} is already active`);
    this.name = "ActiveSessionExistsError";
  }
}

/** A write of an active session whose stored row was finished or discarded meanwhile (e.g. in another tab). */
export class SessionNotActiveError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session ${sessionId} was finished or discarded`);
    this.name = "SessionNotActiveError";
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
 * Accepts `$state` proxies. Refuses to make a second session active, and refuses (`SessionNotActiveError`) to
 * write an active session whose stored row is gone or no longer active, so a stale tab can't resurrect it.
 * Create active sessions with `startSession`.
 */
export async function saveSession(session: WorkoutSession, now = new Date()): Promise<WorkoutSession> {
  const plain = toPlain(session);
  plain.exerciseIds = exerciseIdsOf(plain);
  plain.updatedAt = now.toISOString();
  return db.transaction("rw", db.sessions, async () => {
    if (plain.status === "active") {
      const other = await activeRange().filter((s) => s.id !== plain.id).first();
      if (other) throw new ActiveSessionExistsError(other.id);
      const stored = await db.sessions.get(plain.id);
      if (stored?.status !== "active") throw new SessionNotActiveError(plain.id);
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

/**
 * Completed sessions, newest first, bounded by `limit`. `before` is the `startedAt` of the last row of the
 * previous page (exclusive). Uses the `[status+startedAt]` index in reverse; the active session is never included.
 */
export async function listCompletedSessions({ before, limit = 20 }: { before?: string; limit?: number } = {}): Promise<WorkoutSession[]> {
  return db.sessions
    .where("[status+startedAt]")
    .between(["completed", Dexie.minKey], ["completed", before ?? Dexie.maxKey], true, before === undefined)
    .reverse()
    .limit(limit)
    .toArray();
}

/** Completed workouts started after `iso` (all completed ones when omitted). Counts via the `[status+startedAt]` index; loads no rows. */
export async function countCompletedSince(iso?: string): Promise<number> {
  return db.sessions
    .where("[status+startedAt]")
    .between(["completed", iso ?? Dexie.minKey], ["completed", Dexie.maxKey], false, true)
    .count();
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.sessions.get(id);
}

/** Deletes one COMPLETED session (UI must confirm first). Refuses active sessions (use `discardSession`); a missing id is a no-op. Touches nothing else. */
export async function deleteCompletedSession(id: string): Promise<void> {
  await db.transaction("rw", db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    if (s.status !== "completed") throw new Error(`Session ${id} is not completed; use discardSession`);
    await db.sessions.delete(id);
  });
}

export class InvalidSessionEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSessionEditError";
  }
}

/** Limits for edited values; generous, they only reject typos and corrupt data. */
export const MAX_SET_WEIGHT_KG = 2000;
export const MAX_SET_REPS = 10_000;

const editedSetValues = z.object({
  weight: z.number().min(0).max(MAX_SET_WEIGHT_KG).optional(),
  reps: z.number().int().min(0).max(MAX_SET_REPS).optional(),
});

/**
 * Saves edits to a COMPLETED session (UI must confirm first). Validates the shape (the backup schema) and set values,
 * requires the stored row to exist and be completed (never creates or activates a session) and `endedAt ≥ startedAt`;
 * keeps `status: "completed"`, drops any rest timer, clamps set `completedAt` into [startedAt, endedAt], recomputes
 * `exerciseIds`, and bumps `updatedAt`. Accepts `$state` proxies. Touches nothing else.
 */
export async function updateCompletedSession(session: WorkoutSession, now = new Date()): Promise<WorkoutSession> {
  const plain = toPlain(session);
  if (!sessionSchema.safeParse(plain).success) throw new InvalidSessionEditError("The session has invalid data");
  for (const e of plain.exercises) {
    for (const set of e.sets) {
      if (!editedSetValues.safeParse(set).success) {
        throw new InvalidSessionEditError(`${e.exerciseNameSnapshot}: weight or reps out of range`);
      }
    }
  }
  const start = Date.parse(plain.startedAt);
  const end = plain.endedAt === undefined ? NaN : Date.parse(plain.endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new InvalidSessionEditError("Start and end times must be valid");
  if (end < start) throw new InvalidSessionEditError("A workout can't end before it starts");
  for (const set of plain.exercises.flatMap((e) => e.sets)) {
    if (set.completedAt === undefined) continue;
    const t = Date.parse(set.completedAt);
    if (t < start) set.completedAt = plain.startedAt;
    else if (t > end) set.completedAt = plain.endedAt;
  }
  delete plain.restTimer;
  plain.status = "completed";
  plain.exerciseIds = exerciseIdsOf(plain);
  plain.updatedAt = now.toISOString();
  return db.transaction("rw", db.sessions, async () => {
    const stored = await db.sessions.get(plain.id);
    if (!stored) throw new Error(`Session ${plain.id} not found`);
    if (stored.status !== "completed") throw new Error(`Session ${plain.id} is not completed`);
    await db.sessions.put(plain);
    return plain;
  });
}

export type NewCompletedSession = NewSession & {
  startedAt: string;
  endedAt: string;
  /** IANA zone the workout was performed in; defaults to the device's current zone. */
  timeZone?: string;
};

/**
 * Creates a COMPLETED session for a workout that already happened (retroactive logging). It is never active, so it
 * can't conflict with the one-active-session rule and never touches the active session. Validates the shape (the
 * backup schema), a known time zone and `endedAt ≥ startedAt`. The caller then opens the edit screen to log sets.
 */
export async function createCompletedSession(input: NewCompletedSession, now = new Date()): Promise<WorkoutSession> {
  const iso = now.toISOString();
  const session: WorkoutSession = {
    ...toPlain(input),
    id: newId(),
    exercises: toPlain(input.exercises ?? []),
    status: "completed",
    timeZone: input.timeZone ?? currentTimeZone(),
    exerciseIds: [],
    createdAt: iso,
    updatedAt: iso,
  };
  session.exerciseIds = exerciseIdsOf(session);
  if (!sessionSchema.safeParse(session).success) throw new InvalidSessionEditError("The session has invalid data");
  if (!isValidTimeZone(session.timeZone)) throw new InvalidSessionEditError("Unknown time zone");
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt as string);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new InvalidSessionEditError("Start and end times must be valid");
  if (end < start) throw new InvalidSessionEditError("A workout can't end before it starts");
  await db.sessions.add(session);
  return session;
}

/** Completed sessions with `from <= startedAt < to` (ISO instants), oldest first. Bounded by the `[status+startedAt]` index (calendar month). */
export async function listCompletedSessionsBetween(from: string, to: string): Promise<WorkoutSession[]> {
  return db.sessions.where("[status+startedAt]").between(["completed", from], ["completed", to], true, false).toArray();
}

export class InvalidImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImportError";
  }
}

/**
 * Inserts many COMPLETED sessions (e.g. a Hevy import) in one `rw` transaction: all-or-nothing, so a failure on the
 * Nth session leaves the store untouched. Rejects (`InvalidImportError`) any non-completed or schema-invalid session
 * before writing, and never overwrites: a session whose id already exists aborts the whole import. Stores plain
 * copies with `exerciseIds` recomputed and any rest timer dropped. Returns the number of sessions written.
 */
export async function importCompletedSessions(sessions: readonly WorkoutSession[]): Promise<number> {
  const plain = sessions.map((s, i) => {
    const copy = toPlain(s);
    if (copy.status !== "completed") throw new InvalidImportError(`Session ${i + 1} is not completed`);
    if (!sessionSchema.safeParse(copy).success) throw new InvalidImportError(`Session ${i + 1} has invalid data`);
    delete copy.restTimer;
    copy.exerciseIds = exerciseIdsOf(copy);
    return copy;
  });
  if (plain.length === 0) return 0;
  await db.transaction("rw", db.sessions, () => db.sessions.bulkAdd(plain));
  return plain.length;
}
