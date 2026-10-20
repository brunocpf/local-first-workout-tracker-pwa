// Optional background rest-timer notifications (ADR 0014). A tiny relay sends a Web Push at `endsAt`; everything
// here is best effort: no relay, no permission or any failure just leaves the foreground alert as the only cue.
// The push subscription lives in localStorage only (never Dexie, so never in a backup) and is never logged.
import { detectPlatform, isStandalone, type InstallEnv, type InstallPlatform } from "#lib/pwa/install";
import type { RestTimer } from "#lib/types";

export type PushConfig = { relayUrl: string; vapidPublicKey: string };

export const pushConfig: PushConfig = {
  relayUrl: (import.meta.env.VITE_PUSH_RELAY_URL ?? "").replace(/\/+$/, ""),
  vapidPublicKey: import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? "",
};

const SUB_KEY = "workout-tracker:push-subscription";
const DEVICE_KEY = "workout-tracker:push-device-id";
const REQUEST_TIMEOUT_MS = 5000;
/** A visible page this close to the end handles the alert itself, so the relay push is cancelled (no duplicate). */
export const FOREGROUND_CANCEL_MS = 3000;

export type PushEnv = InstallEnv & {
  Notification?: { permission: NotificationPermission; requestPermission(): Promise<NotificationPermission> };
  PushManager?: unknown;
};

export type PushSupport =
  /** No relay configured in this build. */
  | "unconfigured"
  /** No service worker / Push API / Notification API. */
  | "unsupported"
  /** iOS only delivers Web Push to an app added to the Home Screen. */
  | "needs-install"
  | "ready";

/** Whether this build has a relay at all; without one the feature is hidden entirely. */
export const isPushConfigured = (config: PushConfig = pushConfig) => !!config.relayUrl && !!config.vapidPublicKey;

export function pushSupport(config: PushConfig = pushConfig, env: PushEnv = globalThis as unknown as PushEnv): PushSupport {
  if (!isPushConfigured(config)) return "unconfigured";
  // Checked first: a Safari tab doesn't expose the Push API at all, but the installed app does.
  if (detectPlatform(env) === "ios" && !isStandalone(env)) return "needs-install";
  const nav = env.navigator as (Navigator & { serviceWorker?: unknown }) | undefined;
  if (!nav?.serviceWorker || !env.PushManager || !env.Notification) return "unsupported";
  return "ready";
}

/** Where background notifications work, per platform: only iOS needs the Home Screen app (docs/browser-limitations.md). */
export const PUSH_PLATFORM_NOTE: Record<InstallPlatform, string> = {
  ios: "On iPhone and iPad this only works in the installed app: tap Share, then Add to Home Screen, open the app from there and turn this on.",
  android: "Works in Chrome and in the installed app, as long as notifications are allowed for it.",
  desktop: "Works in most desktop browsers while the browser is running, as long as notifications are allowed for this site.",
};

export const notificationPermission = (env: PushEnv = globalThis as unknown as PushEnv) => env.Notification?.permission ?? null;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function hasSubscription(store = storage()): boolean {
  try {
    return !!store?.getItem(SUB_KEY);
  } catch {
    return false;
  }
}

function storedSubscription(store = storage()): PushSubscriptionJSON | undefined {
  try {
    const raw = store?.getItem(SUB_KEY);
    return raw ? (JSON.parse(raw) as PushSubscriptionJSON) : undefined;
  } catch {
    return undefined;
  }
}

/** Stable random id for this device: re-scheduling replaces the previous push, so at most one is pending. */
function deviceId(store = storage()): string {
  try {
    let id = store?.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      store?.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export type EnableResult = "enabled" | "denied" | "unavailable" | "failed";

/** Call from a click handler: permission prompts need a user gesture (required on iOS). */
export async function enablePush(
  config: PushConfig = pushConfig,
  env: PushEnv = globalThis as unknown as PushEnv,
  store = storage(),
): Promise<EnableResult> {
  if (pushSupport(config, env) !== "ready") return "unavailable";
  try {
    const permission = await env.Notification!.requestPermission();
    if (permission !== "granted") return "denied";
    const reg = await env.navigator!.serviceWorker!.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.vapidPublicKey) });
    store?.setItem(SUB_KEY, JSON.stringify(sub.toJSON()));
    return "enabled";
  } catch {
    return "failed";
  }
}

export async function disablePush(env: PushEnv = globalThis as unknown as PushEnv, store = storage()): Promise<void> {
  void cancelPush();
  try {
    store?.removeItem(SUB_KEY);
    const reg = await env.navigator?.serviceWorker?.ready;
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // The local record is gone either way; a stale browser subscription is harmless without a relay entry.
  }
}

async function post(path: string, body: unknown, config: PushConfig = pushConfig, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher(`${config.relayUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Schedule/cancel requests for the one pending push run strictly one after another, and a request that is
// superseded while it waits is skipped: the relay always ends up with the latest intent (adjust then skip can't
// leave a stray push, pause then resume can't lose one).
let chain: Promise<unknown> = Promise.resolve();
let latest = 0;

function serialized(task: () => Promise<boolean>): Promise<boolean> {
  const ticket = ++latest;
  const run = chain.then(() => (ticket === latest ? task() : false));
  chain = run.catch(() => {});
  return run;
}

/** Ask the relay to push at `fireAt` (replacing any pending push). Silent on failure. */
export function schedulePush(fireAt: string, config: PushConfig = pushConfig, fetcher?: typeof fetch): Promise<boolean> {
  const subscription = storedSubscription();
  if (!subscription || !config.relayUrl) return Promise.resolve(false);
  return serialized(() => post("/schedule", { id: deviceId(), subscription, fireAt }, config, fetcher));
}

export function cancelPush(config: PushConfig = pushConfig, fetcher?: typeof fetch): Promise<boolean> {
  if (!hasSubscription() || !config.relayUrl) return Promise.resolve(false);
  return serialized(() => post("/cancel", { id: deviceId() }, config, fetcher));
}

/** "Send test notification": a push in a few seconds, on its own id so it can't replace a rest timer. */
export async function sendTestPush(config: PushConfig = pushConfig, fetcher?: typeof fetch, now = Date.now()): Promise<boolean> {
  const subscription = storedSubscription();
  if (!subscription || !config.relayUrl) return false;
  return post("/schedule", { id: `${deviceId()}-test`, subscription, fireAt: new Date(now + 5000).toISOString() }, config, fetcher);
}

export type PushPlan = "schedule" | "cancel";

/**
 * What the relay should hold for this timer right now. Nothing for a missing, paused or finished timer; and
 * nothing once a visible page is within `FOREGROUND_CANCEL_MS` of the end (it plays the alert itself). If the
 * page is hidden after that, the plan flips back to "schedule" and the push covers the rest.
 */
export function pushPlan(timer: RestTimer | undefined, visible: boolean, now = Date.now()): PushPlan {
  if (!timer || timer.pausedRemainingMs !== undefined) return "cancel";
  const left = Date.parse(timer.endsAt) - now;
  if (left <= 0) return "cancel";
  if (visible && left <= FOREGROUND_CANCEL_MS) return "cancel";
  return "schedule";
}
