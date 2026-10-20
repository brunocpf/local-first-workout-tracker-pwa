import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";
import { defineConfig } from "vitest/config";
import { svelteTesting } from "@testing-library/svelte/vite";

// Deploy under a sub-path (e.g. GitHub Pages project site) with BASE_PATH=/repo-name. Empty = domain root.
// Optional push relay (ADR 0014). Both set at build time; unset = the notifications feature stays hidden.
const relayUrl = process.env.VITE_PUSH_RELAY_URL ?? "";
const relayOrigin = relayUrl ? new URL(relayUrl).host : undefined;

const base = (process.env.BASE_PATH ?? "").replace(/\/+$/, "") as "" | `/${string}`;

export default defineConfig({
  plugins: [
    sveltekit({
      // Static, client-only SPA: no server, no SSR. 404.html is the SPA fallback: GitHub Pages serves it for
      // unknown paths (deep-link reloads); the service worker serves it for every navigation once installed.
      adapter: adapter({ fallback: "404.html" }),
      paths: { base },
      // Update detection only: the service worker waits until the page asks to activate it.
      version: { pollInterval: 5 * 60 * 1000 },
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self"],
          // Style attributes can't run script; allowing them keeps Kit's announcer and future `style="…"` working.
          "style-src-attr": ["unsafe-inline"],
          "img-src": ["self", "data:", "blob:"],
          "font-src": ["self"],
          "connect-src": relayOrigin ? ["self", relayOrigin as `${string}.${string}`] : ["self"],
          "manifest-src": ["self"],
          "worker-src": ["self"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
        },
      },
    }),
    // Resolves Svelte to its browser build under Vitest so components can be rendered.
    svelteTesting(),
  ],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts", "relay/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
