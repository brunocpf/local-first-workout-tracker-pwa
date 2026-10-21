import Dexie, { type DexieOptions, type EntityTable } from "dexie";
import type { BodyMeasurement, Exercise, Program, Routine, RoutineFolder, UserSettings, WorkoutSession } from "#lib/types";

// The app is served from github.io, whose IndexedDB namespace is shared by every project site of
// the same user (brunocpf.github.io). The name must stay app-specific, unique and STABLE: renaming
// it later would silently strand existing user data in the old database.
export const DB_NAME = "workout-tracker";

export const SETTINGS_KEY = "settings";
export type StoredSettings = UserSettings & { key: typeof SETTINGS_KEY };

/** Why the database can't be used: no IndexedDB at all (some private modes), device full, or any other open failure. */
export type StorageProblem = "unsupported" | "quota" | "unavailable";

export type DbStatus = {
  /** Set when opening failed; the app can't work until a reload succeeds. */
  openError?: { problem: StorageProblem; message: string };
  /** Another tab opened a newer schema: this connection is closed for good and the tab must reload. */
  versionChanged: boolean;
  /** This tab's upgrade waits for another tab (holding the old version) to close. */
  blocked: boolean;
  /** The open (maybe a long migration) is still running after `OPEN_TIMEOUT_MS`; not an error, cleared when it settles. */
  slow: boolean;
};

/** How long pending writes may delay closing for another tab's upgrade (that tab waits meanwhile). */
export const CLOSE_FLUSH_TIMEOUT_MS = 2000;

/** An open that neither succeeds, fails nor reports `blocked` within this time is flagged `slow` ("Still opening…"). */
export const OPEN_TIMEOUT_MS = 5000;

const errorNames = (e: unknown): string[] => {
  const names: string[] = [];
  for (let cur = e as { name?: unknown; inner?: unknown } | undefined; cur && names.length < 5; cur = cur.inner as typeof cur) {
    if (typeof cur.name === "string") names.push(cur.name);
  }
  return names;
};

/** True for a full device / storage quota, including Dexie's wrappers (`inner`) around the DOMException. */
export const isQuotaError = (e: unknown) => errorNames(e).includes("QuotaExceededError");

export function storageProblem(e: unknown): StorageProblem {
  const names = errorNames(e);
  if (names.includes("QuotaExceededError")) return "quota";
  if (names.includes("MissingAPIError")) return "unsupported";
  return "unavailable";
}

export class AppDB extends Dexie {
  exercises!: EntityTable<Exercise, "id">;
  programs!: EntityTable<Program, "id">;
  routines!: EntityTable<Routine, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  settings!: EntityTable<StoredSettings, "key">;
  measurements!: EntityTable<BodyMeasurement, "id">;
  folders!: EntityTable<RoutineFolder, "id">;

  readonly status: DbStatus = { versionChanged: false, blocked: false, slow: false };
  #listeners = new Set<(status: DbStatus) => void>();
  #beforeClose = new Set<() => Promise<unknown>>();

  constructor(name = DB_NAME, options?: DexieOptions) {
    super(name, options);
    // Changing version(1) in place was fine only because no user data existed yet.
    // From now on NEVER edit a shipped version: add `this.version(n + 1).stores({ ...changed tables })`
    // (+ `.upgrade(tx => ...)` to transform existing rows), never drop data, and add a fixture test
    // in tests/migrations.test.ts or a per-version file like tests/migration-v2.test.ts. See docs/data-model.md "Migrations".
    this.version(1).stores({
      exercises: "id, name, *aliases, isCustom, archivedAt",
      programs: "id, name",
      routines: "id, programId, folderId",
      sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds",
      settings: "key",
    });
    // v2 (body measurements): a new table only, so existing rows need no `upgrade`. Version 1 stays untouched.
    this.version(2).stores({
      measurements: "id, kind, measuredAt, [kind+measuredAt]",
    });
    // v3 (routine folders): a new table only; `routines.folderId` was indexed since v1 and `Routine.favorite`
    // is a plain optional field (booleans can't be IndexedDB keys), so existing rows need no `upgrade`.
    this.version(3).stores({
      folders: "id, name",
    });

    // Another tab (newer app version) wants to upgrade or delete the database. Dexie's default would close
    // and silently auto-reopen, letting this tab's old code write against the new schema. Instead: flush
    // pending writes on the still-open connection, then close for good and ask the user to reload.
    // Returning false stops Dexie's default handler (subscribers run newest first).
    this.on("versionchange", () => {
      if (this.status.versionChanged) return false;
      this.#update({ versionChanged: true });
      const flushes = Promise.allSettled([...this.#beforeClose].map((fn) => fn()));
      const timeout = new Promise((resolve) => setTimeout(resolve, CLOSE_FLUSH_TIMEOUT_MS));
      void Promise.race([flushes, timeout]).then(() => this.close({ disableAutoOpen: true }));
      return false;
    });
    this.on("blocked", () => this.#update({ blocked: true }));
  }

  #update(patch: Partial<DbStatus>) {
    Object.assign(this.status, patch);
    for (const fn of this.#listeners) fn(this.status);
  }

  /** Calls `fn` on every status change; returns an unsubscribe function. */
  onStatus(fn: (status: DbStatus) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Registers work (e.g. flushing the active workout) to finish before the connection closes for another tab's upgrade. */
  beforeClose(fn: () => Promise<unknown>): () => void {
    this.#beforeClose.add(fn);
    return () => this.#beforeClose.delete(fn);
  }

  #checking: Promise<DbStatus> | undefined;

  /**
   * Opens (or re-checks) the database and records the outcome in `status`. Never throws; concurrent calls share
   * one attempt. A missing IndexedDB is reported at once, and an
   * open still running without `blocked` after `OPEN_TIMEOUT_MS` is flagged `slow`, never an error: reloading would
   * abort a long upgrade and restart it from scratch.
   */
  checkStorage(): Promise<DbStatus> {
    return (this.#checking ??= this.#check().finally(() => (this.#checking = undefined)));
  }

  async #check(): Promise<DbStatus> {
    if (this.status.versionChanged) return this.status;
    // Also without the global: WebKit then falls back to `webkitIndexedDB`, and Dexie's Safari workaround
    // calls `indexedDB.databases()`, throws and leaves the open pending forever.
    if (!this._options.indexedDB || !globalThis.indexedDB) {
      this.#update({ openError: { problem: "unsupported", message: "IndexedDB is not available." } });
      return this.status;
    }
    const timer = setTimeout(() => {
      if (!this.isOpen() && !this.status.blocked && !this.status.versionChanged && !this.status.openError) {
        this.#update({ slow: true });
      }
    }, OPEN_TIMEOUT_MS);
    try {
      await this.open();
      this.#update({ openError: undefined, blocked: false, slow: false });
    } catch (e) {
      if (!this.status.versionChanged) {
        this.#update({ openError: { problem: storageProblem(e), message: e instanceof Error ? e.message : String(e) }, blocked: false, slow: false });
      }
    } finally {
      clearTimeout(timer);
    }
    return this.status;
  }

  /**
   * Starts `checkStorage()` and resolves once a problem is known (open error, blocked, slow, version change); never
   * resolves if the database opens fine. Startup races it so it never waits unboundedly on a hung or blocked open.
   */
  untilProblem(): Promise<DbStatus> {
    return new Promise((resolve) => {
      const check = (s: DbStatus) => {
        if (!(s.openError || s.blocked || s.slow || s.versionChanged)) return false;
        off();
        resolve(s);
        return true;
      };
      const off = this.onStatus(check);
      if (!check(this.status)) void this.checkStorage().then((s) => check(s) || off());
    });
  }
}

export const db = new AppDB();
