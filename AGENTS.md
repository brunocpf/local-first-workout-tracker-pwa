# Agent instructions

Read [docs/PRD.md](docs/PRD.md) first (sections 24–25 are the build order and working rules), then the ADRs in [docs/decisions/](docs/decisions/) (0003 PWA shell & updates, 0004 session persistence & data model, 0005 MVP scope & platforms). Summary:

- The product is a **platform-neutral PWA**: installed on iOS/iPadOS Safari, Android Chrome and desktop browsers, phone-first. iOS is the most constrained target; don't rely on APIs missing there (e.g. `navigator.vibrate`, background timers) without a fallback. See docs/browser-limitations.md.
- Work in small vertical slices: start workout → log set → persist → reload → recover → finish → history. The logger never waits for the routine builder.
- Stack: SvelteKit 3 / Svelte 5 (runes), static SPA, Dexie, Zod 4, ESLint, Vitest, Playwright. Keep business logic (progress, matching, import validation, persistence) in `src/lib`, out of components; test it.
- Modules are **flat files** under `src/lib/` (e.g. `storage/db.ts`, `storage/sessions.ts`, `imports/…`). Add a module file when there is code for it; don't create empty placeholder folders. Import with `#lib/<file>` (Kit 3 has no `$lib`). The service worker lives in `src/service-worker/`.
- Active session: in-memory `$state` written through to Dexie on every mutation; call `$state.snapshot` before any Dexie write (proxies can't be cloned). Never rely on unload handlers.
- **UI:** follow [docs/design.md](docs/design.md). Use tokens only (no raw colors in components), reuse `#lib/components/ui/*` before writing new markup, and consult the modern-web-guidance skill for new UI patterns.
- **Browser support:** Baseline *Widely available* features freely; *Newly available* ones only with feature detection and a working fallback (the allowed exceptions are listed in docs/design.md §1). Minimum iOS/iPadOS Safari 17.5.
- Never use `{@html}` (enforced by ESLint `svelte/no-at-html-tags`). Imported content is untrusted: validate with Zod, never eval, size-limit.
- Verify with `npm run check && npm run lint && npm test && npm run build && npm run test:e2e`.
- No backend, accounts, paid APIs, or sync without a concrete requirement and an ADR.
- Data loss is a serious defect: test migrations, interrupted sessions, backup/restore. Service-worker updates never reload during an active workout.
- Historical sessions snapshot exercise names and copy routine prescriptions; routine edits never rewrite history.
- Store raw sets; compute aggregates (PR definitions: PRD §10.1). Weights in kg internally, ISO 8601 timestamps, session `timeZone`.
- Rest timer uses a stored `endsAt` timestamp, not interval ticks.
- Record notable decisions in docs/decisions/. Keep docs updated with code.
- Prefer the simplest thing; don't add abstractions for hypothetical needs.
