import { describe, expect, it, vi } from "vitest";
import { getPersistenceStatus, requestPersistentStorage } from "#lib/storage/persistence";

describe("persistence", () => {
  it("reports unsupported without navigator.storage", async () => {
    expect(await requestPersistentStorage(undefined)).toEqual({ supported: false, persisted: null });
  });
  it("requests persistence when not yet granted and reports estimate", async () => {
    const persist = vi.fn(async () => true);
    const s = await requestPersistentStorage({ persisted: async () => false, persist, estimate: async () => ({ usage: 5, quota: 100 }) });
    expect(persist).toHaveBeenCalledOnce();
    expect(s).toEqual({ supported: true, persisted: true, usageBytes: 5, quotaBytes: 100 });
  });
  it("does not re-request when already persisted, nor when only reading status", async () => {
    const persist = vi.fn(async () => true);
    await requestPersistentStorage({ persisted: async () => true, persist });
    await getPersistenceStatus({ persisted: async () => false, persist });
    expect(persist).not.toHaveBeenCalled();
  });
  it("survives denial and thrown errors", async () => {
    expect((await requestPersistentStorage({ persisted: async () => false, persist: async () => false })).persisted).toBe(false);
    const s = await requestPersistentStorage({ persisted: async () => { throw new Error("x"); }, estimate: async () => { throw new Error("y"); } });
    expect(s).toEqual({ supported: true, persisted: null });
  });
});
