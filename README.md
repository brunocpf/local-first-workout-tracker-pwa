# local-first-workout-tracker-pwa

A local-first, offline-capable workout tracker delivered as an installable iPhone PWA. No backend, no account, no paid APIs.

Full requirements: [docs/PRD.md](docs/PRD.md). Build order: [docs/roadmap.md](docs/roadmap.md).

## Stack

TypeScript · SvelteKit 3 (Svelte 5, static SPA) · Dexie (IndexedDB) · Zod 4 · Vite 8 · Vitest 5

## Getting started

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run check       # svelte-check / typecheck
npm run build       # static site in build/ (incl. service worker)
```

## Layout

```
src/
  lib/               domain modules (UI-free): catalog programs routines sessions logging
                     timers progress imports exports storage settings, plus types.ts
  routes/            SvelteKit pages (Home, Routines, History, Exercises, Progress)
  service-worker/    offline app shell
static/              manifest, icon
docs/                PRD, architecture, data model, import schema, ADRs
tests/               unit tests + fixtures
```

Domain logic lives outside React so it is testable on its own. UI never queries Dexie directly; go through the module/repository layer. Import domain code with `#lib/<path>` (package.json `imports`; Kit 3 removed `$lib`).

## Docs

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Program import schema](docs/import-schema.md)
- [Backup & restore](docs/backup-restore.md)
- [PWA install (iPhone)](docs/pwa-install.md)
- [Known browser limitations](docs/browser-limitations.md)
- [Exercise data attribution](docs/attribution.md)
- [Architecture decisions](docs/decisions/) (0002 explains the SvelteKit switch)

## Deployment

Any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages) serving `build/`. HTTPS is required for the service worker.
