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
