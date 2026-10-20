import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#lib/storage/db";
import { ActiveSessionStore } from "#lib/logger/activeSession.svelte";
import { WakeLock, wakeLock } from "#lib/wakeLock";

vi.mock("#lib/pwa/update.svelte", () => ({ setCanUpdate: () => {} }));

class FakeSentinel extends EventTarget {
  release = vi.fn(async () => {
    this.dispatchEvent(new Event("release"));
  });
}

/** Installs a fake `navigator.wakeLock`; returns the `request` mock and every sentinel it handed out. */
function stubWakeLock(request?: () => Promise<FakeSentinel>) {
  const sentinels: FakeSentinel[] = [];
  const requestMock = vi.fn(
    request ??
      (async () => {
        const sentinel = new FakeSentinel();
        sentinels.push(sentinel);
        return sentinel;
      }),
  );
  Object.defineProperty(navigator, "wakeLock", { value: { request: requestMock }, configurable: true });
  return { request: requestMock, sentinels };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(async () => {
  await db.sessions.clear();
});
afterEach(async () => {
  await wakeLock.release();
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (document as { visibilityState?: unknown }).visibilityState;
  vi.restoreAllMocks();
});

describe("WakeLock without the Screen Wake Lock API", () => {
  it("reports unsupported and never throws", async () => {
    const lock = new WakeLock();
    expect(lock.supported).toBe(false);
    await expect(lock.acquire()).resolves.toBeUndefined();
    await expect(lock.release()).resolves.toBeUndefined();
    setVisibility("visible");
    await lock.acquire();
    await lock.release();
  });
});

describe("WakeLock with the API", () => {
  it("requests a screen lock once however often acquire is called", async () => {
    const { request } = stubWakeLock();
    const lock = new WakeLock();
    expect(lock.supported).toBe(true);
    await Promise.all([lock.acquire(), lock.acquire()]);
    await lock.acquire();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");
    await lock.release();
  });

  it("releases the sentinel on release()", async () => {
    const { sentinels } = stubWakeLock();
    const lock = new WakeLock();
    await lock.acquire();
    await lock.release();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("swallows a refused request and retries on the next acquire", async () => {
    const refused = new DOMException("denied", "NotAllowedError");
    const request = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce(new FakeSentinel());
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const lock = new WakeLock();
    await expect(lock.acquire()).resolves.toBeUndefined();
    await lock.acquire();
    expect(request).toHaveBeenCalledTimes(2);
    await lock.release();
  });

  it("re-requests when the page becomes visible again while still wanted", async () => {
    const { request, sentinels } = stubWakeLock();
    const lock = new WakeLock();
    await lock.acquire();
    // The browser drops the lock when the page is hidden.
    setVisibility("hidden");
    sentinels[0].dispatchEvent(new Event("release"));
    setVisibility("visible");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await lock.release();
  });

  it("does not re-request on visibility change after release()", async () => {
    const { request } = stubWakeLock();
    const lock = new WakeLock();
    await lock.acquire();
    await lock.release();
    setVisibility("hidden");
    setVisibility("visible");
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-requests after the browser releases the lock on its own", async () => {
    const { request, sentinels } = stubWakeLock();
    const lock = new WakeLock();
    await lock.acquire();
    sentinels[0].dispatchEvent(new Event("release"));
    await lock.acquire();
    expect(request).toHaveBeenCalledTimes(2);
    await lock.release();
  });

  it("releases a lock granted after release() was called mid-request", async () => {
    const sentinel = new FakeSentinel();
    let grant!: (s: FakeSentinel) => void;
    stubWakeLock(() => new Promise<FakeSentinel>((resolve) => (grant = resolve)));
    const lock = new WakeLock();
    const pending = lock.acquire();
    await lock.release();
    grant(sentinel);
    await pending;
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });
});

describe("active session store integration", () => {
  it("holds the lock while a session is active and releases it on finish", async () => {
    const { request, sentinels } = stubWakeLock();
    const store = new ActiveSessionStore();
    await store.start({ name: "Push" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sentinels[0].release).not.toHaveBeenCalled();

    await store.finish();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("releases the lock on discard", async () => {
    const { sentinels } = stubWakeLock();
    const store = new ActiveSessionStore();
    await store.start({ name: "Legs" });
    await store.discard();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });
});
