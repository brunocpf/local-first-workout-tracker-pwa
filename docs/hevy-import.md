# Hevy history import: mapping spec

Source of truth for the importer (T5.02 parser, T5.04 matching/preview, T5.05 save). Decisions are recorded in [ADR 0006](decisions/0006-hevy-import.md). Derived from a **real export**, `tests/fixtures/hevy/sample.csv` (29 workouts, 546 set rows, Jul–Oct 2026, three free-text notes replaced by dummy text). Anything the sample does not exercise is marked **unverified**: build it defensively and cover it with synthetic fixtures.

Pipeline (PRD §12.1): `CSV text → rows (Zod) → workouts → exercise resolution → preview → local database`. Pure functions in `src/lib/imports/`; the save step is the only one that touches Dexie.

## 1. File format

| Property | Observed | Importer rule |
|---|---|---|
| Format | CSV (Hevy web → Settings → Export Data → Export Workout Data), file `workouts.csv`. Hevy states exports cannot be imported back into Hevy. | Accept `.csv` / `text/csv`; one-way import only. |
| Encoding / newlines | UTF-8, no BOM, LF | Accept optional BOM, CRLF and LF. |
| Delimiter / quoting | `,`; text fields always double-quoted, numbers and empty values unquoted | Real RFC 4180 parser: quotes, `""` escapes, embedded commas and newlines inside quotes. No `split(",")`. |
| Granularity | **One row per set** | Group rows into workouts and exercises (§3). |
| Header | `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe` | Read columns by **name**, not position. Required: `title`, `start_time`, `exercise_title`, `set_type`. Missing required column → whole file rejected with a clear message. Unknown extra columns are listed as "unsupported, ignored" in the report. |
| Limits | 59 KB / 547 rows | Reject files > 10 MB or > 200 000 rows; cap text fields (title/exercise 200 chars, notes 5 000, control characters stripped). Never `eval`, never `{@html}`. |

The importer reports a per-file summary: workouts, sets, date range, unsupported columns that held data, and every warning below.

## 2. Columns

All 14 columns of the sample are accounted for. "Sample" counts are over the 547 data rows of the committed file (the T0.04 summary and the fixture README say 546 sets; this spec uses the file as committed and counted it with a CSV parser).

| Column | Type | Example | Sample content | Maps to | Notes |
|---|---|---|---|---|---|
| `title` | text | `Pull` | 5 distinct (Push/Pull/Upper/Legs/Lower), never empty | `WorkoutSession.name` | Not a routine link: `routineId`/`routineNameSnapshot` stay unset. Empty title → `"Workout"` + warning. |
| `start_time` | local datetime, no zone, no seconds | `Oct 13, 2026, 9:50 PM` | always present | `startedAt` (UTC instant) | See §4. Unparseable → workout rejected, reported. |
| `end_time` | same format | `Oct 13, 2026, 11:00 PM` | always present | `endedAt` | If missing or earlier than start: `endedAt` omitted (§4). |
| `description` | text | `` | **always empty** | `WorkoutSession.notes` | Trimmed; workout-level (same on every row of a workout; take the first non-empty). **Unverified** for non-empty values. |
| `exercise_title` | text | `Bench Press (Barbell)` | 33 distinct | `exerciseNameSnapshot`, then catalog match | See §5. |
| `superset_id` | text/number | `` | **always empty** | `SessionExercise.supersetGroupId` | See §7. **Unverified.** |
| `exercise_notes` | text | `Sample exercise note` | 3 rows non-empty (same text repeated per set row of one exercise) | `SessionExercise.notes` | Exercise-level, repeated on every row of the exercise block; take the first non-empty value, warn if values differ within a block. |
| `set_index` | integer, 0-based | `0` | 0–4, **restarts at 0 for each exercise** | order of sets within the exercise block | Not stored. Sort key inside a block; ties/gaps keep file order. |
| `set_type` | enum text | `warmup` | `normal`, `warmup` only | `LoggedSet.type` | See §6. |
| `weight_kg` | decimal, `.` separator | `11.25` | 20 empty (14 treadmill, 5 `Back Extension (Weighted Hyperextension)`, 1 `T Bar Row`); fractions like 3.75, 42.5 | `LoggedSet.weight` (kg) | Stored as-is, **no rounding**. Empty → `weight` omitted. |
| `reps` | integer | `12` | 14 empty (all treadmill) | `LoggedSet.reps` | Empty → omitted. Non-integer or negative → set rejected with warning. |
| `distance_km` | decimal | `` | **always empty** | `LoggedSet.distance` (metres) | `km × 1000`. **Unverified.** |
| `duration_seconds` | integer | `600` | 14 rows, all `Treadmill` (with empty weight and reps) | `LoggedSet.durationSeconds` | Seconds, as is. |
| `rpe` | decimal | `` | **always empty** | `LoggedSet.rpe` | Accept 1–10 in 0.5 steps; outside that range → omitted + warning. **Unverified.** |

Hevy-side data that the CSV does **not** carry (so nothing to map, but the UI should say so): per-set notes, workout/exercise media, routine association, body measurements, custom-exercise definitions (muscle groups, equipment), bodyweight at the time.

## 3. Delimiting workouts, exercises and sets

- **Workout** = rows sharing the same (`title`, `start_time`, `end_time`) triple (sample: 29 triples, 29 distinct `start_time`s, so `start_time` alone would also work). Workouts are emitted ordered by `startedAt`.
- **Exercise block** = a *contiguous* run of rows of one workout with the same `exercise_title`. Hevy lists a workout's exercises in performed order and sets by `set_index`; in the sample every exercise appears in exactly one contiguous run. If the same title reappears later in the workout (or `set_index` restarts at 0 within a run), start a new block: it becomes a second `SessionExercise` with the same `exerciseId`. Never merge, never reorder.
- **Set** = one row → one `LoggedSet` (new `newId()`), kept in `set_index` order within the block.
- Rows of a workout need not be adjacent in the file; group by key and keep first-appearance order for blocks.

## 4. Time semantics

- Format: `MMM d, yyyy, h:mm A` with **English** month names and AM/PM (`Oct 13, 2026, 9:50 PM`). Parse with a strict hand-written parser (regex + month table), not `Date.parse`, which is locale- and engine-dependent. Other layouts (a localized export) fail with "unrecognized date format" naming the first offending value; ISO 8601 (`2026-10-13T21:50:00Z` or with offset) is also accepted as a defensive fallback, in which case an explicit offset/`Z` wins over the selected zone.
- **No time zone in the file.** The user chooses an IANA zone in the import screen. Default: the device's current zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), picker offers the full `Intl.supportedValuesOf("timeZone")` list. The chosen zone is applied to every workout in the file and stored as `WorkoutSession.timeZone`; `startedAt`/`endedAt` are the resulting UTC instants (`toISOString()`), so local day grouping (`localDate`) reproduces the day shown in Hevy.
- Wall time → instant uses the selected zone's rules: a time in a DST gap (non-existent) moves forward by the gap length; an ambiguous time (DST fold) takes the first (earlier, pre-transition) occurrence. Both produce a warning on the workout.
- The preview shows first/last workout in the chosen zone and as UTC so the user can sanity check. Changing the zone recomputes everything; nothing is saved before confirmation.
- `endedAt` must be ≥ `startedAt`; otherwise omit `endedAt` and warn. Sessions are `status: "completed"`. Duration is derived (`endedAt − startedAt`); the sample's durations (e.g. 70 min for a 9:50→11:00 PM workout) are Hevy's wall-clock times and may include idle time.
- **Per-set times do not exist** in the export. Every imported set gets `completedAt = endedAt` (or `startedAt` if no end). This is required because only sets with `completedAt` count in metrics; ordering inside the workout comes from array order, not from `completedAt`.
- `createdAt`/`updatedAt` = import time.

Open: the owner has not yet confirmed which zone their sample workouts were logged in; the importer must not guess, which is why the zone is a required, visible choice.

## 5. Exercise naming and matching

Hevy names are `Name (Equipment)` (`Bench Press (Barbell)`, `Lateral Raise (Dumbbell)`, `Chest Press (Machine)`), sometimes with no suffix (`Landmine Row`, `Seated Calf Raise`, `Treadmill`, `Triceps Pushdown`), and sometimes with a **non-equipment** suffix (`Back Extension (Weighted Hyperextension)`, `Decline Crunch (Weighted)`) or dashes (`Lat Pulldown - Close Grip (Cable)`). Custom Hevy exercises look the same. The 33 distinct names in the sample are the realistic test set.

Resolution is per **distinct `exercise_title`** (resolved once, applied to every occurrence; this is what the preview lists):

1. Split off a trailing ` (…)` group as an **equipment hint** (kept only as a hint; also tried as part of the name). Base name = the rest.
2. Candidates in order: full `exercise_title`, then base name, both through the existing `matchExercises` (`#lib/imports/matchExercises`: id → alias → normalized name → fuzzy suggestion; fuzzy never auto-applies), with the equipment hint as the `ExerciseRefV1` equipment hint that boosts matches.
3. `matched` (exact alias/name) is pre-selected but shown and overridable; `suggested` and `unresolved` need a user decision: pick a catalog exercise, **create a custom exercise** (name = the Hevy title verbatim, `isCustom: true`, `exerciseType` inferred, see below), or **skip that exercise's sets** (counted in the report; the workout is still imported).
4. Decisions are remembered per Hevy title in the setting `hevyExerciseMap` (`Record<title, exerciseId>`, included in backups). A later import pre-selects a remembered exercise (unless it no longer exists or is archived) before it tries the resolver. This replaces the earlier idea of adding opt-in aliases to catalog exercises: it never edits the catalog.
5. `exerciseNameSnapshot` = the **mapped exercise's catalog name** (a new custom exercise is named with the Hevy title verbatim), so history and charts read consistently; the Hevy title is not kept. `exerciseTypeSnapshot` = the resolved exercise's type. (T5.07 changed this from "Hevy title verbatim"; see ADR 0006.)

**Import screen (T5.07, Settings → Import from Hevy):** file + time zone → summary → exercise mapping (matched / remembered preselected, suggestions, pick from catalog, create custom, skip; every exercise in an imported workout needs a decision) → duplicates (exact duplicates off by default, possible ones on) → "Import N workouts". Nothing is written before the confirm; then custom exercises, sessions (`importCompletedSessions`) and `hevyExerciseMap` are written in one transaction.

Inferred `exerciseType` for a new custom exercise, from that title's rows across the whole file: has `distance_km` (and no weight) → `distance`; has `duration_seconds` and no weight/reps → `duration` (distance wins for a run with both); title contains `(Assisted…)` → `assisted_bodyweight`; no row has weight and rows have reps → `bodyweight_reps`; otherwise `weighted_reps`. Sample consequences: `Treadmill` → `duration`; `Back Extension (Weighted Hyperextension)` has 5 rows without weight (and presumably weighted rows too) → `weighted_reps`, and the empty-weight sets simply have no weight. Equipment of a custom exercise is not set (Hevy's bracket text is not trustworthy as equipment).

If a catalog exercise's type conflicts with the data (e.g. a `bodyweight_reps` exercise with weights), keep the raw sets and add a warning; do not drop data.

## 6. Set types

| Hevy `set_type` | Present in sample | Maps to | Notes |
|---|---|---|---|
| `normal` | yes (majority) | `normal` | |
| `warmup` | yes | `warmup` | Excluded from volume/PRs by the app, same as Hevy. |
| `drop` / `dropset` / `drop_set` | **no** (unverified) | `drop` | Accept all spellings, compared after trim + lowercase. |
| `failure` | **no** (unverified) | `failure` | |
| anything else | – | `normal` | One warning per distinct unknown value with row count. |

Empty sets (no weight, reps, duration or distance) are skipped with a count in the report, not imported as blank rows.

## 7. Supersets

Not present in the sample (`superset_id` always empty): **unverified** behavior. Intended rule: within one workout, exercise blocks with the same non-empty `superset_id` get the same `supersetGroupId` (a fresh `newId()` per workout and id; the Hevy id is never stored raw). A group with only one block is dropped (no group id). Blocks stay in file order even if group members are not adjacent. Set-level alternation is not reconstructed (the CSV has no timestamps per set). Test with a synthetic fixture.

## 8. Units

- `weight_kg` / `distance_km` / `duration_seconds` are SI, **regardless of the user's Hevy unit setting** (observed; the Hevy units setting of the sample's owner was not checked).
- **lb detection (unverified):** if the header instead has `weight_lbs` / `distance_miles` (the names Hevy uses for imperial exports, per community reports; not seen in our sample), convert with `lbToKg` (`#lib/units`, no rounding) and miles × 1609.344. A header with both families is rejected as ambiguous. The preview shows "Detected units: kg" / "lb" so a wrong guess is visible. There is no per-row unit and no value-based guessing.
- Distance is stored in metres (`km × 1000`, floating-point noise trimmed to 3 decimals of a metre).
- **Assisted bodyweight:** Hevy exports assisted exercises by name (`… (Assisted)`); their weight is the assistance. Mapped with `assisted_bodyweight` when creating a custom exercise or when the matched catalog exercise has that type; the value is stored unchanged. Unverified. Bodyweight exercises with empty weight stay without weight.

## 9. Coverage summary

| Area | Verified by real sample | Handling for the rest |
|---|---|---|
| Columns, quoting, kg, 12h local time, `normal`/`warmup`, notes, duration-only cardio, empty weight/reps, `Name (Equipment)` | ✅ | – |
| `drop`/`failure` set types | ❌ | Spelling-tolerant mapping, synthetic fixture |
| Supersets | ❌ | §7, synthetic fixture |
| RPE | ❌ | Range-validated, synthetic fixture |
| Distance, miles | ❌ | §8, synthetic fixture |
| lb exports, assisted bodyweight | ❌ | §8, synthetic fixture |
| Workout description | ❌ (always empty) | Maps to session notes |
| Non-English month names, other date layouts | ❌ | Reported error; ISO fallback |

## 10. Duplicates and re-import

**Two workouts are the same** when their **start instants are equal** (the same minute in the same chosen zone; Hevy has no seconds) **and** their normalized names (`normalizeName`) are equal. Content is deliberately not compared, so a workout the user later edited is still recognized. Compared against stored sessions (index `startedAt`) and against the other workouts in the same file.

- **Exact duplicate** (rule above): pre-deselected and labeled "already imported"; skipped by default; the user may force-include (it then gets a new id; nothing is merged).
- **Possible duplicate:** a stored session whose start is within ±10 minutes of the workout's start (different name, or the same name but a different instant, which is what a wrong zone choice looks like). Shown as a warning, imported unless deselected.
- **Never overwrite or modify existing sessions.** Re-importing the same file with the same zone adds nothing; with a different zone it adds copies, flagged as "possible duplicate" when offset ≤ 10 min (otherwise not detectable, so the preview warns about re-importing with a different zone and tells the user to delete mistaken imports from history).
- Within a file, two workouts with equal start instant and name keep only the first as importable; the other is listed as a duplicate.
- The import is one batch in one transaction (all-or-nothing per confirmed batch); catalog additions (custom exercises, aliases) are written in the same transaction. The report afterwards lists imported / skipped duplicates / skipped sets / warnings.
- Provenance: sessions carry no import marker in v1 (nothing depends on it). T5.05 may add an optional `importSource` field if a concrete need appears; unknown fields are preserved on export/restore.

## 11. Tests this spec implies (for T5.02+)

Use `tests/fixtures/hevy/sample.csv` (parse: 29 workouts, 547 rows, 33 titles, treadmill durations, empty weights) plus small synthetic CSVs for: CRLF + BOM, embedded comma/newline/`""` in notes, DST gap/fold, midnight crossing, `end < start`, unknown/dropset/failure types, superset ids, RPE out of range, distance, lb headers, missing required column, non-English date, duplicate workouts in file and against stored sessions, repeated non-contiguous exercise.
