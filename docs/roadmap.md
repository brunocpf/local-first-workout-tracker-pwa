# Roadmap

Scope and priorities: PRD §4; phase detail: PRD §24; rationale: [ADR 0005](decisions/0005-mvp-scope-and-platforms.md). The logger vertical slice comes before the builder and before import.

Scaffold status: SvelteKit/Svelte 5/TS, service worker + manifest, Dexie schema, domain types, import schema + tests, CI. Tooling/PWA shell ([ADR 0003](decisions/)) and data model ([ADR 0004](decisions/)) are being finalized in parallel.

## MVP (P0)

- [ ] **Phase 0 – Validation.** Install + IndexedDB persistence on a real iPhone/iPad and Android phone; confirm the production origin (GitHub Pages, `brunocpf.github.io`); self-written seed catalog decision; **obtain a real Hevy export**.
- [ ] **Phase 1 – Shell and storage.** Navigation, theme, settings, Dexie schema/migrations, seed catalog (~100) + search, PWA shell, CI.
- [ ] **Phase 2 – Logger vertical slice.** Blank workout → log sets → persist → reload → recover → finish → history; previous values; rest timer; Playwright coverage.
- [ ] **Phase 3 – Routines via import.** Schema v1 validation, minimal preview, exercise matching, save routines, start from a routine.
- [ ] **Phase 4 – Backup, hardening, P0 release.** Full backup/restore, backup reminder, persist() status, update banner, edit/delete/retroactive sessions, iOS + Android device checklists ([pwa-install.md](pwa-install.md)).

## Next (P1, in order)

- [ ] **Phase 5 – Hevy history import.**
- [ ] **Phase 6 – Authoring.** Routine builder UI, custom exercises UI, exercise detail/guides.
- [ ] **Phase 7 – Insight.** PRs + basic charts, AI prompt generator, calendar.

## Later

- [ ] **Phase 8 – Rest of P1/P2.** CSV, online-plan import, supersets, set-type/RPE UI, plate calculator, muscle-group volume, measurements, folders, scheduling, progression rules, wger catalog evaluation, etc.
