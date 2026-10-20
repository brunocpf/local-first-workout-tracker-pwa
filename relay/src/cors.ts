/** CORS headers for the one allowed app origin; empty for any other origin (the browser then blocks the call). */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  if (!origin || origin !== allowed) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}
