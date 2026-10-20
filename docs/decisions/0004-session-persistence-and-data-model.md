# 0004 – Session persistence and data model

**Status:** accepted · 2026-10-20

**Context:** A review found drift-prone duplication in the model (program↔routine links, `order` fields, `completed` + `completedAt`), history that depended on a live routine snapshot, no way to group by local day, and no indexes for per-exercise queries. No user data exists yet, so Dexie `version(1)` was changed in place.

**Decision:**
- **Write-through persistence.** The active workout lives in memory as `$state` and is written to Dexie on every mutation: set completion/deletion immediately, text/number field edits on change/blur, and a `visibilitychange` → `hidden` flush as backstop. Never rely on `unload`/`beforeunload` (not fired reliably on mobile). Writes go through `saveSession`, which deep-copies to plain JSON (proxy-safe) and writes in one transaction. On launch, `getActiveSession()` restores the workout.
- **Single active session**, enforced inside the write transaction (also across tabs). Discard = delete the active session after confirmation; no `abandoned` status.
- **Prescription is copied into the session** (`prescribedSets`, `restSeconds`, `supersetGroupId`, name/type snapshots on each `SessionExercise`) instead of a `routineSnapshot`; sessions never depend on live routines, and mid-workout additions have the same shape.
- **One-directional relations**: `Routine.programId` + `programOrder`; `Program.routineIds` removed. Array order replaces `order` fields. Completed ⇔ `completedAt`.
- **`exerciseIds` multi-entry index** on `sessions` (denormalized, maintained by the repository) plus `[status+startedAt]`, so previous-values and PR lookups don't scan history. PRs/aggregates are recomputed from raw sets.
- **Time:** ISO 8601 UTC instants plus `timeZone` (IANA) per session; local day = `localDate(session)`; week start is a setting.
- **Units:** kg numbers internally; lb converted without rounding on input; display rounded to 0.1 lb / 0.05 kg.
- **Rest timer** is session state `{ endsAt, durationSeconds, pausedRemainingMs? }`, timestamp based.
- **Migrations:** future schema changes add new Dexie versions with `upgrade`, tested from frozen old-schema fixtures.

**Consequences:** At most the last unflushed keystroke can be lost on a hard kill; completed sets are never at risk. `exerciseIds` must only be written via the repository. `saveSession` pays a JSON copy per write (small). Bodyweight-type exercises are excluded from volume until bodyweight measurements exist.
