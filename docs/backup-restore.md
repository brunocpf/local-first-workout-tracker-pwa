# Backup & restore

IndexedDB is persistent but not a backup. Plan (PRD §13):

- **Full backup** (JSON, versioned): exercises, programs, routines, schedule, sessions, sets, notes, settings.
- **Full restore** replaces data and must warn first; corrupt/incompatible files produce clear errors and change nothing.
- **Program-only / routine-only import** adds data without touching history.
- Backups must never fail silently. Format is documented here once implemented and is independent of the Dexie schema.

_Status: not yet implemented._
