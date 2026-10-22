# 0015 – Localization (en, pt-BR)

**Status:** accepted · 2026-10-21

**Context:** The app should be usable in Brazilian Portuguese. It is a static, offline SPA, so there is no server-side locale negotiation and no need for a heavy i18n library.

**Decision:**
- **Catalog:** `src/lib/messages.ts` holds the English messages (`en`, the source of truth for the key set) and `ptBR: Record<MessageKey, string>`, so a missing or extra key fails `npm run check`. Messages are flat dotted keys (`nav.history`).
- **Runtime:** `src/lib/i18n.svelte.ts` exposes `t(key)` (reactive in components), `i18n.locale` and `setLocale()`. It reads `locale` from the shared reactive `settings` store (loaded before first render by `+layout.ts`); the layout sets `<html lang>`. Settings has a Language control.
- **Preference:** `UserSettings.locale` is `"system" | "en" | "pt-BR"`, default `"system"`. `"system"` resolves from `navigator.languages`: any `pt*` tag gives pt-BR, everything else English. The default needs no Dexie migration (settings are merged over defaults).
- **Not translated:** user and imported content (exercise names, routine names, notes) and historical session snapshots. Only UI chrome is translated, and so far only the shell (tab bar, page titles, update banner, the Language control): translating the remaining screens and the built-in catalog is follow-up work. Stored data stays locale-independent (kg, ISO 8601).
- **Formatting:** dates, numbers and weights shown in the UI should use `Intl` with `i18n.locale`; `src/lib/time.ts` stays for locale-independent day logic.
- **Adding a language:** add a catalog typed `Record<MessageKey, string>`, extend `Locale`/`LocaleSetting`, and update `resolveLocale`.

**Consequences:** Every new user-visible string needs a key in both catalogs. `static/manifest.webmanifest` stays English (a static file; revisit if localized install names matter). 
