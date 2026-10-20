import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsSchema } from "#lib/backup/format";
import { cancelPush, disablePush, enablePush, hasSubscription, pushPlan, pushSupport, schedulePush, sendTestPush, type PushConfig, type PushEnv } from "#lib/push";
import { startRestTimer } from "#lib/restTimer";
import { DEFAULT_SETTINGS } from "#lib/storage/settings";

const config: PushConfig = { relayUrl: "https://relay.test", vapidPublicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSryOQ8nobq3Ffi4Ay8QqNmbmmuxg94LWY" };
const store = new Map<string, string>();
const t0 = Date.parse("2026-01-01T10:00:00.000Z");

const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "a", auth: "b" } };
function env(over: Partial<PushEnv> & { permission?: NotificationPermission; subscribe?: () => Promise<unknown> } = {}): PushEnv {
  const unsubscribe = vi.fn(async () => true);
  return {
    navigator: {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe: over.subscribe ?? (async () => ({ toJSON: () => sub })), getSubscription: async () => ({ unsubscribe }) } }) },
    } as never,
    matchMedia: () => ({ matches: false }),
    PushManager: {},
    Notification: { permission: "default", requestPermission: async () => over.permission ?? "granted" },
    ...over,
  } as PushEnv;
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("pushSupport", () => {
  it("detects configuration, API support and iOS install requirement", () => {
    expect(pushSupport({ relayUrl: "", vapidPublicKey: "" }, env())).toBe("unconfigured");
    expect(pushSupport(config, { ...env(), PushManager: undefined })).toBe("unsupported");
    expect(pushSupport(config, env())).toBe("ready");
    const ios = { ...env(), navigator: { ...env().navigator, userAgent: "iPhone" } } as PushEnv;
    expect(pushSupport(config, ios)).toBe("needs-install");
    expect(pushSupport(config, { ...ios, PushManager: undefined, Notification: undefined })).toBe("needs-install"); // Safari tab
    expect(pushSupport(config, { ...ios, matchMedia: () => ({ matches: true }) })).toBe("ready");
  });
});

describe("enable / disable", () => {
  it("subscribes after permission and stores the subscription locally", async () => {
    expect(await enablePush(config, env())).toBe("enabled");
    expect(hasSubscription()).toBe(true);
  });
  it("reports denied and unavailable without subscribing", async () => {
    expect(await enablePush(config, env({ permission: "denied" }))).toBe("denied");
    expect(hasSubscription()).toBe(false);
    expect(await enablePush({ relayUrl: "", vapidPublicKey: "" }, env())).toBe("unavailable");
  });
  it("reports a failed subscribe", async () => {
    expect(await enablePush(config, env({ subscribe: async () => Promise.reject(new Error("no")) }))).toBe("failed");
  });
  it("disable forgets the subscription", async () => {
    await enablePush(config, env());
    await disablePush(env());
    expect(hasSubscription()).toBe(false);
  });
});

describe("schedule / cancel", () => {
  it("does nothing without a subscription", async () => {
    const fetcher = vi.fn();
    expect(await schedulePush("2026-01-01T10:01:00.000Z", config, fetcher)).toBe(false);
    expect(await cancelPush(config, fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("posts to the relay with a stable device id", async () => {
    await enablePush(config, env());
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await schedulePush("2026-01-01T10:01:00.000Z", config, fetcher as never)).toBe(true);
    expect(await cancelPush(config, fetcher as never)).toBe(true);
    const [[u1, i1], [u2, i2]] = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(u1).toBe("https://relay.test/schedule");
    expect(u2).toBe("https://relay.test/cancel");
    const a = JSON.parse(i1.body as string);
    expect(a).toMatchObject({ subscription: sub, fireAt: "2026-01-01T10:01:00.000Z" });
    expect(JSON.parse(i2.body as string).id).toBe(a.id);
  });
  it("serializes requests and skips superseded ones (latest intent wins)", async () => {
    await enablePush(config, env());
    const calls: string[] = [];
    const releases: (() => void)[] = [];
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      calls.push(`${url.slice(url.lastIndexOf("/"))} ${JSON.parse(init.body as string).fireAt ?? ""}`.trim());
      return new Promise<Response>((resolve) => releases.push(() => resolve(new Response("{}"))));
    });
    const f = fetcher as never;
    const first = schedulePush("2026-01-01T10:01:00.000Z", config, f);
    await vi.waitFor(() => expect(calls).toHaveLength(1)); // in flight
    const skipped = schedulePush("2026-01-01T10:01:15.000Z", config, f); // superseded before it starts
    const last = cancelPush(config, f);
    await Promise.resolve();
    expect(calls).toHaveLength(1); // nothing overlaps the request in flight
    releases[0]();
    expect(await first).toBe(true);
    expect(await skipped).toBe(false);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    releases[1]();
    expect(await last).toBe(true);
    expect(calls).toEqual(["/schedule 2026-01-01T10:01:00.000Z", "/cancel"]);
  });

  it("swallows relay failures", async () => {
    await enablePush(config, env());
    expect(await schedulePush("2026-01-01T10:01:00.000Z", config, (async () => Promise.reject(new Error("down"))) as never)).toBe(false);
    expect(await sendTestPush(config, (async () => new Response("", { status: 500 })) as never, t0)).toBe(false);
  });
});

describe("pushPlan", () => {
  const timer = startRestTimer(90, t0);
  it("schedules a running timer while the page is hidden or far from the end", () => {
    expect(pushPlan(timer, false, t0 + 89_000)).toBe("schedule");
    expect(pushPlan(timer, true, t0 + 10_000)).toBe("schedule");
  });
  it("cancels when absent, paused, finished or about to end in the foreground", () => {
    expect(pushPlan(undefined, false, t0)).toBe("cancel");
    expect(pushPlan({ ...timer, pausedRemainingMs: 5000 }, false, t0)).toBe("cancel");
    expect(pushPlan(timer, false, t0 + 91_000)).toBe("cancel");
    expect(pushPlan(timer, true, t0 + 88_000)).toBe("cancel");
  });
});

describe("backup settings", () => {
  it("round-trips the notification flag and never has a subscription field", () => {
    const parsed = settingsSchema.parse({ ...DEFAULT_SETTINGS, restNotifications: true, subscription: sub });
    expect(parsed.restNotifications).toBe(true);
    expect(parsed).not.toHaveProperty("subscription");
  });
});
