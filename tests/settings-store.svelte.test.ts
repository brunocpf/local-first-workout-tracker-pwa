import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, SETTINGS_KEY } from "#lib/storage/db";
import { DEFAULT_SETTINGS, getSettings } from "#lib/storage/settings";
import { initSettings, settings, THEME_STORAGE_KEY, updateSettings } from "#lib/settings.svelte";

const root: { dataset: Record<string, string> } = { dataset: {} };
const store = new Map<string, string>();

beforeEach(async () => {
  await db.settings.clear();
  root.dataset = {};
  store.clear();
  Object.assign(settings, DEFAULT_SETTINGS);
  vi.stubGlobal("document", { documentElement: root, querySelectorAll: () => [] });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("settings store", () => {
  it("effort entry is off by default, including for settings stored before it existed", async () => {
    expect(DEFAULT_SETTINGS.effortInput).toBe("off");
    await db.settings.put({ key: SETTINGS_KEY, weightUnit: "lb" } as never);
    expect((await getSettings()).effortInput).toBe("off");
    await initSettings();
    expect(settings.effortInput).toBe("off");
    await updateSettings({ effortInput: "rir" });
    expect((await getSettings()).effortInput).toBe("rir");
  });

  it("length unit defaults to cm, including for settings stored before it existed, and persists", async () => {
    expect(DEFAULT_SETTINGS.lengthUnit).toBe("cm");
    await db.settings.put({ key: SETTINGS_KEY, weightUnit: "lb" } as never);
    expect((await getSettings()).lengthUnit).toBe("cm");
    await initSettings();
    await updateSettings({ lengthUnit: "in" });
    expect((await getSettings()).lengthUnit).toBe("in");
  });

  it("init merges stored values over defaults", async () => {
    await db.settings.put({ key: SETTINGS_KEY, weightUnit: "lb" } as never);
    await initSettings();
    expect(settings.weightUnit).toBe("lb");
    expect(settings.defaultRestSeconds).toBe(DEFAULT_SETTINGS.defaultRestSeconds);
  });

  it("update applies optimistically and persists", async () => {
    const pending = updateSettings({ defaultRestSeconds: 120 });
    expect(settings.defaultRestSeconds).toBe(120);
    await pending;
    expect((await getSettings()).defaultRestSeconds).toBe(120);
  });

  it("applies and mirrors the theme, removing it for system", async () => {
    await updateSettings({ theme: "dark" });
    expect(root.dataset.theme).toBe("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    await updateSettings({ theme: "system" });
    expect(root.dataset.theme).toBeUndefined();
    expect(store.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("survives unavailable localStorage", async () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {},
    });
    await updateSettings({ theme: "light" });
    expect(root.dataset.theme).toBe("light");
  });
});
