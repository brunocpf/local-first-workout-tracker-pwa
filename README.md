# local-first-pwa

A local-first, offline-capable workout tracker delivered as an installable iPhone PWA. No backend, no account, no paid APIs.

Full requirements: [docs/PRD.md](docs/PRD.md). Build order: [docs/roadmap.md](docs/roadmap.md).

## Stack

TypeScript · React · Vite · Dexie (IndexedDB) · Zod · vite-plugin-pwa · Vitest

## Getting started

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run typecheck
npm run build      # production build + service worker
```

## Layout

```
src/
  catalog programs routines sessions logging timers progress imports exports storage settings   domain modules (UI-free)
  ui/                React components only
  types.ts           domain model
docs/                PRD, architecture, data model, import schema, ADRs
tests/               unit tests + fixtures
```

Domain logic lives outside React so it is testable on its own. UI never queries Dexie directly; go through the module/repository layer.

## Docs

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Program import schema](docs/import-schema.md)
- [Backup & restore](docs/backup-restore.md)
- [PWA install (iPhone)](docs/pwa-install.md)
- [Known browser limitations](docs/browser-limitations.md)
- [Exercise data attribution](docs/attribution.md)
- [Architecture decisions](docs/decisions/)

## Deployment

Any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages) serving `dist/`. HTTPS is required for the service worker.
