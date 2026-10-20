import "fake-indexeddb/auto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { render, screen } from "@testing-library/svelte";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDB, CLOSE_FLUSH_TIMEOUT_MS, db, isQuotaError, storageProblem } from "#lib/storage/db";
import { ActiveSessionStore } from "#lib/logger/activeSession.svelte";
import * as sessions from "#lib/storage/sessions";
import AppStatus from "#lib/components/AppStatus.svelte";

vi.mock("#lib/pwa/update.svelte", () => ({ setCanUpdate: () => {} }));
vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));

let n = 0;
const uniqueName = () => `lifecycle-${++n}-${Math.random()}`;

/** Simulates a newer app version in another tab: same database, higher schema version. */
function newerVersion(name: string) {
  return new (class extends AppDB {
    constructor() {
      super(name);
      this.version(2).stores({ sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds, endedAt" });
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
    expect(next.verno).toBe(2);
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
    await until(() => next.status.blocked);
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

  it("records a missing IndexedDB as unsupported and shows the full-screen message", async () => {
    const broken = new AppDB(uniqueName(), { indexedDB: undefined as never, IDBKeyRange });
    // Dexie falls back to the global factory when the option is undefined, so remove it for this instance.
    (broken as unknown as { _deps: { indexedDB: unknown } })._deps.indexedDB = undefined;
    render(AppStatus, { db: broken });
    expect(await screen.findByText("Storage unavailable")).toBeTruthy();
    expect(broken.status.openError?.problem).toBe("unsupported");
    expect(screen.getByText(/Private or incognito/)).toBeTruthy();
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
    expect(screen.getByRole("alert")).toBeTruthy();

    // The next mutation retries and succeeds.
    await active.mutate((s) => (s.name = "B"), { persist: "now" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(active.writeFailed).toBe(false);
    await vi.waitFor(() => expect(screen.queryByText("Workout not saved")).toBeNull());
    expect((await db.sessions.get(active.session!.id))?.name).toBe("B");
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
