// Minimal Web Push relay (ADR 0014). It holds a push subscription endpoint and a fire time, nothing else, and
// sends an empty VAPID-signed push at that time. Never workout data. Free on Cloudflare Workers + Durable Objects.
import { corsHeaders } from "./cors";
import { MAX_BODY_BYTES, parseCancel, parseSchedule } from "./validate";
import { importSigningKey, vapidAuthorization } from "./vapid";

// Just the slice of the Workers runtime types this file uses (no @cloudflare/workers-types dependency).
interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
interface DurableState {
  storage: DurableStorage;
}
interface Stub {
  fetch(request: Request): Promise<Response>;
}
export interface Env {
  TIMERS: { idFromName(name: string): unknown; get(id: unknown): Stub };
  LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function readJson(request: Request): Promise<unknown | undefined> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function handleRequest(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const cors = corsHeaders(request.headers.get("origin"), env.ALLOWED_ORIGIN);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  // A request from another origin is refused outright (CORS alone only stops browsers from reading replies).
  if (request.headers.get("origin") !== env.ALLOWED_ORIGIN) return json(403, { error: "forbidden" });
  if (request.method !== "POST") return json(405, { error: "method not allowed" }, cors);

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json(429, { error: "rate limited" }, cors);

  const path = new URL(request.url).pathname;
  const body = await readJson(request);
  if (body === undefined) return json(400, { error: "invalid request" }, cors);

  if (path === "/schedule") {
    const parsed = parseSchedule(body, now);
    if (!parsed.ok) return json(400, { error: parsed.error }, cors);
    const stub = env.TIMERS.get(env.TIMERS.idFromName(parsed.value.id));
    // The full validated body (subscription + fireAt) goes to the Durable Object, which stores just those.
    await stub.fetch(new Request("https://do/schedule", { method: "POST", body: JSON.stringify(body) }));
    return json(200, { ok: true }, cors);
  }
  if (path === "/cancel") {
    const parsed = parseCancel(body);
    if (!parsed.ok) return json(400, { error: parsed.error }, cors);
    const stub = env.TIMERS.get(env.TIMERS.idFromName(parsed.value.id));
    await stub.fetch(new Request("https://do/cancel", { method: "POST" }));
    return json(200, { ok: true }, cors);
  }
  return json(404, { error: "not found" }, cors);
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};

type Stored = { endpoint: string; fireAt: number };

/** One scheduled push: {endpoint, fireAt} plus an alarm. Re-scheduling the same id replaces it. */
export class PushTimer {
  constructor(
    private state: DurableState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/cancel") {
      await this.state.storage.deleteAlarm();
      await this.state.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    const parsed = parseSchedule(await request.json());
    if (!parsed.ok) return new Response(null, { status: 400 });
    const { endpoint, fireAt } = parsed.value;
    await this.state.storage.put("timer", { endpoint, fireAt } satisfies Stored);
    await this.state.storage.setAlarm(fireAt);
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    const timer = await this.state.storage.get<Stored>("timer");
    // Forget it first: a failed push is not retried (a late rest alert is worse than none).
    await this.state.storage.deleteAll();
    if (!timer) return;
    try {
      const key = await importSigningKey(this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
      await fetch(timer.endpoint, {
        method: "POST",
        headers: {
          authorization: await vapidAuthorization(timer.endpoint, key, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_SUBJECT),
          ttl: "60",
          urgency: "high",
          "content-length": "0",
        },
      });
    } catch {
      // Best effort: the app's foreground alert still works.
    }
  }
}
