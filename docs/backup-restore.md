# Backup & restore

_Status: **not implemented.** This is the planned format and UX (PRD §13)._

IndexedDB is persistent but not a backup: browsers can evict it, and it is bound to the origin and (on iOS) to installed-app vs Safari-tab storage.

## Format

- One **versioned JSON** file, e.g. `workout-backup-YYYY-MM-DD.json`, with `backupVersion`, app version and export timestamp.
- Contains: custom exercises, routines/programs and schedule, sessions with sets, settings (not derived stats).
- Independent of the Dexie schema; migrated forward on restore; the format will be specified here when implemented, with fixtures from older exports.

## Saving

- **Mobile (iOS/Android):** Web Share API with a file (`navigator.canShare({ files })`) → Files, iCloud Drive, Google Drive, etc.
- **Desktop / fallback:** download via an anchor link.
- Success shows file name, size and date; failure shows the cause. Never silent.

## Restoring

1. User chooses a file.
2. The whole file is validated with Zod (size-limited, never evaluated). Any error → clear message and **nothing changes** (all-or-nothing transaction).
3. Full restore **replaces** existing data: a confirmation names what will be replaced (counts of sessions/routines, latest session date) and offers to back up first.
4. Program/routine-only import is a separate, additive operation ([import-schema.md](import-schema.md)).

## Reminder policy

Non-blocking banner when the last backup is older than 14 days or 10 sessions ago (whichever first; both configurable). Never shown during an active workout. Last-backup date is stored in settings.

## Moving between origins/installs

Export from the old install, restore on the new one. This is also how data moves between the iOS Safari tab and the installed app.
