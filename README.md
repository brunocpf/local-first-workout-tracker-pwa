# local-first-workout-tracker-pwa

A local-first, offline-capable workout tracker delivered as an installable PWA for iOS/iPadOS (Safari), Android (Chrome) and desktop browsers. Phone-first UI, responsive on desktop. No backend (apart from an optional, minimal push relay for locked-screen rest notifications, [ADR 0014](docs/decisions/0014-rest-timer-push.md)), no account, no paid APIs. iOS is the most constrained platform and is called out where it differs ([browser limitations](docs/browser-limitations.md)).

Full requirements: [docs/PRD.md](docs/PRD.md). Build order: [docs/roadmap.md](docs/roadmap.md).

## Stack

TypeScript · SvelteKit 3 (Svelte 5, static SPA) · Dexie (IndexedDB) · Zod 4 · Vite 8 · Vitest 5 · ESLint · Playwright

## Getting started

```bash
npm install
npm run dev         # local dev server
npm run check       # svelte-check / typecheck
npm run lint        # ESLint
npm test            # unit tests (Vitest)
npm run build       # static site in build/ (incl. service worker)
npm run test:e2e    # Playwright: Chromium, Pixel, WebKit/iPhone emulation
```

Full verification: `npm run check && npm run lint && npm test && npm run build && npm run test:e2e`. Emulated browsers don't replace real-device checks on iOS and Android ([checklist](docs/pwa-install.md)).

## Layout

```
src/
  lib/               UI-free domain code as flat module files, imported as #lib/<file>
                     (e.g. storage/db.ts, storage/sessions.ts, imports/…), plus types.ts
  routes/            SvelteKit pages (Home, Routines, History, Exercises, Progress)
  service-worker/    offline app shell
relay/               optional push relay for rest-timer notifications (separate deploy, see relay/README.md)
static/              manifest, icons
docs/                PRD, architecture, data model, import schema, ADRs
tests/               unit tests, fixtures, e2e
```

Modules are added when there is code for them. Domain logic lives in `src/lib` (not in Svelte components) so it is testable on its own. UI never queries Dexie directly. Import with `#lib/<file>` (package.json `imports`; Kit 3 removed `$lib`).

## Docs

- [PRD](docs/PRD.md) · [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Program import schema](docs/import-schema.md)
- [Backup & restore](docs/backup-restore.md)
- [PWA install (iOS, Android, desktop)](docs/pwa-install.md)
- [Known browser limitations](docs/browser-limitations.md)
- [Exercise data attribution](docs/attribution.md)
- [Architecture decisions](docs/decisions/) (0005: platforms and MVP scope)

## Deployment

**GitHub Pages** via the included workflow (push to `main`), served at https://brunocpf.github.io/local-first-workout-tracker-pwa/ with `BASE_PATH` set by the workflow. One-time setup: repo Settings → Pages → Source: **GitHub Actions**. Details: ADR 0003 in [docs/decisions/](docs/decisions/).

Any other static HTTPS host also works (HTTPS is required for the service worker): build with `npm run build`, serve `build/`, configure an SPA fallback to `index.html`, and set `BASE_PATH` only when serving under a sub-path.

**Use a stable origin.** IndexedDB data is bound to the origin (`brunocpf.github.io`). Moving to another host or domain means exporting a backup first and restoring it afterwards ([backup & restore](docs/backup-restore.md)). All of the owner's GitHub Pages project sites share that origin, so the app uses an app-specific IndexedDB name and cache prefix to avoid collisions.
