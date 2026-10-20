// Deterministic backup (format v1, docs/backup-restore.md) with a realistic amount of history, for the
// performance budgets (PRD §21, tests/e2e/perf.spec.ts): ~300 completed sessions of 8 exercises × 4 sets
// plus one active session with the same exercises. Fixed dates and no randomness, so runs are comparable.
//
//   node scripts/generate-backup-fixture.mjs [out.json]    (stdout when omitted)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const COMPLETED_SESSIONS = 300;
export const FIXTURE_NOW = "2026-06-15T12:00:00.000Z";

const EXERCISES = [
  ["back_squat", "Back Squat", 100],
  ["barbell_bench_press", "Barbell Bench Press", 80],
  ["conventional_deadlift", "Conventional Deadlift", 120],
  ["overhead_press", "Overhead Press", 50],
  ["romanian_deadlift", "Romanian Deadlift", 90],
  ["pull_up", "Pull-Up", 0],
  ["face_pull", "Face Pull", 25],
  ["leg_press", "Leg Press", 160],
];
const SETS_PER_EXERCISE = 4;
const DAY_MS = 86_400_000;
const NOW_MS = Date.parse(FIXTURE_NOW);

const exerciseOf = ([exerciseId, name, base], index, sessionKey, build) => ({
  id: `${sessionKey}-e${index}`,
  exerciseId,
  exerciseNameSnapshot: name,
  exerciseTypeSnapshot: base === 0 ? "bodyweight_reps" : "weighted_reps",
  sets: Array.from({ length: SETS_PER_EXERCISE }, (_, i) => build(base, i, `${sessionKey}-e${index}-s${i}`)),
});

/** @param {number} n 0 = oldest session; one session every 2 days up to ~1 day before `FIXTURE_NOW`. */
function completedSession(n) {
  const startedMs = NOW_MS - (COMPLETED_SESSIONS - n) * 2 * DAY_MS;
  const startedAt = new Date(startedMs).toISOString();
  const endedAt = new Date(startedMs + 3_600_000).toISOString();
  const key = `perf-s${String(n).padStart(3, "0")}`;
  const progression = Math.floor(n / 10) * 2.5; // slow, steady progress so PR detection has real work to do
  return {
    id: key,
    name: `Workout ${n + 1}`,
    status: "completed",
    startedAt,
    endedAt,
    timeZone: "UTC",
    exercises: EXERCISES.map((x, i) =>
      exerciseOf(x, i, key, (base, setIndex, id) => ({
        id,
        type: "normal",
        ...(base === 0 ? {} : { weight: base + progression + (n % 3) * 2.5 }),
        reps: 8 + ((n + setIndex) % 3),
        completedAt: new Date(startedMs + (i * SETS_PER_EXERCISE + setIndex + 1) * 90_000).toISOString(),
      })),
    ),
    createdAt: startedAt,
    updatedAt: endedAt,
  };
}

/** The workout in progress: the same exercises, nothing logged yet, so every set is prefilled from history. */
function activeSession() {
  const startedAt = new Date(NOW_MS - 600_000).toISOString();
  return {
    id: "perf-active",
    name: "Workout",
    status: "active",
    startedAt,
    timeZone: "UTC",
    exercises: EXERCISES.map((x, i) =>
      exerciseOf(x, i, "perf-active", (_base, _i, id) => ({ id, type: "normal" })),
    ),
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

export function buildBackup() {
  const sessions = Array.from({ length: COMPLETED_SESSIONS }, (_, n) => completedSession(n));
  sessions.push(activeSession());
  return {
    backupVersion: 1,
    app: { name: "workout-tracker", version: "perf-fixture" },
    exportedAt: FIXTURE_NOW,
    data: {
      customExercises: [],
      builtinExerciseState: [],
      programs: [],
      routines: [],
      sessions,
      settings: {
        weightUnit: "kg",
        defaultRestSeconds: 90,
        autoStartRestTimer: false,
        previousValuesMode: "exercise",
        weekStartsOn: 1,
        theme: "system",
      },
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = JSON.stringify(buildBackup());
  if (process.argv[2]) writeFileSync(process.argv[2], json);
  else process.stdout.write(json);
}
