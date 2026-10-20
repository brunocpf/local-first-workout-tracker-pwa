import { z } from "zod";

/** Largest request body accepted (a push subscription is well under 1 KB). */
export const MAX_BODY_BYTES = 4096;
/** A rest timer never needs more than this far ahead. */
export const MAX_DELAY_MS = 2 * 60 * 60 * 1000;
/** Tolerated clock skew for a fireAt that is already (just) past. */
export const PAST_SLACK_MS = 10_000;

/** Push services only: stops the relay being used to POST to arbitrary hosts. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

const b64url = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/);
export const idSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const subscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isAllowedPushEndpoint, "Unsupported push service"),
  keys: z.object({ p256dh: b64url, auth: b64url }).optional(),
  expirationTime: z.number().nullable().optional(),
});

export const scheduleSchema = z.object({
  id: idSchema,
  subscription: subscriptionSchema,
  fireAt: z.iso.datetime(),
});

export const cancelSchema = z.object({ id: idSchema });

export type ScheduleRequest = z.infer<typeof scheduleSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parse a schedule body; `fireAt` must be at most two hours ahead (and not clearly in the past). */
export function parseSchedule(body: unknown, now = Date.now()): Parsed<{ id: string; endpoint: string; fireAt: number }> {
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "invalid request" };
  const fireAt = Date.parse(parsed.data.fireAt);
  if (fireAt < now - PAST_SLACK_MS) return { ok: false, error: "fireAt is in the past" };
  if (fireAt > now + MAX_DELAY_MS) return { ok: false, error: "fireAt is too far ahead" };
  return { ok: true, value: { id: parsed.data.id, endpoint: parsed.data.subscription.endpoint, fireAt } };
}

export function parseCancel(body: unknown): Parsed<{ id: string }> {
  const parsed = cancelSchema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "invalid request" };
}
