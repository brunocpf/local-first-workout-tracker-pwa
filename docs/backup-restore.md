# Backup & restore

_Status: **format v1, export builder and restore logic implemented** (`src/lib/backup/format.ts`, `export.ts`, `restore.ts`). The save/share/restore UI and the reminder are not implemented yet (T4.04). UX below is planned (PRD §13)._

IndexedDB is persistent but not a backup: browsers can evict it, and it is bound to the origin and (on iOS) to installed-app vs Safari-tab storage.

## Format

One **versioned JSON** file named `workout-backup-YYYY-MM-DD.json` (device-local date), MIME `application/json`. The Zod schema `backupV1` in `src/lib/backup/format.ts` is the source of truth; it mirrors the domain types (`src/lib/types.ts`), not the Dexie schema.

```jsonc
{
  "backupVersion": 1,
  "app": { "name": "workout-tracker", "version": "0.0.0" },
  "exportedAt": "2026-03-01T10:00:00.000Z",          // ISO 8601 UTC
  "data": {
    "customExercises": [ /* Exercise with isCustom: true */ ],
    "builtinExerciseState": [ { "id": "bench_press", "favorite": true, "archivedAt": "…", "aliases": ["user alias"] } ],
    "programs": [ /* Program, incl. schedule */ ],
    "routines": [ /* Routine, incl. programId/programOrder */ ],
    "sessions": [ /* WorkoutSession incl. sets; active AND completed; without exerciseIds */ ],
    "settings": { /* UserSettings, all fields */ }
  }
}
```

Notes:

- **Built-in exercises are not exported**; they come from the app's catalog. Only user state is kept in `builtinExerciseState`: `favorite`, `archivedAt` and aliases the user added (not the seed's own). Entries with no user state are omitted.
- **Derived data is not exported**: no stats/PRs/aggregates, and the session `exerciseIds` index (restore recomputes it). Raw sets are exported as stored (kg, ISO timestamps, session `timeZone`).
- An **active session** is included (with its `restTimer`) so a backup taken mid-workout loses nothing.
- Unknown keys are stripped when parsing; strings/arrays have size limits and URLs must be http(s). `buildBackup()` validates its own output, reading all tables in one read transaction.
- Not covered: the last-backup date (will live in settings, T4.04) and device-local state outside the five tables.

### Versioning policy

- `backupVersion` is a single integer. Any change that an older reader would misread (renamed/removed field, changed meaning) bumps it; purely additive optional fields do not.
- **Forward migration rule:** restore accepts every version ever released by running a chain of pure `vN → vN+1` functions on the parsed JSON, then validates against the newest schema. Old files are never rewritten. A file with a newer `backupVersion` than the app knows is rejected with a clear "update the app" message, and nothing changes.
- Each released version keeps a fixture export in `tests/fixtures/` so migrations stay testable.

## Saving

- **Mobile (iOS/Android):** Web Share API with a file (`navigator.canShare({ files })`) → Files, iCloud Drive, Google Drive, etc.
- **Desktop / fallback:** download via an anchor link.
- Success shows file name, size and date; failure shows the cause. Never silent.

## Restoring

1. User chooses a file.
2. The whole file is validated with Zod (size-limited, never evaluated). Any error → clear message and **nothing changes** (all-or-nothing transaction).
3. Full restore **replaces** existing data: a confirmation names what will be replaced (counts of sessions/routines, latest session date) and offers to back up first.
4. Program/routine-only import is a separate, additive operation ([import-schema.md](import-schema.md)).

### Implementation (`src/lib/backup/restore.ts`)

- `parseBackup(text)` never touches the database. In order: size limit (`MAX_BACKUP_BYTES`, 50 MB), `JSON.parse`, version check (a newer `backupVersion` → "update the app"; anything else unknown → unsupported), Zod `backupV1` (unknown keys stripped; errors are `path: message`, capped at 50), then integrity checks the schema can't express: unique ids per collection, custom exercises have `isCustom: true` and don't reuse a built-in id, at most one active session, every routine `exerciseId` is a catalog or backed-up custom exercise, and every program schedule `routineId` is a backed-up routine. Sessions' `exerciseId`/`routineId`/`programId` and a routine's `programId` are deliberately not checked: sessions snapshot names so history stays readable without the referenced row, and the app lists routines with an unknown program as standalone.
- `summarizeBackup(backup)` / `summarizeCurrentData()` return counts of sessions, routines, programs and custom exercises plus the latest session `startedAt`, for the confirmation text.
- `restoreBackup(backup)` re-validates its input (from a plain JSON copy, so `$state` proxies are fine), then in **one `rw` transaction over all five tables**: clears them, rewrites the built-in catalog from the app's seed with the backup's `builtinExerciseState` applied (this is the re-seed; built-in rows already stored but no longer in the app's catalog are kept, never deleted, so retired ids still resolve; state for ids in neither is ignored), adds custom exercises, programs, routines, sessions (recomputing `exerciseIds`) and settings. Any error aborts the transaction and the previous data is intact.
- The caller (T4.04) must not keep an in-memory active session across a restore: reload app state afterwards.
- `tests/fixtures/backup-v1.json` is the frozen v1 fixture: every future version must keep restoring it (`tests/backup-restore.test.ts`).

## Reminder policy

Non-blocking banner when the last backup is older than 14 days or 10 sessions ago (whichever first; both configurable). Never shown during an active workout. Last-backup date is stored in settings.

## Moving between origins/installs

Export from the old install, restore on the new one. This is also how data moves between the iOS Safari tab and the installed app.
