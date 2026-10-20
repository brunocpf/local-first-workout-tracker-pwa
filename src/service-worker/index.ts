import { self as sw } from "$app/service-worker";
import { immutable, assets, prerendered } from "$app/manifest";
import { version } from "$app/env";

// Cache Storage is per origin, and other apps (e.g. other GitHub Pages project sites under the same
// user.github.io origin) share it. Name ours with an app-specific prefix and only ever delete caches that
// carry it, so activating a new version never wipes another app's caches.
const CACHE_PREFIX = "workout-tracker-";
const CACHE = `${CACHE_PREFIX}${version}`;
// Manifest paths are relative to the base path, so resolve everything against the SW scope (works at any base).
const url = (path: string) => new URL(path, sw.registration.scope).href;
// adapter-static's SPA fallback page is the app shell; every navigation is answered with it.
const SHELL = url("404.html");

// Static hosts serve the fallback page with a 404 status for unknown paths (and some for /404.html itself),
// which cache.addAll() would reject, so the shell is fetched by hand and stored as a 200 response.
async function cacheShell(cache: Cache) {
  const res = await fetch(SHELL, { cache: "reload" });
  if (!res.headers.get("content-type")?.includes("text/html")) throw new Error(`Shell fetch failed: ${res.status}`);
  await cache.put(SHELL, new Response(await res.blob(), { status: 200, headers: res.headers }));
}

sw.addEventListener("install", (event) => {
  // No skipWaiting() here: a new version waits until the page asks for it (SKIP_WAITING below), so it
  // never takes over mid-workout and deletes the route chunks the open page still needs.
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll([...immutable, ...assets, ...prerendered].map((a) => url(a.path)));
      await cacheShell(cache);
    }),
  );
});

sw.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

// App shell only: navigations always get the cached shell (the router renders the route, and a static
// host's 404 for /history is never shown); other same-origin GETs are cache-first.
// Never cache dynamic API responses.
sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== sw.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(caches.match(SHELL).then((hit) => hit ?? fetch(req)));
    return;
  }
  // ignoreVary: module scripts send an Origin header and hosts reply "Vary: Origin", which would never match.
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req)));
});
