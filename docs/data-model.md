# Data model

Types live in `src/lib/types.ts` (logical model from PRD §15). Storage is Dexie/IndexedDB (`src/lib/storage/`), which is the source of truth.

## Entities

- **Exercise**: catalog entry. `exerciseType`, `isUnilateral?`, `favorite?`. Archived, never deleted, once used.
- **Program** → **Routine** → **RoutineExercise** → **PrescribedSet**: templates. Program membership is stored **only** on the routine (`Routine.programId` + `programOrder`); a routine belongs to at most one program. A program's routines are queried via the `routines.programId` index and sorted by `programOrder`. Array order is the order of exercises and sets (no `order` fields).
- **WorkoutSession** → **SessionExercise** → **LoggedSet**: history and the active workout. Self-describing (see below).
- **UserSettings**: single row in the `settings` table (key `"settings"`), merged over `DEFAULT_SETTINGS` on read.

## Conventions

- IDs: random UUIDs from `newId()` (`src/lib/ids.ts`, `crypto.randomUUID()`, needs a secure context). Never names as foreign keys.
- Timestamps: ISO 8601 **UTC instants** written with `toISOString()` (`...Z`), so string order equals time order and Dexie indexes sort correctly. Imports must normalize to this form.
- Weights: **kg numbers, full precision**. Display unit is a setting (`weightUnit`).
- Raw sets are stored; aggregates (volume, e1RM, PRs) are computed and never stored as the only copy.
- Everything stored is JSON-only (strings, numbers, booleans, arrays, plain objects; no `Date`, `Map`, `undefined`-significant fields).
- Unknown fields are preserved on import/export upgrades where safe.

### Sessions are self-describing

A session copies, at start (or when an exercise is added mid-workout), everything it needs: `exerciseNameSnapshot`, `exerciseTypeSnapshot`, and per exercise `prescribedSets?`, `restSeconds?`, `supersetGroupId?`, `notes`. `routineId`/`programId` are navigation hints, `routineNameSnapshot` is the display name. History never reads the live routine or exercise, so editing or deleting them never rewrites history. An ad-hoc exercise simply has no `prescribedSets`.

Starting from a routine uses `sessionInputFromRoutine(routine, exercisesById)` (`logger/fromRoutine.ts`). It returns `{ session, skippedExerciseIds }`: the `NewSession` input for `startSession`, with the routine's prescription deep-copied and fresh set rows created. Exercises missing from the catalog are left out and listed in `skippedExerciseIds`.

### Set completion

A `LoggedSet` is completed ⇔ `completedAt` is present. Sets without it are planned/in-progress rows: kept as raw data, ignored by every metric.

### Session status and discard

`status` is `active | completed`. **Discard = delete the active session** after UI confirmation (`discardSession`, which refuses non-active sessions so it can never delete history). There is no `abandoned` state: an abandoned workout is either finished (it has real sets) or discarded. Deleting a completed workout from history is a separate, explicit user action.

At most **one active session** exists. `startSession` and `saveSession` check this inside the same IndexedDB `readwrite` transaction as the write, which also serializes against a second tab. `saveSession` also refuses (`SessionNotActiveError`) to write an active session whose stored row is missing or no longer active, so a stale tab can't resurrect a workout that another tab finished or discarded; create active sessions with `startSession`.

### Rest timer

Stored on the active session: `restTimer?: { endsAt, durationSeconds, pausedRemainingMs? }`. Running: remaining = `max(0, ceil((endsAt − now)/1000))`. Paused: `pausedRemainingMs` is authoritative and `endsAt` is stale; resume sets a new `endsAt = now + pausedRemainingMs`. Helpers: `src/lib/restTimer.ts`. `finishSession` clears it. The UI re-reads the clock; no interval state is persisted.

### Time zones and weeks

`WorkoutSession.timeZone` is an IANA name from `Intl` captured at start. `localDate(session)` (`src/lib/time.ts`) gives the calendar day (`YYYY-MM-DD`) the session started on **in that zone**, so a 22:30 workout in Los Angeles stays on its local day even though UTC rolled over, and travelling doesn't shift old workouts. An unknown zone (from an import) falls back to UTC. Week start is the `weekStartsOn` setting (0 Sun, 1 Mon default, 6 Sat); `localWeekStart(session, weekStartsOn)` returns the week's first day. `monthlyStats(sessions)` (`src/lib/progress/monthly.ts`) groups completed sessions by that `YYYY-MM` local month and totals count, duration, volume and completed sets; it is derived on each call, never stored.

### Units

Stored in kg. `lbToKg`/`kgToLb`/`toKg` (`src/lib/units.ts`) convert; user input in lb is converted to kg **without rounding**. `displayWeight(kg, unit)` rounds only for display: **0.1 lb** or **0.05 kg**. 225 lb → 102.0582… kg → shown as 225. Never write a display value back to storage. Rep/duration/distance have no unit conversion yet (distance is metres when added).

### Exercise types and volume

| `exerciseType` | Logged `weight` means | In volume totals |
|---|---|---|
| `weighted_reps` | load lifted | yes (`weight × reps`) |
| `bodyweight_reps` | unused | no (track reps) |
| `weighted_bodyweight` | **added** load (weighted pull-up) | no, until bodyweight measurements exist |
| `assisted_bodyweight` | **assistance** (lower = better) | no, until bodyweight measurements exist |
| `duration` / `distance` | unused | no |

`exerciseVolume(sets, type)` returns 0 for everything but `weighted_reps`. Once bodyweight is recorded, effective load = bodyweight ± logged weight and these can join volume. Their progress is shown with per-exercise best weight/reps (for assisted, *lower* weight is progress; the PR code is `weighted_reps` only for now). `isUnilateral`: reps are per side and never doubled.

## Metrics definitions

All computed from raw sets (`src/lib/progress/metrics.ts`); **warm-up sets and sets without `completedAt` are excluded** everywhere.

- Set volume = `weight × reps` (missing values count 0). Drop and failure sets count.
- Exercise volume = sum of set volumes (`weighted_reps` only, above).
- Estimated 1RM: Epley `w × (1 + reps/30)`, valid for 1–12 reps; **1 rep returns the weight itself**; `undefined` outside 1–12 or for weight ≤ 0.
- PRs per exercise (`personalRecords`, input = sets grouped per session):
  - **Max weight**: heaviest counted set with ≥ 1 rep (any rep count).
  - **Rep PRs**: best weight for each exact rep count 1–12.
  - **Best e1RM**: highest Epley value.
  - **Best session volume**: highest exercise volume in one session.

## Catalog search (`src/lib/catalog/search.ts`)

`normalizeName(s)` is the canonical form for search and import matching: NFKD with diacritics stripped, lowercased, `&` → `and`, punctuation and hyphens → spaces, whitespace collapsed and trimmed (`Pèc-Déck & Co.` → `pec deck and co`).

`searchExercises(query, exercises, { limit?, includeArchived? })` is offline and runs over the in-memory catalog. Results rank: exact name or alias > name prefix > every query token starts a word of the name or an alias > substring; ties sort by normalized name. Archived exercises are excluded unless `includeArchived` is set. An empty query returns all non-archived exercises sorted by name.

## Storage (`src/lib/storage/`)

Database name: `workout-tracker` (`DB_NAME`). The app is hosted on GitHub Pages (`brunocpf.github.io/local-first-workout-tracker-pwa/`) and all of a user's project sites share one origin and therefore one IndexedDB namespace, so the name must be app-specific and unique. It must also stay **stable**: renaming it later strands existing data in the old database. Tests use unique per-test names.

Tables and indexes (Dexie version 1):

- `exercises`: `id, name, *aliases, isCustom, archivedAt`
- `programs`: `id, name`
- `routines`: `id, programId, folderId`
- `sessions`: `id, status, startedAt, routineId, [status+startedAt], *exerciseIds`
- `settings`: `key`

`WorkoutSession.exerciseIds` is a denormalized, de-duplicated list of the session's exercise IDs for the multi-entry index, so "previous values" and PR queries for one exercise don't scan all sessions. `saveSession` (and `startSession`/`finishSession`) recompute it; never set it by hand. `completedSessionsWithExercise(id, limit?)` returns completed sessions newest first (index lookup, then sorted in memory, since IndexedDB can't compound a multi-entry index).

### Session repository (`sessions.ts`)

`startSession`, `getActiveSession`, `saveSession`, `finishSession`, `discardSession`, `completedSessionsWithExercise`. `saveSession` is an upsert that recomputes `exerciseIds` + `updatedAt` and writes in one transaction. It **deep-copies via JSON before writing**, so it accepts Svelte `$state` proxies directly (IndexedDB's structured clone throws `DataCloneError` on proxies; tested). Anything else written to Dexie from a component (routines, settings) must be plain data: use `$state.snapshot()` or go through a repository function.

### Routine and program repository (`routines.ts`)

`listRoutinesGrouped` (programs with their routines sorted by `programOrder`, plus standalone routines; a routine whose program is missing is listed as standalone), `getRoutine`, `getProgram`, `saveRoutine` (plain copy, bumps `updatedAt`), `duplicateRoutine` (standalone copy with fresh routine, exercise and prescribed-set ids, name + " (copy)"), `deleteRoutine` (also removes it from its program's `schedule`), `deleteProgram(id, { deleteRoutines })` (default: routines become standalone). Multi-table writes run in one transaction. None of them read or write sessions: editing or deleting a routine or program never changes history.

### Persistence (`persistence.ts`)

`requestPersistentStorage()` wraps `navigator.storage.persist()/persisted()/estimate()` with feature detection and returns `{ supported, persisted, usageBytes?, quotaBytes? }`; `getPersistenceStatus()` reads without prompting. Browsers differ:

- Chrome/Android: usually granted automatically for installed PWAs and engaged sites; no prompt.
- Safari/iOS: installed Home Screen apps are exempt from the 7-day script-written-storage eviction; in a normal tab, data can be evicted after 7 days without use. Treat export/backup as the real safety net.
- Firefox: may show a permission prompt.

Persistence is best-effort: the app must work and warn, not fail, when it is `false`.

### Migrations

Version 1 was edited in place only because no user data existed. From now on:

1. Never edit a shipped `version(n)`. Add `this.version(n+1).stores({ …only changed tables… }).upgrade(tx => …)` after it.
2. Never drop tables/fields that hold user data; transform in `upgrade`. Make upgrades idempotent and tolerant of missing fields.
3. Add a fixture test in `tests/migrations.test.ts`: freeze the old `stores()` schema, write representative rows into a uniquely named DB with plain `Dexie`, close, open `AppDB` with the same name, and assert nothing is lost and new indexes work. Use unique DB names and delete them in `afterEach`.
4. Bump the export `schemaVersion` and keep older exports importable.

## Exercise catalog seed (`src/lib/catalog/`)

`vocab.ts` holds the controlled vocabularies (`MUSCLES`, `EQUIPMENT`, `MOVEMENT_PATTERNS`, each a const array with a derived union type). `seed.ts` holds `SEED_EXERCISES` (~107 built-in exercises, text written for this project, no instructions or media yet) and `SEED_EXERCISES_BY_ID`. Entries carry no timestamps; the loader that writes them to Dexie (`ensureCatalogSeeded`) fills `createdAt`/`updatedAt` and `isCustom: false`. `Exercise.primaryMuscles`/`secondaryMuscles`/`equipment` stay `string[]` in storage (custom and imported exercises may use other values); only seed entries are checked against the vocab.

**Catalog id policy:** ids are snake_case (`/^[a-z0-9_]+$/`), **permanent, and never renamed or reused** — history, backups and import files reference them. Renaming an exercise changes only `name`. Retiring one keeps its entry (so ids still resolve) and archives/hides it. New ids may be added at any time. Names and aliases are unique across the catalog (case/diacritic/punctuation-insensitive) so importer name resolution is unambiguous. A test (`tests/catalog-seed.test.ts`) also checks that every id used by `docs/import-schema.md` and `tests/fixtures/` resolves.

### Catalog repository (`src/lib/storage/exercises.ts`)

`ensureCatalogSeeded()` upserts every `SEED_EXERCISES` entry into `exercises` (memoized per database; retried after a failure). Seed fields (name, muscles, type, …) are refreshed from the seed; user state on existing rows is kept: `favorite`, `archivedAt`, and aliases (result = union of seed and existing aliases), plus `createdAt`. Rows are never deleted, so custom exercises and retired seed ids survive. Queries (`listExercises({includeArchived?})`, `getExercise`, `getExercisesByIds`) call it lazily; `createCustomExercise` (UUID id, `isCustom: true`), `setFavorite` and `setArchived` write plain objects. Functions take an optional trailing `AppDB` for tests.

## Previous values and prefill (`src/lib/logger/previousValues.ts`)

PRD §8.4. `loadPreviousSets(exerciseId, {excludeSessionId})` takes the newest completed session (other than the excluded one) that has at least one completed set of the exercise and returns that exercise's sets, all occurrences concatenated in order. `alignPrevious(currentSets, previousSets)` returns, per current set, its previous set: set N matches previous set N within the same group (warm-up vs working, where working = normal/drop/failure); extra sets reuse the last previous set of the group; previous sets without `completedAt` are ignored; no match gives `undefined`.

`prefillFor(set, previous?, prescribed?)` returns `{weight?, reps?}`: each field comes from the previous set if present, else from the prescription (`targetWeight`; reps = lower bound of `repRange`), else is left out.

## Not yet implemented

Routine → session copying (the "start routine" logger slice), bodyweight measurements.
