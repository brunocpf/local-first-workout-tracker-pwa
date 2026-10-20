const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** `allowed` is a comma-separated list of origins (the production origin is configuration, never hardcoded). */
export function isAllowedOrigin(origin: string | null, allowed: string, allowLocalhost = false): boolean {
  if (!origin) return false;
  if (allowLocalhost && LOCAL.test(origin)) return true;
  return allowed
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

/** CORS headers for an allowed origin; empty for any other origin (the browser then blocks the call). */
export function corsHeaders(origin: string | null, allowed: string, allowLocalhost = false): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, allowed, allowLocalhost)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}
