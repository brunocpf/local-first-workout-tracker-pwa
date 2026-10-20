import Dexie, { type EntityTable } from "dexie";
import type { PersistenceStatus } from "#lib/storage/persistence";

// Device-validation helpers (PRD §2.2/§2.3, docs/browser-limitations.md). No app data is touched.

/** Separate from the app database so the probe can never interfere with user data. Name must stay app-specific (shared github.io origin). */
export const PROBE_DB_NAME = "workout-tracker-probe";

export type ProbeRecord = { key: "probe"; firstSeenAt: string; lastSeenAt: string; launchCount: number };

class ProbeDB extends Dexie {
  probe!: EntityTable<ProbeRecord, "key">;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ probe: "key" });
  }
}

/** Records one page load: `firstSeenAt` is set once and never changes, `launchCount` goes up by one. Call once per page load. */
export async function recordProbeLaunch(dbName = PROBE_DB_NAME, now: Date = new Date()): Promise<ProbeRecord> {
  const probeDb = new ProbeDB(dbName);
  try {
    const iso = now.toISOString();
    return await probeDb.transaction("rw", probeDb.probe, async () => {
      const prev = await probeDb.probe.get("probe");
      const next: ProbeRecord = {
        key: "probe",
        firstSeenAt: prev?.firstSeenAt ?? iso,
        lastSeenAt: iso,
        launchCount: (prev?.launchCount ?? 0) + 1,
      };
      await probeDb.probe.put(next);
      return next;
    });
  } finally {
    probeDb.close();
  }
}

export type Capabilities = {
  /** Running as an installed app (home-screen / standalone window) rather than in a browser tab. */
  standalone: boolean;
  canShareFiles: boolean;
  wakeLock: boolean;
  vibrate: boolean;
  /** `Notification` exists; permission is the current state, or null when unsupported. */
  notifications: boolean;
  notificationPermission: NotificationPermission | null;
  serviceWorkerSupported: boolean;
  /** A service worker currently controls this page (false on the first load before activation). */
  serviceWorkerControlled: boolean;
  userAgent: string;
};

export type CapabilityEnv = {
  navigator?: Partial<Navigator> & { standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
  Notification?: { permission: NotificationPermission };
};

export function detectCapabilities(env: CapabilityEnv = globalThis as unknown as CapabilityEnv): Capabilities {
  const nav = env.navigator;
  let standalone = nav?.standalone === true;
  try {
    standalone ||= env.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    // matchMedia can throw in odd embedded webviews; fall back to navigator.standalone.
  }
  let canShareFiles = false;
  try {
    canShareFiles =
      typeof nav?.canShare === "function" &&
      nav.canShare({ files: [new File(["x"], "probe.json", { type: "application/json" })] });
  } catch {
    // canShare throws on some engines for unsupported payloads.
  }
  const notification = env.Notification;
  return {
    standalone,
    canShareFiles,
    wakeLock: !!nav && "wakeLock" in nav && !!nav.wakeLock,
    vibrate: typeof nav?.vibrate === "function",
    notifications: !!notification,
    notificationPermission: notification?.permission ?? null,
    serviceWorkerSupported: !!nav && "serviceWorker" in nav && !!nav.serviceWorker,
    serviceWorkerControlled: !!nav?.serviceWorker?.controller,
    userAgent: nav?.userAgent ?? "unknown",
  };
}

const yn = (v: boolean) => (v ? "yes" : "no");

export function formatBytes(n: number | undefined): string {
  if (n === undefined) return "unknown";
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const persistedLabel = (p: boolean | null) => (p === null ? "unknown" : yn(p));

export type DiagnosticsSnapshot = {
  appVersion: string;
  capabilities: Capabilities;
  persistence: PersistenceStatus;
  probe: ProbeRecord | null;
  generatedAt: string;
};

/** Plain-text multi-line report for pasting into an issue / notes. */
export function formatReport(s: DiagnosticsSnapshot): string {
  const c = s.capabilities;
  const p = s.persistence;
  return [
    "Workout Tracker diagnostics",
    `Generated: ${s.generatedAt}`,
    `App version: ${s.appVersion}`,
    `User agent: ${c.userAgent}`,
    `Standalone (installed): ${yn(c.standalone)}`,
    `Service worker supported: ${yn(c.serviceWorkerSupported)}`,
    `Service worker controlling page: ${yn(c.serviceWorkerControlled)}`,
    `Share files (navigator.canShare): ${yn(c.canShareFiles)}`,
    `Screen wake lock: ${yn(c.wakeLock)}`,
    `Vibration: ${yn(c.vibrate)}`,
    `Notifications: ${yn(c.notifications)}${c.notificationPermission ? ` (${c.notificationPermission})` : ""}`,
    `Storage API: ${yn(p.supported)}`,
    `Persistent storage: ${persistedLabel(p.persisted)}`,
    `Storage usage: ${formatBytes(p.usageBytes)} of ${formatBytes(p.quotaBytes)}`,
    `First seen: ${s.probe?.firstSeenAt ?? "unavailable"}`,
    `Last seen: ${s.probe?.lastSeenAt ?? "unavailable"}`,
    `Launch count: ${s.probe?.launchCount ?? "unavailable"}`,
  ].join("\n");
}
