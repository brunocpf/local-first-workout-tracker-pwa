# Backup & restore

_Status: **format v3 (v1 and v2 files still restore), export builder and restore logic implemented** (`src/lib/backup/format.ts`, `export.ts`, `restore.ts`). The Settings backup/restore UI (`BackupSection.svelte`) and the reminder banner (T4.05) are implemented._

IndexedDB is persistent but not a backup: browsers can evict it, and it is bound to the origin and (on iOS) to installed-app vs Safari-tab storage.

## Format

One **versioned JSON** file named `workout-backup-YYYY-MM-DD.json` (device-local date), MIME `application/json`. The Zod schema `backupV3` in `src/lib/backup/format.ts` is the source of truth; it mirrors the domain types (`src/lib/types.ts`), not the Dexie schema.

```jsonc
{
  "backupVersion": 3,
  "app": { "name": "workout-tracker", "version": "0.0.0" },
  "exportedAt": "2026-03-01T10:00:00.000Z",          // ISO 8601 UTC
  "data": {
    "customExercises": [ /* Exercise with isCustom: true */ ],
    "builtinExerciseState": [ { "id": "bench_press", "favorite": true, "archivedAt": "…", "aliases": ["user alias"] } ],
    "programs": [ /* Program, incl. schedule */ ],
    "routines": [ /* Routine, incl. programId/programOrder, folderId, favorite */ ],
    "folders": [ /* RoutineFolder: { id, name, createdAt, updatedAt } */ ],
    "sessions": [ /* WorkoutSession incl. sets; active AND completed; without exerciseIds */ ],
    "settings": { /* UserSettings, all fields */ },
    "measurements": [ /* BodyMeasurement: bodyweight (kg), body_fat (%), tape measurements (cm); oldest first */ ]
  }
}
```

Notes:

- **Built-in exercises are not exported**; they come from the app's catalog. Only user state is kept in `builtinExerciseState`: `favorite`, `archivedAt` and aliases the user added (not the seed's own). Entries with no user state are omitted.
- **Derived data is not exported**: no stats/PRs/aggregates, and the session `exerciseIds` index (restore recomputes it). Raw sets are exported as stored (kg, ISO timestamps, session `timeZone`).
- An **active session** is included (with its `restTimer`) so a backup taken mid-workout loses nothing.
- Unknown keys are stripped when parsing; strings/arrays have size limits and URLs must be http(s). `buildBackup()` validates its own output, reading all tables in one read transaction.
- Not covered: device-local state outside the seven tables.

### Versioning policy

- `backupVersion` is a single integer. Any change that an older reader would misread (renamed/removed field, changed meaning) bumps it; purely additive optional fields do not.
- **History:** v1 (initial); **v2** adds the required `data.measurements` array (T8.15). A v1 file has none, so `migrateBackup` turns it into v2 with `measurements: []`. **v3** adds the required `data.folders` array and the optional `Routine.favorite` (T8.18). It bumps the version because a v2 app would strip both (unknown keys) and silently restore without folders or favorites; it now says "update the app" instead. A v2 file becomes v3 with `folders: []`; any `folderId` its routines carry then lists as no folder.
- **Forward migration rule:** restore accepts every version ever released by running a chain of pure `vN → vN+1` functions on the parsed JSON, then validates against the newest schema. Old files are never rewritten. A file with a newer `backupVersion` than the app knows is rejected with a clear "update the app" message, and nothing changes.
- Each released version keeps a fixture export in `tests/fixtures/` so migrations stay testable: `backup-v1.json` (restores as v3 with no measurements or folders), `backup-v2.json` (restores as v3 with no folders) and `backup-v3.json`.

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

- `parseBackup(text)` never touches the database. In order: size limit (`MAX_BACKUP_BYTES`, 50 MB), `JSON.parse`, version check (a newer `backupVersion` → "update the app"; anything else unknown → unsupported; v1 and v2 are migrated to v3 by `migrateBackup`), Zod `backupV3` (unknown keys stripped; errors are `path: message`, capped at 50), then integrity checks the schema can't express: unique ids per collection (folders and measurements included; each measurement must satisfy the shared `measurementSchema` (`src/lib/measurements.ts`, also used by `addMeasurement`): known `kind`, `value` above 0 and within its kind's limit, canonical UTC `measuredAt` with milliseconds, a real IANA `timeZone`, notes ≤ 1000 characters), custom exercises have `isCustom: true` and don't reuse a built-in id, at most one active session, every routine `exerciseId` is a catalog or backed-up custom exercise, and every program schedule `routineId` is a backed-up routine. Sessions' `exerciseId`/`routineId`/`programId` and a routine's `programId`/`folderId` are deliberately not checked: sessions snapshot names so history stays readable without the referenced row, and the app lists routines with an unknown program as standalone and with an unknown folder as in no folder.
- `summarizeBackup(backup)` / `summarizeCurrentData()` return counts of sessions, routines, programs, custom exercises and body measurements (so restoring a file with fewer measurements than the device has is visible in the confirmation) plus the latest session `startedAt`, for the confirmation text.
- `restoreBackup(backup)` re-validates its input (from a plain JSON copy, so `$state` proxies are fine), then in **one `rw` transaction over all seven tables**: clears them, rewrites the built-in catalog from the app's seed with the backup's `builtinExerciseState` applied (this is the re-seed; built-in rows already stored but no longer in the app's catalog are kept, never deleted, so retired ids still resolve; state for ids in neither is ignored), adds custom exercises, programs, routines, folders, sessions (recomputing `exerciseIds`), settings and measurements. Restoring a v1 file therefore leaves no measurements (and a v1 or v2 file no folders): a full restore replaces everything. Any error aborts the transaction and the previous data is intact.
- `settings.lastBackupAt` (ISO) is set after each successfully saved/shared export (not on cancel or failure) and is part of the backup's `settings`. Settings UI: export, restore (blocked while a workout is active; confirm lists current vs file counts, offers "Export a backup first"), then settings and the active-session store are reloaded.
- The caller (T4.04) must not keep an in-memory active session across a restore: reload app state afterwards.
- `tests/fixtures/backup-v1.json`, `backup-v2.json` and `backup-v3.json` are the frozen fixtures: every future version must keep restoring them (`tests/backup-restore.test.ts`).

## Reminder policy

Non-blocking banner on Home when the last backup is older than `settings.backupReminderDays` (default 14) or `settings.backupReminderSessions` (default 10) completed workouts were started since it (whichever first; 0 disables each; both are in the backup's `settings`). It needs at least one completed workout since the last backup (all of them if never backed up) and is only on Home, never while a workout is active. "Back up now" runs the export (`exportAndRecord` in `src/lib/backup/run.ts`); "Later" hides it until the next app launch. Policy is the pure `shouldRemindBackup` in `src/lib/backup/reminder.ts`; the count is `countCompletedSince` (index count, no rows loaded). Thresholds are edited in the Backup section of Settings.

## Off-device copies and multi-device use

There is no automatic cloud backup or sync ([ADR 0012](decisions/0012-cloud-backup-sync.md)). Saving the backup file into a synced folder (iCloud Drive, Google Drive, Dropbox) through the share sheet is the supported way to keep an off-device copy, and moving data to another device is export → full restore. Third-party storage via OAuth was evaluated but would still be backup only and cannot run silently from a web page.

## Moving between origins/installs

Export from the old install, restore on the new one. This is also how data moves between the iOS Safari tab and the installed app.
