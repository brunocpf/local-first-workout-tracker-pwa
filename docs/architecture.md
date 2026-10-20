# Architecture

Local-first static SvelteKit SPA (`adapter-static`, SSR off): IndexedDB (via Dexie) is the source of truth. No server. Runs as an installed PWA on iOS/iPadOS, Android and desktop ([ADR 0005](decisions/0005-mvp-scope-and-platforms.md)).

## Code layout

- `src/lib/` – UI-free domain code, as **flat module files**, imported as `#lib/<file>` (e.g. `#lib/storage/db`). Today: `types.ts` plus whatever exists in `src/lib/` (storage, imports, metrics, …).
- `src/routes/` – Svelte pages/components only.
- `src/service-worker/` – offline shell.

**Rule:** add a module file when there's code for it. No empty placeholder folders and no speculative repository/service classes; keep abstractions pragmatic.

Planned homes (created when needed): `storage/db.ts` (Dexie schema + migrations), `storage/sessions.ts` (session persistence), `imports/…` (program/Hevy import, validation, exercise matching), progress/metrics, rest timer, backup/export.

## Rules

- Components call `src/lib`; no ad-hoc DB queries or business logic in components.
- Import/export formats are independent of the IndexedDB schema.
- Separate: catalog, programs, routines, scheduled workouts, sessions, sets, metrics.
- Never use `{@html}`; imported content is untrusted ([import-schema.md](import-schema.md)).

## Active session write-through

The active workout is an in-memory Svelte `$state` object. Every mutation is written through to Dexie (using `$state.snapshot` so no proxies reach IndexedDB), so a reload, suspension or crash loses nothing; there's at most one active session, and the rest timer (`endsAt` + pause) lives on it. No unload handlers. Details: ADR 0004 (session persistence & data model) in [decisions/](decisions/); entities in [data-model.md](data-model.md).

## Service worker updates

The service worker precaches the app shell with a navigation fallback. New versions are installed but **activated only on user action** via an "update available" banner, which is suppressed while a workout is active, so an update never reloads the page mid-session. Sub-path hosting uses `BASE_PATH`. Details: ADR 0003 (PWA shell & updates) in [decisions/](decisions/).

## Migrations

Explicit Dexie versions in `src/lib/storage/db.ts`. Never drop user data. Test against representative old DB states and failed upgrades.

## Origin

IndexedDB is per-origin: deploy to a permanent custom domain; changing it means export/restore ([backup-restore.md](backup-restore.md)).
