# CSV export format

Settings → Backup → **Export history (CSV)** writes `workout-history-YYYY-MM-DD.csv`: one row per logged set of every completed workout (an in-progress workout is excluded), oldest workout first. It is for spreadsheets and other tools; it is **not** a backup (use the JSON backup, see [backup-restore.md](backup-restore.md)).

- UTF-8 with a BOM (so Excel detects the encoding), CRLF line endings, a header row, RFC 4180 quoting (fields containing `,` `"` or a line break are quoted; `"` is doubled).
- Formula-injection guard: a text cell starting with `=`, `+`, `-` or `@` gets a leading `'`. Numbers are never prefixed. A consumer reading the file back should strip that one `'`.
- Empty cell = value not recorded.

| Column | Meaning |
| --- | --- |
| `session_id` | Stable session id |
| `session_name` | Session name at the time |
| `started_at`, `ended_at` | UTC ISO 8601 instants |
| `local_date` | `YYYY-MM-DD` the workout started on, in `time_zone` |
| `time_zone` | IANA zone the workout was performed in |
| `routine_name` | Routine name snapshot, if started from a routine |
| `exercise_id` | Stable exercise id |
| `exercise_name` | Exercise name snapshot |
| `exercise_order` | 1-based position of the exercise in the session |
| `set_order` | 1-based position of the set in the exercise |
| `set_type` | `normal`, `warmup`, `drop` or `failure` |
| `weight_kg` | Weight in kg (always kg, whatever the display unit) |
| `reps` | Repetitions |
| `duration_s` | Seconds |
| `distance_m` | Distance as stored by the app |
| `rpe`, `rir` | Effort ratings |
| `completed` | `true` if the set was completed, else `false` |
| `notes` | Set notes |

## Importing a CSV

Settings → **Import from CSV** brings history in from this app's export or any app's CSV (one row per set). Steps: file → columns, units and time zone → summary → exercises → duplicates and confirm. Nothing is written before the confirm; then new custom exercises and the sessions are written in one all-or-nothing transaction (`commitHevyImport` → `importCompletedSessions`). Code: `src/lib/imports/csvHistory.ts`.

- **Reading:** `,`, `;` or tab delimiter (detected from the header row), UTF-8 with or without BOM, RFC 4180 quoting. Limits: 10 MB, 200 000 rows, 500 columns. Text is stripped of control characters and capped; the one leading `'` the export adds before `= + - @` is removed. Nothing is evaluated.
- **Column mapping:** each field (exercise name, start time, local date, end time, time zone, workout id/name, routine, exercise id, exercise/set position, set type, weight, reps, duration, distance, RPE, RIR, completed, set notes) is mapped to a column or "Not in the file". This app's own headers map automatically, and common names from other apps (`date`, `exercise`, `set`, `weight (lbs)`, …) are suggested. Needed: exercise name, a start time or local date, and at least one of weight/reps/duration/distance.
- **Units:** weight kg/lb (stored as kg), distance m/km/mi (stored as metres), duration seconds/minutes; `h:mm:ss` and `m:ss` are always read as clock time. Hints come from the header (`weight_lbs`, `distance_km`, …).
- **Times and time zone:** ISO 8601 with an offset is an exact instant; without one (or `Oct 13, 2026, 9:50 PM`) it is wall-clock time in the chosen time zone, or in the row's own valid `time_zone` column. A date alone means noon that day. The session's `timeZone` is the row's zone when valid, else the chosen one.
- **Grouping:** rows with the same workout id are one workout; without an id column, the same start value and name. Exercises are blocks keyed by the exercise position when mapped (otherwise runs of one name, a set position that restarts starts a new block); sets are ordered by set position. Set `completed` is `true` unless the cell says false (such a set is stored without `completedAt`; a completed set gets the workout's end, or start, as `completedAt`). Unknown set types import as `normal`; an RPE/RIR out of range is ignored with a warning; a row with an invalid number is left out and listed.
- **Exercises:** an `exercise_id` that is an active catalog exercise is matched exactly; otherwise names go through the same resolver as the Hevy import. Every exercise needs a decision (catalog, create, skip). A created exercise keeps the file's `exercise_id` when that id is unused, so re-importing this app's export restores the same ids.
- **Duplicates:** same rule as the Hevy import ([hevy-import.md §10](hevy-import.md)): equal start minute and normalized name = already imported (off by default); another workout within ±10 minutes = possible duplicate. Nothing is merged or overwritten. A workout id that already exists locally is replaced by a fresh id.
- **Round trip:** re-importing this app's export into an empty database gives the same sessions, exercises (by name and id), sets and set order, and exporting them again yields the same file. Not in the CSV, so not restored: set and exercise-block ids, exact set completion instants, exercise/session notes, supersets, rest settings and prescriptions.
