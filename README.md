# local-first-workout-tracker-pwa

A local-first, offline-capable workout tracker delivered as an installable PWA for iOS/iPadOS (Safari), Android (Chrome) and desktop browsers. Phone-first UI, responsive on desktop. No backend, no account, no paid APIs. iOS is the most constrained platform and is called out where it differs ([browser limitations](docs/browser-limitations.md)).

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

Any static HTTPS host (HTTPS is required for the service worker).

- Build command: `npm run build`; output directory: `build/`.
- Configure an SPA fallback to `index.html` (many hosts do this automatically when no `404.html` exists).
- **Use a stable origin.** IndexedDB data is bound to the origin; changing domains loses local data unless you export a backup and restore it ([backup & restore](docs/backup-restore.md)).
