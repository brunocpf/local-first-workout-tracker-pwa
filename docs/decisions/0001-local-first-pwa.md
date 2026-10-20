# 0001 – Local-first PWA, no backend

**Status:** accepted · 2026-10-20

**Context:** Single user, iPhone, offline gym use, no recurring cost.

**Decision:** TypeScript PWA (UI framework superseded by 0002); Dexie/IndexedDB as source of truth; Zod validation; no server, accounts, or paid APIs. Not Next.js (no SSR need).

**Consequences:** Manual JSON backups; timer alerts limited by iOS PWA suspension; revisit native/sync only on a concrete requirement.
