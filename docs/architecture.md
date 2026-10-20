# Architecture

Local-first: IndexedDB (via Dexie) is the source of truth. No server.

## Modules (`src/`)

| Module | Responsibility |
|---|---|
| catalog | Exercise catalog, search, alias resolution |
| programs / routines | Templates and builder logic |
| sessions / logging | Active session lifecycle, set logging, snapshotting |
| timers | Timestamp-based rest timer |
| progress | Volume, PRs, e1RM, aggregates |
| imports / exports | External formats, validation, backup/restore |
| storage | Dexie schema, migrations, repositories |
| settings | Local user settings |
| ui | React components only |

## Rules

- UI calls repositories/services; no ad-hoc DB queries or business logic in components.
- Import/export formats are independent of the IndexedDB schema.
- Separate: catalog, programs, routines, scheduled workouts, sessions, sets, metrics.
- Pragmatic repositories (`ExerciseRepository`, `ProgramRepository`, `RoutineRepository`, `WorkoutSessionRepository`, `ProgressService`, `ProgramImportService`, `BackupService`); no generic framework.

## Migrations

Explicit Dexie versions in `src/storage/db.ts`. Never drop user data. Test against representative old DB states.
