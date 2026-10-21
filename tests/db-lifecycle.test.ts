import "fake-indexeddb/auto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { render, screen } from "@testing-library/svelte";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDB, CLOSE_FLUSH_TIMEOUT_MS, db, isQuotaError, OPEN_TIMEOUT_MS, storageProblem } from "#lib/storage/db";
import { ActiveSessionStore } from "#lib/logger/activeSession.svelte";
import * as sessions from "#lib/storage/sessions";
import AppStatus from "#lib/components/AppStatus.svelte";

vi.mock("#lib/pwa/update.svelte", () => ({ setCanUpdate: () => {} }));
vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));

let n = 0;
const uniqueName = () => `lifecycle-${++n}-${Math.random()}`;

/** Simulates a newer app version in another tab: same database, higher schema version (above AppDB's own latest). */
function newerVersion(name: string) {
  return new (class extends AppDB {
    constructor() {
      super(name);
      this.version(this.verno + 1).stores({ sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds, endedAt" });
    }
  })();
}

const until = (cond: () => boolean) => vi.waitFor(() => expect(cond()).toBe(true));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("versionchange (another tab opens a newer schema)", () => {
  it("flushes registered work, closes for good and flags the change", async () => {
    const name = uniqueName();
    const first = new AppDB(name);
    await first.checkStorage();
    const changes: boolean[] = [];
    first.onStatus((s) => changes.push(s.versionChanged));
    // Pending work runs on the still-open connection before it closes.
    first.beforeClose(() => first.settings.put({ key: "settings", weightUnit: "lb" } as never));

    const next = newerVersion(name);
    await next.open();

    expect(first.status.versionChanged).toBe(true);
    expect(changes).toEqual([true]);
    expect(first.isOpen()).toBe(false);
    expect(next.verno).toBe(first.verno + 1);
    expect(await next.settings.get("settings")).toMatchObject({ weightUnit: "lb" });
    // No silent auto-reopen with the old schema code.
    await expect(first.sessions.toArray()).rejects.toThrow(Dexie.DatabaseClosedError);
    expect(first.isOpen()).toBe(false);
    next.close();
  });

  it("closes after a timeout when pending work never settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const name = uniqueName();
    const first = new AppDB(name);
    await first.checkStorage();
    first.beforeClose(() => new Promise(() => {}));
    const opening = newerVersion(name).open();
    await until(() => first.status.versionChanged);
    expect(first.isOpen()).toBe(true);
    await vi.advanceTimersByTimeAsync(CLOSE_FLUSH_TIMEOUT_MS);
    const next = await opening;
    expect(first.isOpen()).toBe(false);
    next.close();
  });

  it("shows the reload banner in the first tab (AppStatus)", async () => {
    const name = uniqueName();
    const first = new AppDB(name);
    render(AppStatus, { db: first });
    await until(() => first.isOpen());
    expect(screen.queryByText("App updated in another tab")).toBeNull();

    const next = newerVersion(name);
    await next.open();
    expect(await screen.findByText("App updated in another tab")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByText(/Everything is already saved/)).toBeTruthy();
    next.close();
  });
});

describe("blocked upgrade", () => {
  it("flags blocked while an old connection ignores versionchange, clears it once open", async () => {
    const name = uniqueName();
    // An old-version client that doesn't close on versionchange (e.g. a hung tab).
    const old = await new Promise<IDBDatabase>((res) => {
      const req = indexedDB.open(name, 1);
      req.onsuccess = () => res(req.result);
    });
    const next = new AppDB(name);
    const checking = next.checkStorage();
    expect((await next.untilProblem()).blocked).toBe(true);
    old.close();
    await checking;
    expect(next.status.blocked).toBe(false);
    expect(next.status.openError).toBeUndefined();
    next.close();
  });
});

describe("open errors", () => {
  const failingFactory = (error: DOMException) => {
    const factory = new IDBFactory();
    vi.spyOn(factory, "open").mockImplementation(() => {
      const req = {} as IDBOpenDBRequest & { error: DOMException };
      setTimeout(() => {
        Object.defineProperty(req, "error", { value: error });
        req.onerror?.({ target: req, preventDefault() {}, stopPropagation() {} } as never);
      });
      return req;
    });
    return factory;
  };

  it("classifies errors", () => {
    expect(storageProblem(new Dexie.MissingAPIError())).toBe("unsupported");
    expect(storageProblem(new Dexie.OpenFailedError(new DOMException("full", "QuotaExceededError")))).toBe("quota");
    expect(storageProblem(new Dexie.OpenFailedError(new DOMException("x", "InvalidStateError")))).toBe("unavailable");
    expect(isQuotaError(new Dexie.AbortError("aborted", new DOMException("full", "QuotaExceededError")))).toBe(true);
    expect(isQuotaError(new Error("other"))).toBe(false);
  });

  it("records a quota failure on open instead of throwing", async () => {
    const broken = new AppDB(uniqueName(), { indexedDB: failingFactory(new DOMException("full", "QuotaExceededError")), IDBKeyRange });
    const status = await broken.checkStorage();
    expect(status.openError?.problem).toBe("quota");
  });

  it("records a missing IndexedDB as unsupported at once and shows the full-screen message", async () => {
    // Dexie captures `indexedDB` at import; an explicit undefined is what a browser without it gives.
    const broken = new AppDB(uniqueName(), { indexedDB: undefined });
    expect(await broken.untilProblem()).toMatchObject({ openError: { problem: "unsupported" } });
    render(AppStatus, { db: broken });
    expect(await screen.findByText("Storage unavailable")).toBeTruthy();
    expect(screen.getByText(/Private or incognito/)).toBeTruthy();
  });

  it("flags a slow open (e.g. long migration) as 'Still opening' without Reload, and clears it when the open succeeds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const factory = new IDBFactory();
    const realOpen = factory.open.bind(factory);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Hold the open request back until released, as a hung browser open would.
    vi.spyOn(factory, "open").mockImplementation((name, version) => {
      const req = realOpen(name, version);
      const handlers: Record<string, unknown> = {};
      for (const k of ["onsuccess", "onerror", "onupgradeneeded", "onblocked"] as const) {
        Object.defineProperty(req, k, {
          configurable: true,
          get: () => handlers[k],
          set: (fn) => (handlers[k] = (ev: Event) => void gate.then(() => (fn as (e: Event) => void)(ev))),
        });
      }
      return req;
    });
    const slow = new AppDB(uniqueName(), { indexedDB: factory, IDBKeyRange });
    const problem = slow.untilProblem();
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    const status = await problem;
    expect(status.slow).toBe(true);
    expect(status.openError).toBeUndefined();
    render(AppStatus, { db: slow });
    expect(await screen.findByText("Still opening your data…")).toBeTruthy();
    expect(screen.queryByText("Storage unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
    release();
    await vi.waitFor(() => expect(slow.status.slow).toBe(false));
    expect(slow.status.openError).toBeUndefined();
    expect(slow.isOpen()).toBe(true);
    await vi.waitFor(() => expect(screen.queryByText("Still opening your data…")).toBeNull());
    slow.close();
  });

  it("untilProblem doesn't resolve when the database opens fine", async () => {
    const ok = new AppDB(uniqueName());
    const result = await Promise.race([ok.untilProblem(), ok.checkStorage().then(() => "opened")]);
    expect(result).toBe("opened");
    ok.close();
  });
});

describe("failed workout writes", () => {
  beforeEach(async () => {
    await db.sessions.clear();
  });

  it("shows a persistent danger banner while writes fail and clears it after the retry succeeds", async () => {
    const { active } = await import("#lib/logger/activeSession.svelte");
    await active.start({ name: "Push" });
    render(AppStatus);
    const save = vi.spyOn(sessions, "saveSession").mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));

    await active.mutate((s) => (s.name = "A"), { persist: "now" });
    expect(active.writeFailed).toBe(true);
    expect(await screen.findByText("Workout not saved")).toBeTruthy();
    expect(screen.getByText(/out of storage/)).toBeTruthy();
    expect(screen.getByText(/Free up space/)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    // The next mutation retries and succeeds.
    await active.mutate((s) => (s.name = "B"), { persist: "now" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(active.writeFailed).toBe(false);
    await vi.waitFor(() => expect(screen.queryByText("Workout not saved")).toBeNull());
    expect((await db.sessions.get(active.session!.id))?.name).toBe("B");
    await active.discard();
  });

  it("only advises freeing space for quota errors; otherwise suggests Retry and a backup", async () => {
    const { active } = await import("#lib/logger/activeSession.svelte");
    await active.start({ name: "Push" });
    render(AppStatus);
    vi.spyOn(sessions, "saveSession").mockRejectedValueOnce(new Error("disk I/O"));
    await active.mutate((s) => (s.name = "A"), { persist: "now" });
    expect(await screen.findByText("Workout not saved")).toBeTruthy();
    expect(screen.queryByText(/Free up space/)).toBeNull();
    expect(screen.getByText(/Tap Retry/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "export a backup" })).toBeTruthy();
    await active.flush();
    await active.discard();
  });
});

// Last: it closes the shared app database for good, as a real newer tab would.
describe("versionchange on the app database", () => {
  it("saves the active workout's pending deferred edit before closing", async () => {
    await db.sessions.clear();
    const store = new ActiveSessionStore();
    await store.start({ name: "Push" });
    await store.mutate((s) => (s.name = "Typed just now"), { persist: "deferred" });

    // `db` is the app's shared instance; open a newer version of the real database.
    const next = newerVersion(db.name);
    await next.open();
    const row = await next.sessions.get(store.session!.id);
    expect(row?.name).toBe("Typed just now");
    next.close();
  });
});
