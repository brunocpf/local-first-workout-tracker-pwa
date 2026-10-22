import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { detectCapabilities, formatBytes, formatReport, recordProbeLaunch } from "#lib/diagnostics";

let n = 0;
const uniqueName = () => `workout-tracker-probe-test-${++n}-${Math.random().toString(36).slice(2)}`;

describe("probe", () => {
  it("counts launches, keeps firstSeenAt, updates lastSeenAt", async () => {
    const name = uniqueName();
    const a = await recordProbeLaunch(name, new Date("2026-01-01T10:00:00Z"));
    const b = await recordProbeLaunch(name, new Date("2026-01-02T10:00:00Z"));
    const c = await recordProbeLaunch(name, new Date("2026-01-03T10:00:00Z"));
    expect(a.launchCount).toBe(1);
    expect([b.launchCount, c.launchCount]).toEqual([2, 3]);
    expect(c.firstSeenAt).toBe("2026-01-01T10:00:00.000Z");
    expect(c.lastSeenAt).toBe("2026-01-03T10:00:00.000Z");
  });
  it("is isolated per database name", async () => {
    const a = await recordProbeLaunch(uniqueName());
    const b = await recordProbeLaunch(uniqueName());
    expect([a.launchCount, b.launchCount]).toEqual([1, 1]);
  });
});

describe("detectCapabilities", () => {
  it("detects a fully capable installed browser", () => {
    const c = detectCapabilities({
      navigator: {
        canShare: () => true,
        wakeLock: {} as WakeLock,
        vibrate: () => true,
        serviceWorker: { controller: {} } as ServiceWorkerContainer,
        userAgent: "UA",
      },
      matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
      Notification: { permission: "default" },
    });
    expect(c).toEqual({
      standalone: true,
      canShareFiles: true,
      wakeLock: true,
      vibrate: true,
      notifications: true,
      notificationPermission: "default",
      serviceWorkerSupported: true,
      serviceWorkerControlled: true,
      userAgent: "UA",
    });
  });
  it("reports everything missing for a bare environment", () => {
    const c = detectCapabilities({});
    expect(c).toMatchObject({
      standalone: false,
      canShareFiles: false,
      wakeLock: false,
      vibrate: false,
      notifications: false,
      notificationPermission: null,
      serviceWorkerSupported: false,
      serviceWorkerControlled: false,
      userAgent: "unknown",
    });
  });
  it("uses iOS navigator.standalone and tolerates canShare/matchMedia throwing", () => {
    const c = detectCapabilities({
      navigator: {
        standalone: true,
        canShare: () => {
          throw new Error("x");
        },
      },
      matchMedia: () => {
        throw new Error("y");
      },
    });
    expect(c.standalone).toBe(true);
    expect(c.canShareFiles).toBe(false);
  });
  it("is not standalone in a tab", () => {
    expect(detectCapabilities({ navigator: {}, matchMedia: () => ({ matches: false }) }).standalone).toBe(false);
  });
});

describe("report", () => {
  it("formats bytes", () => {
    expect(formatBytes(undefined)).toBe("unknown");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MiB");
  });
  it("is a readable multi-line summary", () => {
    const text = formatReport({
      appVersion: "v1",
      capabilities: detectCapabilities({ navigator: { userAgent: "UA" }, matchMedia: () => ({ matches: true }) }),
      persistence: { supported: true, persisted: false, usageBytes: 1024, quotaBytes: 2048 },
      probe: { key: "probe", firstSeenAt: "a", lastSeenAt: "b", launchCount: 4 },
      generatedAt: "now",
    });
    expect(text.split("\n").length).toBeGreaterThan(10);
    expect(text).toContain("App version: v1");
    expect(text).toContain("Standalone (installed): yes");
    expect(text).toContain("Persistent storage: no");
    expect(text).toContain("Storage usage: 1.0 KiB of 2.0 KiB");
    expect(text).toContain("Launch count: 4");
  });
});
