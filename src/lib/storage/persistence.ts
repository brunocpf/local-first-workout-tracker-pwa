export type PersistenceStatus = {
  /** `navigator.storage` exists at all. */
  supported: boolean;
  /** True when the browser guarantees data survives storage pressure; null = unknown/unsupported. */
  persisted: boolean | null;
  usageBytes?: number;
  quotaBytes?: number;
};

type StorageLike = Pick<StorageManager, "persist" | "persisted" | "estimate">;

async function read(storage: Partial<StorageLike> | undefined, requestIfNeeded: boolean): Promise<PersistenceStatus> {
  if (!storage) return { supported: false, persisted: null };
  const status: PersistenceStatus = { supported: true, persisted: null };
  try {
    if (storage.persisted) status.persisted = await storage.persisted();
    if (requestIfNeeded && status.persisted !== true && storage.persist) status.persisted = await storage.persist();
  } catch {
    // Treat failures as "unknown"; the app must work without persistence.
  }
  try {
    const e = await storage.estimate?.();
    status.usageBytes = e?.usage;
    status.quotaBytes = e?.quota;
  } catch {
    // estimate() is optional.
  }
  return status;
}

/** Asks the browser to make storage persistent (once already granted it's a no-op). Safe to call at startup / after the first workout. */
export const requestPersistentStorage = (storage: Partial<StorageLike> | undefined = globalThis.navigator?.storage) => read(storage, true);

/** Same status without prompting; for a settings screen. */
export const getPersistenceStatus = (storage: Partial<StorageLike> | undefined = globalThis.navigator?.storage) => read(storage, false);
