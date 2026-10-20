import { self as sw } from "$app/service-worker";
import { immutable, assets, prerendered } from "$app/manifest";
import { version } from "$app/env";

const CACHE = `cache-${version}`;
const SHELL = [...immutable.map((a) => a.path), ...assets.map((a) => a.path), ...prerendered.map((p) => p.path), "/"];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

// App shell only: cache-first for same-origin GETs, SPA fallback when offline.
// Never cache dynamic API responses.
sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== sw.location.origin) return;
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).catch(async () => {
          if (req.mode === "navigate") return (await caches.match("/")) ?? Response.error();
          return Response.error();
        }),
    ),
  );
});
