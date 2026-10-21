# Data model

Types live in `src/lib/types.ts` (logical model from PRD §15). Storage is Dexie/IndexedDB (`src/lib/storage/`), which is the source of truth.

## Entities

- **Exercise**: catalog entry. `exerciseType`, `isUnilateral?`, `favorite?`. Archived, never deleted, once used.
- **Program** → **Routine** → **RoutineExercise** → **PrescribedSet**: templates. Program membership is stored **only** on the routine (`Routine.programId` + `programOrder`); a routine belongs to at most one program. A program's routines are queried via the `routines.programId` index and sorted by `programOrder`. Array order is the order of exercises and sets (no `order` fields).
- **RoutineFolder**: `{ id, name, createdAt, updatedAt }` in the `folders` table (Dexie v3), for organizing many routines. Membership is stored **only** on the routine (`Routine.folderId`, indexed since v1); a `folderId` that matches no folder means "no folder", so the routine is never hidden. Folders organize routines that are not in a program; a routine in a program is listed under its program and keeps any `folderId` for when it leaves it. `Routine.favorite?` (plain optional boolean, not indexed: booleans aren't IndexedDB keys) lists the routine first in Home quick-start.
- **WorkoutSession** → **SessionExercise** → **LoggedSet**: history and the active workout. Self-describing (see below).
- **BodyMeasurement**: `{ id, kind, value, measuredAt, timeZone, notes? }` in the `measurements` table. `kind` is one of `bodyweight`, `body_fat`, `neck`, `shoulders`, `chest`, `waist`, `hips`, `arm`, `forearm`, `thigh`, `calf`; `value` is stored in **kg** for `bodyweight`, **%** for `body_fat` and **cm** for every other kind (display conversion is a UI concern), must be above 0 and at most `MEASUREMENT_MAX[kind]` (`types.ts`; body fat ≤ 100). `measuredAt` is an ISO UTC instant, `timeZone` an IANA zone for local-day grouping. Measurements are independent of sessions and routines. Repository: `src/lib/storage/measurements.ts` (`addMeasurement`, `listMeasurements({ kind?, limit? })` newest first, `deleteMeasurement`); `addMeasurement` validates with `measurementSchema` (`src/lib/measurements.ts`, shared with the backup format: one definition, so anything stored can always be exported and restored) and throws `InvalidMeasurementError`: known kind, value range, canonical `toISOString()` `measuredAt` (so string order equals time order in the indexes), a real IANA `timeZone` (`isValidTimeZone`), notes ≤ 1000 characters. Measurements are in the backup (since format v2). UI: `/progress/body` (linked from Progress) logs bodyweight and the other kinds, charts one kind at a time with `LineChart`, lists entries newest first and deletes them after a confirmation (measurements are never edited).
- **UserSettings**: single row in the `settings` table (key `"settings"`), merged over `DEFAULT_SETTINGS` on read. Plate calculator fields: `barWeightKg` (default 20) and `plateInventory` (`{ kg, lb }`, each a list of `{ weight, count }` where `count` is plates available per side; defaults in `src/lib/tools/plates.ts`). Both are in the backup `settings`. Progression fields (PRD §17): `progressionEnabled` (default false) and `progressionIncrement` (`{ kg: 2.5, lb: 5 }`, the load added in each unit's own system); both optional in the backup `settings`, so older backups restore with the defaults. `suggestProgression` (`src/lib/progress/progression.ts`, pure) turns the last session's working sets and the prescribed rep range into a `{ weightKg, reps, reason }` suggestion (double progression); it returns `null` when disabled and never changes any data. The logger (T8.23) shows it as a chip on the exercise card (only with history and a prescribed rep range); Apply swaps the prefill of the uncompleted working sets and is not stored. Settings has the toggle and the per-unit increment. The calculator (`platesPerSide`) is pure: exact load when the inventory allows, otherwise the heaviest load not above the target, with the remainder reported.

## Conventions

- IDs: random UUIDs from `newId()` (`src/lib/ids.ts`, `crypto.randomUUID()`, needs a secure context). Never names as foreign keys.
- Timestamps: ISO 8601 **UTC instants** written with `toISOString()` (`...Z`), so string order equals time order and Dexie indexes sort correctly. Imports must normalize to this form.
- Weights: **kg numbers, full precision**. Display unit is a setting (`weightUnit`). Lengths (tape measurements) are **cm**, display unit is the `lengthUnit` setting (`cm` | `in`, default `cm`; `toCm` / `displayLength` in `src/lib/units.ts`). Bodyweight measurements follow `weightUnit`, body fat is always %. `measurementUnit` / `displayMeasurement` / `toStoredMeasurement` (`src/lib/measurements.ts`) convert per kind; values display rounded to 2 decimals, so anything typed with up to 2 decimals shows again exactly.
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

Stored in kg. `lbToKg`/`kgToLb`/`toKg` (`src/lib/units.ts`) convert; user input in lb is converted to kg **without rounding**. `displayWeight(kg, unit)` rounds only for display, to **2 decimals** (PRD §10.3), so anything typed with up to 2 decimals shows again exactly (82.53 kg, 135.25 lb). 225 lb → 102.0582… kg → shown as 225. Never write a display value back to storage. Rep/duration/distance have no unit conversion yet (distance is metres when added).

### Exercise types and volume

| `exerciseType` | Logged `weight` means | In volume totals |
|---|---|---|
| `weighted_reps` | load lifted | yes (`weight × reps`) |
| `bodyweight_reps` | unused | no (track reps) |
| `weighted_bodyweight` | **added** load (weighted pull-up) | yes with a known bodyweight (`(bodyweight + weight) × reps`), else no |
| `assisted_bodyweight` | **assistance** (lower = better) | yes with a known bodyweight (`(bodyweight − weight) × reps`), else no |
| `duration` / `distance` | unused | no |

**Bodyweight-aware load** (`src/lib/progress/metrics.ts`). `bodyweightOn(measurements, date)` returns the latest `bodyweight` measurement (kg) whose local day (in the measurement's own `timeZone`) is on or before the session's local date `YYYY-MM-DD`, so a measurement taken later the same day counts and one taken after the session never does; none → `undefined`. `effectiveLoad(weight, type, bodyweightKg)` is `bodyweight + weight` for `weighted_bodyweight` and `max(0, bodyweight − weight)` for `assisted_bodyweight` (a missing weight counts 0). `exerciseVolume(sets, type, bodyweightKg?)` uses it as the set's weight for those two types; **without a bodyweight (or for `bodyweight_reps`, `duration`, `distance`) they stay at 0 and nothing else changes**, so a caller that passes no bodyweight behaves exactly as before. The measured bodyweight is a snapshot at the session's date, not stored on the session, so editing or deleting measurements changes derived numbers, never raw sets.

**PRs for bodyweight exercises.** `withEffectiveLoad(sets, type, bodyweightKg)` returns the sets with `weight` replaced by the effective load, so `personalRecords`, `prTimeline`, e1RM and session volume apply unchanged (give each session's sets its own bodyweight before building `PrSession`s). For assisted exercises *less assistance is a higher effective load*, so it is a PR and more assistance is not; for weighted ones more added load is. The PR values are effective loads in kg, not the logged weight. A bodyweight change therefore moves the load too (lose 2 kg at the same assistance and the effective load drops). `exerciseSeries(sessions, id, { measurements })` does this per session (`maxWeight`, `e1rm`, `volume` become effective-load numbers for these types); without bodyweight measurements the points are as before. Existing screens don't pass measurements yet, so they still exclude these exercises until they are wired to `listMeasurements({ kind: "bodyweight" })`. `isUnilateral`: reps are per side and never doubled.

## Metrics definitions

All computed from raw sets (`src/lib/progress/metrics.ts`); **warm-up sets and sets without `completedAt` are excluded** everywhere.

- Set volume = `weight × reps` (missing values count 0). Drop and failure sets count.
- Exercise volume = sum of set volumes (`weighted_reps`; weighted/assisted bodyweight too once a bodyweight is known, above).
- Estimated 1RM: Epley `w × (1 + reps/30)`, valid for 1–12 reps; **1 rep returns the weight itself**; `undefined` outside 1–12 or for weight ≤ 0.
- PRs per exercise (`personalRecords`, input = sets grouped per session):
  - **Max weight**: heaviest counted set with ≥ 1 rep (any rep count).
  - **Rep PRs**: best weight for each exact rep count 1–12.
  - **Best e1RM**: highest Epley value.
  - **Best session volume**: highest exercise volume in one session.
- PR timeline (`prTimeline(sessionsChronological)`, input = `{ startedAt, sets }` per session, oldest first): per session, the new PRs (`maxWeight`, `repMax` per rep count 1–12, `e1rm`, `sessionVolume`) with the achieving set (none for `sessionVolume`). A set is a PR only if it **strictly beats the best from earlier sessions**; ties and within-session progression don't count. **The first session with counted sets flags nothing** (no baseline); afterwards a rep count never done before is a PR. `prsBefore(sessions, beforeIso)` returns the `PersonalRecords` from sessions started strictly before `beforeIso` (live checks). Nothing is stored; edits/deletes take effect by recomputation. PR badges (T7.05) reuse it via `src/lib/progress/sessionPrs.ts`: `prSetIds(prior, current)` gives the ids of the sets that are a new PR in `current` given the earlier sessions' sets of that exercise; the logger badges those completed sets (uncompleting one removes its badge) and toasts when a completion creates one, the finish summary lists them (`loadSessionPrs`), and history detail badges them from the sessions before it. Only `weighted_reps` exercises.
- Weekly sets per muscle (`weeklySetsByMuscle` in `src/lib/progress/muscles.ts`; an **estimate**, not a measurement). Each counted set adds **1 to every primary muscle** of its exercise and **0.5 to every secondary muscle** (a muscle listed as both counts as primary only). Weeks are keyed by `localWeekStart` (session `timeZone`, `weekStartsOn` setting). Muscles come from the *current* catalog entry, not a session snapshot, so editing an exercise's muscles changes past weeks; exercises no longer in the catalog and unknown muscle names contribute nothing. The Progress tab shows the average per week over the last 4 or 8 weeks (current week included) plus a data table with the totals.
- Monthly stats (`monthlyStats`): workouts, total time, volume and completed sets per local month; the Progress tab navigates months and shows zeros for months without workouts.
- Per-exercise time series (`exerciseSeries` in `src/lib/progress/series.ts`): one point per session with a counted set for the exercise, oldest first, with local `date`, `e1rm`, `maxWeight` (`weighted_reps`), `volume`, and `bestReps` (bodyweight types). `rangeStart` gives the 1M/3M/1Y/All lower bound.

## Catalog search (`src/lib/catalog/search.ts`)

`normalizeName(s)` is the canonical form for search and import matching: NFKD with diacritics stripped, lowercased, `&` → `and`, punctuation and hyphens → spaces, whitespace collapsed and trimmed (`Pèc-Déck & Co.` → `pec deck and co`).

`searchExercises(query, exercises, { limit?, includeArchived? })` is offline and runs over the in-memory catalog. Results rank: exact name or alias > name prefix > every query token starts a word of the name or an alias > substring; ties sort by normalized name. Archived exercises are excluded unless `includeArchived` is set. An empty query returns all non-archived exercises sorted by name.

## Storage (`src/lib/storage/`)

Database name: `workout-tracker` (`DB_NAME`). The app is hosted on GitHub Pages (`brunocpf.github.io/local-first-workout-tracker-pwa/`) and all of a user's project sites share one origin and therefore one IndexedDB namespace, so the name must be app-specific and unique. It must also stay **stable**: renaming it later strands existing data in the old database. Tests use unique per-test names.

Tables and indexes (Dexie version 1, plus versions 2 and 3 below):

- `exercises`: `id, name, *aliases, isCustom, archivedAt`
- `programs`: `id, name`
- `routines`: `id, programId, folderId`
- `sessions`: `id, status, startedAt, routineId, [status+startedAt], *exerciseIds`
- `settings`: `key`

Added in Dexie **version 2** (body measurements; `version(1)` is untouched and there is no `upgrade`, since a new table needs no data transformation):

- `measurements`: `id, kind, measuredAt, [kind+measuredAt]` (per-kind history newest first via the compound index; all kinds via `measuredAt`).

Added in Dexie **version 3** (routine folders; earlier versions untouched, no `upgrade`: a new table needs no data transformation, `routines.folderId` was already indexed and `favorite` is a plain field):

- `folders`: `id, name`.

`WorkoutSession.exerciseIds` is a denormalized, de-duplicated list of the session's exercise IDs for the multi-entry index, so "previous values" and PR queries for one exercise don't scan all sessions. `saveSession` (and `startSession`/`finishSession`) recompute it; never set it by hand. `completedSessionsWithExercise(id, limit?)` returns completed sessions newest first (index lookup, then sorted in memory, since IndexedDB can't compound a multi-entry index).

### Session repository (`sessions.ts`)

`startSession`, `getActiveSession`, `saveSession`, `finishSession`, `discardSession`, `completedSessionsWithExercise`. `saveSession` is an upsert that recomputes `exerciseIds` + `updatedAt` and writes in one transaction. It **deep-copies via JSON before writing**, so it accepts Svelte `$state` proxies directly (IndexedDB's structured clone throws `DataCloneError` on proxies; tested). Anything else written to Dexie from a component (routines, settings) must be plain data: use `$state.snapshot()` or go through a repository function.

**Editing a completed session** (`/history/[id]/edit`, PRD §5.3) works on a local copy, never the active store, and saves through `updateCompletedSession` after a confirm. It validates the shape with the backup `sessionSchema` plus set limits (weight 0–2000 kg, integer reps 0–10 000), requires the stored row to exist and be completed, requires `endedAt ≥ startedAt`, clamps set `completedAt` into that range, drops any rest timer and recomputes `exerciseIds`. Volume and PRs are derived, so they follow automatically. Start time is edited as wall-clock time in the session's zone (`utcToZonedLocal` / `zonedLocalToUtc`: a repeated DST hour resolves to the earlier instant, a skipped one shifts forward); with an unknown zone the times are not editable rather than read as UTC.

**Logging a past workout** (History → "Log past workout", PRD §5.3): `createCompletedSession` inserts a session that is `completed` from the start (never active, so the one-active-session rule and the active session are untouched). It takes `startedAt`/`endedAt` (the dialog converts the wall-clock start in the chosen zone with `zonedLocalToUtc`), an IANA `timeZone` (default: the device's), and optionally exercises prefilled from a routine via `sessionInputFromRoutine` (prescription copied, like starting it). It validates the backup `sessionSchema`, a known zone and `endedAt ≥ startedAt`. The app then opens `/history/[id]/edit?new=1`; cancelling there while the stored session has no logged sets offers to delete it. The workout is grouped by its local date in that zone, so it counts for that week.

**Bulk import** (`importCompletedSessions`, used by the Hevy import): inserts many already-completed sessions in one `rw` transaction on `sessions`, so it is all-or-nothing and a failure on the Nth session writes nothing. It rejects (`InvalidImportError`) any non-completed or `sessionSchema`-invalid session before writing, stores plain copies with `exerciseIds` recomputed and no rest timer, and uses `bulkAdd` (never overwrites: an id that already exists aborts the whole import). It never touches the active session.

### Routine and program repository (`routines.ts`)

`listRoutinesGrouped` (programs with their routines sorted by `programOrder`, plus standalone routines and the folders, sorted by name; a routine whose program is missing is listed as standalone), `groupByFolder(grouped)` (pure: splits the standalone routines into every folder, empty ones included, and `unfiled`; an unknown `folderId` counts as unfiled), `quickStartRoutines(grouped, max)` (pure: favorites first by name, then standalone and program routines as listed), `getRoutine`, `getProgram`, `saveRoutine` (plain copy, bumps `updatedAt`), `duplicateRoutine` (standalone copy with fresh routine, exercise and prescribed-set ids, name + " (copy)"; same folder, not a favorite), `deleteRoutine` (also removes it from its program's `schedule`), `deleteProgram(id, { deleteRoutines })` (default: routines become standalone), `createProgram`, `renameProgram`, `setRoutineProgram(routineId, programId?)` (appends at the end; leaving a program also removes the routine from that program's schedule) and `reorderProgramRoutines(programId, routineIds)` (the list must match the program's routines exactly). Folders: `listFolders`, `createFolder(name)` / `renameFolder(id, name)` (trimmed, required, at most `FOLDER_NAME_MAX` = 200 characters like every backup name), `deleteFolder(id)` (its routines are kept and lose `folderId`, `updatedAt` bumped), `setRoutineFolder(routineId, folderId?)` (the folder must exist; program membership is untouched) and `setRoutineFavorite(routineId, favorite)` (clearing removes the field). Multi-table writes run in one transaction. None of them read or write sessions: editing or deleting a routine or program never changes history.

### Persistence (`persistence.ts`)

`requestPersistentStorage()` wraps `navigator.storage.persist()/persisted()/estimate()` with feature detection and returns `{ supported, persisted, usageBytes?, quotaBytes? }`; `getPersistenceStatus()` reads without prompting. Browsers differ:

- Chrome/Android: usually granted automatically for installed PWAs and engaged sites; no prompt.
- Safari/iOS: installed Home Screen apps are exempt from the 7-day script-written-storage eviction; in a normal tab, data can be evicted after 7 days without use. Treat export/backup as the real safety net.
- Firefox: may show a permission prompt.

Persistence is best-effort: the app must work and warn, not fail, when it is `false`.

### Database lifecycle and storage errors (`db.ts`, `AppStatus.svelte`)

`AppDB.status` is `{ openError?, versionChanged, blocked, slow }`; `onStatus(fn)` subscribes and `checkStorage()` opens the database and records the outcome without throwing. A missing global `indexedDB` is reported at once as `unsupported` (in WebKit Dexie would otherwise fall back to `webkitIndexedDB` and hang), and an open that neither settles nor reports `blocked` within `OPEN_TIMEOUT_MS` (5 s) is flagged `slow`: a full-screen neutral "Still opening your data…" without a Reload button (it may be a long migration on an old phone; reloading would abort the all-or-nothing upgrade and restart it), which clears itself when the open settles. Reload is offered only for definite open errors. The root layout's `load` races the settings/session restore against `db.untilProblem()`, so a failing, slow or blocked open never leaves the page blank; the restore keeps running and fills in its state if the database recovers. `AppStatus` (root layout) shows:

- **Open failed** → full-screen "Storage unavailable" with guidance per `StorageProblem`: `unsupported` (no IndexedDB, e.g. some private modes), `quota` (device full), `unavailable` (anything else). Nothing else can work without the database, so the layout renders only this screen instead of the app (nothing behind it to focus or read).
- **`versionchange`** (another tab opened a newer schema, or is deleting the DB) → work registered with `db.beforeClose(fn)` runs first on the still-open connection (the active-session store flushes its pending deferred edit; capped at `CLOSE_FLUSH_TIMEOUT_MS` = 2 s, while the other tab waits), then the connection closes **without auto-reopen**, so this tab's old code never writes against the new schema (ADR 0003: old and new clients coexist). Banner: "App updated in another tab — Reload"; everything is already saved. Later writes in this tab fail (`DatabaseClosedError`) and the banner says they can't be saved until reload.
- **`blocked`** (this tab's upgrade waits for an old tab that doesn't close) → info banner until the open completes.
- **Active workout write failed** (`active.writeFailed`, e.g. `QuotaExceededError`, detected with `isQuotaError`) → sticky danger banner: changes are kept in memory, the next mutation (or **Retry**) writes them again. For quota errors it advises freeing space, then exporting a backup; otherwise Retry, then a backup if it keeps failing. Cleared on the next successful write.

### Migrations

Version 1 was edited in place only because no user data existed. From now on:

1. Never edit a shipped `version(n)`. Add `this.version(n+1).stores({ …only changed tables… }).upgrade(tx => …)` after it.
2. Never drop tables/fields that hold user data; transform in `upgrade`. Make upgrades idempotent and tolerant of missing fields.
3. Add a fixture test (`tests/migrations.test.ts`, or one file per version such as `tests/migration-v2.test.ts`): freeze the old `stores()` schema, write representative rows into a uniquely named DB with plain `Dexie`, close, open `AppDB` with the same name, and assert nothing is lost and new indexes work. Use unique DB names and delete them in `afterEach`.
4. Bump the export `backupVersion` and keep older exports importable (v1 → v2 → v3 is `migrateBackup` in `backup/restore.ts`; see docs/backup-restore.md).

Version history: **1** initial schema; **2** `measurements` table (T8.15); **3** `folders` table (T8.18, `tests/migration-v3.test.ts`: v2 and v1 databases with real rows, including an active session and a routine with a dangling `folderId`).

## Exercise catalog seed (`src/lib/catalog/`)

`vocab.ts` holds the controlled vocabularies (`MUSCLES`, `EQUIPMENT`, `MOVEMENT_PATTERNS`, each a const array with a derived union type). `seed.ts` holds `SEED_EXERCISES` (~107 built-in exercises, text written for this project: instructions, form cues, aliases and tags, no media yet) and `SEED_EXERCISES_BY_ID`. Entries carry no timestamps; the loader that writes them to Dexie (`ensureCatalogSeeded`) fills `createdAt`/`updatedAt` and `isCustom: false`. `Exercise.primaryMuscles`/`secondaryMuscles`/`equipment` stay `string[]` in storage (custom and imported exercises may use other values); only seed entries are checked against the vocab.

**Catalog id policy:** ids are snake_case (`/^[a-z0-9_]+$/`), **permanent, and never renamed or reused** — history, backups and import files reference them. Renaming an exercise changes only `name`. Retiring one keeps its entry (so ids still resolve) and archives/hides it. New ids may be added at any time. Names and aliases are unique across the catalog (case/diacritic/punctuation-insensitive) so importer name resolution is unambiguous. A test (`tests/catalog-seed.test.ts`) also checks that every id used by `docs/import-schema.md` and `tests/fixtures/` resolves.

### Catalog repository (`src/lib/storage/exercises.ts`)

`ensureCatalogSeeded()` upserts every `SEED_EXERCISES` entry into `exercises` (memoized per database; retried after a failure). Seed fields (name, muscles, type, …) are refreshed from the seed; user state on existing rows is kept: `favorite`, `archivedAt`, and aliases (result = union of seed and existing aliases), plus `createdAt`. Rows are never deleted, so custom exercises and retired seed ids survive. Queries (`listExercises({includeArchived?})`, `getExercise`, `getExercisesByIds`) call it lazily; `createCustomExercise` (UUID id, `isCustom: true`), `setFavorite` and `setArchived` write plain objects.

`updateCustomExercise(id, patch)` edits an exercise. Custom exercises accept every field (name, muscles, equipment, type, aliases, favorite, archived). Built-ins accept only `favorite`, `archived` and `aliases`, and aliases are unioned with the seed's so seed aliases always stay; any other field is rejected. Renaming never touches session `exerciseNameSnapshot`s. `isExerciseReferenced(id)` checks the `sessions.exerciseIds` index and scans routines. `deleteCustomExercise(id)` removes a custom exercise only when nothing references it; otherwise it throws `ExerciseInUseError` and the caller archives instead. Built-ins are never deleted. `mergePreview(fromId, intoId)` returns `{ sessions, routines }` counts for the confirmation. `mergeExercises(fromId, intoId)` (`from` must be custom, `into` may be any exercise) runs in ONE transaction over exercises, sessions and routines, so a failure leaves all data untouched: it re-points `SessionExercise.exerciseId` (name/type snapshots are never rewritten) and recomputes each affected session's `exerciseIds`, re-points `RoutineExercise.exerciseId`, appends `from`'s name and aliases to `into.aliases` (case-insensitive de-dup; aliases survive reseed), and deletes `from`. Previous values and PRs for `into` therefore include the merged history. Functions take an optional trailing `AppDB` for tests.

## Previous values and prefill (`src/lib/logger/previousValues.ts`)

PRD §8.4. `loadPreviousSets(exerciseId, {excludeSessionId, routineId})` takes the newest completed session (other than the excluded one) that has at least one completed set of the exercise and returns that exercise's sets, all occurrences concatenated in order. With `routineId` (set when `previousValuesMode === "routine"`), the newest such session from that routine is preferred, falling back to the newest session overall. `alignPrevious(currentSets, previousSets)` returns, per current set, its previous set: set N matches previous set N within the same group (warm-up vs working, where working = normal/drop/failure); extra sets reuse the last previous set of the group; previous sets without `completedAt` are ignored; no match gives `undefined`.

`prefillFor(set, previous?, prescribed?)` returns `{weight?, reps?}`: each field comes from the previous set if present, else from the prescription (`targetWeight`; reps = lower bound of `repRange`), else is left out.

## Not yet implemented

Routine → session copying (the "start routine" logger slice), bodyweight measurements.
