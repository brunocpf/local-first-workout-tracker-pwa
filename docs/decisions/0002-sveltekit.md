# 0002 – SvelteKit (Svelte 5) instead of React

**Status:** accepted · 2026-10-20 · supersedes the UI choice in 0001

**Context:** The active-workout screen needs instant, fine-grained updates on a phone; the app is form-heavy and needs routing for five tabs plus detail pages. The initial scaffold used React + plain Vite with no router.

**Decision:** SvelteKit with `adapter-static` (SPA fallback, `ssr = false`). Dexie, Zod and the framework-independent domain code are unchanged.

**Consequences / notes:**
- Fine-grained reactivity avoids whole-workout re-renders; smaller runtime.
- Dependencies are on current majors (SvelteKit 3, Vite 8, Vitest 5, Zod 4). TypeScript is held at 6.x because `svelte-check` does not yet support 7.
- `@vite-pwa/sveltekit` does not support Kit 3 yet, so the offline shell is a hand-written service worker (`src/service-worker/`) plus `static/manifest.webmanifest`. Revisit when the plugin catches up.
- Kit 3 removed `$lib`; domain code is imported via `#lib/*` (package.json `imports`).
- No SSR/server: PRD §14.6 (no backend) still holds.
