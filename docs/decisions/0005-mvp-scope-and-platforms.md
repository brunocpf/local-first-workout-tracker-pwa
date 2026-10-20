# 0005 – Platform-neutral PWA and MVP re-cut

**Status:** accepted · 2026-10-20 · supersedes the iPhone-only framing in 0001

**Context:** The PRD was written iPhone-first, with an MVP (P0) that included a routine builder, exercise guides, PRs and charts — too much before anything can be trained with. The owner also wants the app usable on Android and desktop.

**Decision:**
- **Platforms:** one PWA targeting installed iOS/iPadOS Safari, installed Android Chrome, and desktop Chromium/Safari/Firefox (Firefox desktop can't install; works as a tab). UI is phone-first and responsive. iOS stays the most constrained target and is called out where it differs (background timers, no `navigator.vibrate`, install flow, storage eviction, separate storage for the installed app vs the Safari tab). Playwright e2e runs on Chromium, Pixel and WebKit/iPhone emulation; real-device checks on iOS and Android remain mandatory.
- **Stable origin:** production uses a permanent custom domain; IndexedDB is bound to the origin, so moving hosts requires export/restore.
- **MVP (P0) = vertical slice:** ~100-exercise self-written seed catalog (no wger yet), routines created via **JSON import** with a minimal preview and exercise matching, workout logger with previous values, rest timer, history, interrupted-session recovery, full JSON backup/restore, installable offline PWA.
- **Next (P1, in order):** Hevy history import (promoted — otherwise previous values/PRs stay empty and leaving Hevy is unreachable; obtain a real export in Phase 0), routine builder UI, custom exercises UI, exercise detail/guides, PRs + basic charts, AI prompt generator, calendar.
- Set types (warm-up/drop/failure) and RPE/RIR are in the model and import format from v1; their UI can come later.

**Consequences:** Faster path to real workouts; the builder is deferred so imports are the only way to create routines in P0 (blank workouts cover the rest). Hevy import becomes the first post-MVP investment. Cross-platform support adds test and documentation cost (device checklists for iOS and Android). See PRD §2, §4, §24 and docs/roadmap.md.
