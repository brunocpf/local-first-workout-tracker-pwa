export type InstallPlatform = "ios" | "android" | "desktop";

export type InstallEnv = {
  navigator?: Partial<Navigator> & { standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
};

const DISMISS_KEY = "workout-tracker:install-hint-dismissed";

/** Running as an installed app (display-mode: standalone, or iOS `navigator.standalone`). */
export function isStandalone(env: InstallEnv = globalThis as unknown as InstallEnv): boolean {
  if (env.navigator?.standalone === true) return true;
  try {
    return env.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/** Coarse platform detection. iPadOS 13+ reports as a Mac with touch points. */
export function detectPlatform(env: InstallEnv = globalThis as unknown as InstallEnv): InstallPlatform {
  const nav = env.navigator;
  const ua = nav?.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export const INSTALL_STEPS: Record<InstallPlatform, string[]> = {
  ios: [
    "Open this page in Safari.",
    "Tap the Share button, then Add to Home Screen, then Add.",
    "Open the app from the Home Screen icon and use it from there.",
  ],
  android: [
    "Open this page in Chrome.",
    "Open the menu and tap Install app (or accept the install prompt).",
    "Open the app from your launcher or home screen.",
  ],
  desktop: [
    "In Chrome or Edge, click the install icon in the address bar, or open the menu and choose Install.",
    "In Safari 17+ on Mac, use File, then Add to Dock.",
    "Firefox can't install web apps; it still works as a normal tab.",
  ],
};

export const IOS_STORAGE_NOTE =
  "On iPhone and iPad the installed app and the Safari tab keep separate data. Data logged in the tab won't appear in the installed app. Install first and log only there; move data between them with backup and restore.";

/** Optional enhancement only: the native prompt isn't available on iOS/Safari/Firefox. */
type DeferredPrompt = Event & { prompt: () => Promise<unknown> };
let deferred: DeferredPrompt | undefined;

export function captureInstallPrompt(target: Pick<Window, "addEventListener"> = window): void {
  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as DeferredPrompt;
  });
  target.addEventListener("appinstalled", () => {
    deferred = undefined;
  });
}

export function canPromptInstall(): boolean {
  return deferred !== undefined;
}

export async function promptInstall(): Promise<void> {
  const p = deferred;
  deferred = undefined;
  await p?.prompt();
}

export function isDismissed(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberDismissed(storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(DISMISS_KEY, "1");
  } catch {
    // Dismissal just won't persist.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
