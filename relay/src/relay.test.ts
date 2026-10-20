// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { corsHeaders } from "./cors";
import { isAllowedPushEndpoint, MAX_DELAY_MS, parseCancel, parseSchedule } from "./validate";
import { fromB64url, importSigningKey, toB64url, vapidAuthorization } from "./vapid";
import { handleRequest, type Env } from "./worker";

const now = Date.parse("2026-01-01T10:00:00.000Z");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
const body = (over: object = {}) => ({
  id: "device-123456",
  subscription: { endpoint, keys: { p256dh: "abc", auth: "def" } },
  fireAt: new Date(now + 90_000).toISOString(),
  ...over,
});

describe("validation", () => {
  it("accepts a valid schedule", () => {
    expect(parseSchedule(body(), now)).toEqual({ ok: true, value: { id: "device-123456", endpoint, fireAt: now + 90_000 } });
  });
  it("rejects past, too-far and malformed fireAt", () => {
    expect(parseSchedule(body({ fireAt: new Date(now - 60_000).toISOString() }), now).ok).toBe(false);
    expect(parseSchedule(body({ fireAt: new Date(now + MAX_DELAY_MS + 1000).toISOString() }), now).ok).toBe(false);
    expect(parseSchedule(body({ fireAt: "tomorrow" }), now).ok).toBe(false);
  });
  it("only allows https push-service endpoints", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://web.push.apple.com/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://wns2-par02p.notify.windows.com/w/x",
    ])
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x", "nope"])
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });
  it("validates ids and cancel bodies", () => {
    expect(parseSchedule(body({ id: "short" }), now).ok).toBe(false);
    expect(parseSchedule(body({ id: "has space in it" }), now).ok).toBe(false);
    expect(parseCancel({ id: "device-123456" }).ok).toBe(true);
    expect(parseCancel({}).ok).toBe(false);
  });
});

describe("cors", () => {
  it("only echoes the allowed origin", () => {
    expect(corsHeaders("https://app.example", "https://app.example")["access-control-allow-origin"]).toBe("https://app.example");
    expect(corsHeaders("https://other.example", "https://app.example")).toEqual({});
    expect(corsHeaders(null, "https://app.example")).toEqual({});
  });
});

describe("vapid", () => {
  it("signs a verifiable ES256 JWT for the endpoint origin", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = toB64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const d = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
    const key = await importSigningKey(pub, d);
    const header = await vapidAuthorization(endpoint, key, pub, "mailto:me@example.com", now);
    const [, jwt, k] = /^vapid t=(.+), k=(.+)$/.exec(header)!;
    expect(k).toBe(pub);
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
    expect(claims).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:me@example.com" });
    expect(claims.exp).toBeGreaterThan(now / 1000);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      fromB64url(s),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(valid).toBe(true);
  });
});

describe("request handling", () => {
  const origin = "https://app.example";
  const stub = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
  const env = (over: Partial<Env> = {}): Env => ({
    TIMERS: { idFromName: (n) => n, get: () => stub },
    ALLOWED_ORIGIN: origin,
    VAPID_SUBJECT: "mailto:me@example.com",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    ...over,
  });
  const post = (path: string, payload: unknown, headers: Record<string, string> = { origin }) =>
    new Request(`https://relay.example${path}`, { method: "POST", headers, body: typeof payload === "string" ? payload : JSON.stringify(payload) });

  it("schedules and cancels through the durable object", async () => {
    stub.fetch.mockClear();
    const res = await handleRequest(post("/schedule", body()), env(), now);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    expect((await handleRequest(post("/cancel", { id: "device-123456" }), env(), now)).status).toBe(200);
    expect(stub.fetch).toHaveBeenCalledTimes(2);
  });
  it("refuses other origins, bad bodies, oversize bodies and unknown paths", async () => {
    stub.fetch.mockClear();
    expect((await handleRequest(post("/schedule", body(), { origin: "https://evil.example" }), env(), now)).status).toBe(403);
    expect((await handleRequest(post("/schedule", body(), {}), env(), now)).status).toBe(403);
    expect((await handleRequest(post("/schedule", "not json"), env(), now)).status).toBe(400);
    expect((await handleRequest(post("/schedule", "x".repeat(5000)), env(), now)).status).toBe(400);
    expect((await handleRequest(post("/schedule", body({ id: "x" })), env(), now)).status).toBe(400);
    expect((await handleRequest(post("/nope", {}), env(), now)).status).toBe(404);
    expect(stub.fetch).not.toHaveBeenCalled();
  });
  it("answers preflight and rate limits", async () => {
    const pre = await handleRequest(new Request("https://relay.example/schedule", { method: "OPTIONS", headers: { origin } }), env());
    expect(pre.status).toBe(204);
    const limited = env({ LIMITER: { limit: async () => ({ success: false }) } });
    expect((await handleRequest(post("/schedule", body()), limited, now)).status).toBe(429);
  });
});
