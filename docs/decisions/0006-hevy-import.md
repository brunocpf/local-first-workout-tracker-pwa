# 0006 – Hevy history import

**Status:** accepted · 2026-10-20 · details in [docs/hevy-import.md](../hevy-import.md)

**Context:** PRD §12.1 / ADR 0005 promote the Hevy history import to the first P1 item. T0.04 obtained a real export (`tests/fixtures/hevy/sample.csv`): CSV, one row per set, `Mon d, yyyy, h:mm A` timestamps **without a time zone**, weights always in kg, set types `normal`/`warmup` only; drop/failure sets, supersets, RPE, distance, lb and assisted bodyweight do not occur in it. Hevy exports cannot be imported back into Hevy.

**Decision:**
- **Format:** CSV only (no Hevy API, per PRD §12.1), parsed by name-based columns with a real RFC 4180 parser; strict, Zod-validated, size-limited. Unknown columns are reported, never interpreted.
- **Time:** the file has no zone, so the user picks an IANA zone (default: device zone) and it is stored as each session's `timeZone`; instants are stored as UTC ISO strings. DST gaps shift forward, folds take the earlier occurrence, with warnings. No guessing from the data.
- **Structure:** a workout = rows with equal (`title`, `start_time`, `end_time`); an exercise block = a contiguous run of one `exercise_title`; sets keep `set_index` order. Every imported set is completed (`completedAt = endedAt`), since the export has no per-set times.
- **Names:** `exerciseNameSnapshot` is Hevy's title verbatim. Matching reuses `matchExercises` (equipment hint from the `(…)` suffix; fuzzy matches are only suggestions); unmatched titles are resolved by the user (pick, create custom, or skip), with an opt-in alias so re-imports match.
- **Unverified features** (drop/failure, supersets, RPE, distance, lb headers, assisted) are implemented defensively per the spec and require synthetic fixtures; behavior is tolerant (unknown set type → `normal` with a warning) rather than rejecting the file.
- **Duplicates:** same start instant + same normalized name = the same workout (content not compared). Duplicates are skipped by default, near-matches (±10 min) are warned about, existing sessions are never overwritten. A batch commits atomically.
- **No model change** in this task; an `importSource` marker on sessions is deferred until needed.

**Consequences:** The importer can be built (T5.02 parser, T5.04 matching, T5.05 save) from this spec without more format research. Re-importing with a different zone cannot be detected beyond ±10 minutes, so the preview warns and history deletion is the remedy. Open for the owner: the zone of the sample workouts and the Hevy units setting; the unverified formats get revisited when a real export containing them is available.
