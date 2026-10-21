import { z } from "zod";

import { measurementSchema } from "#lib/measurements";

/**
 * Backup file format v2 (docs/backup-restore.md is the spec). Independent of the Dexie schema:
 * it mirrors the domain types in #lib/types, so a future IndexedDB migration never changes the file.
 * Unknown keys are stripped on parse. Limits are generous; they only exist to bound untrusted input.
 * v1 files (no `measurements`) are migrated forward by `migrateBackup` in restore.ts before this schema runs.
 */
export const BACKUP_VERSION = 2;

const id = z.string().min(1).max(100);
const iso = z.iso.datetime().max(40);
const text = (max = 2000) => z.string().max(max);
const name = z.string().min(1).max(200);
const tag = z.string().max(100);
const num = z.number().finite();
const nonneg = num.nonnegative();

const setType = z.enum(["normal", "warmup", "drop", "failure"]);
const exerciseType = z.enum([
  "weighted_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "distance",
]);

/** Only http/https: `z.url()` alone would accept `javascript:` and `data:`. */
const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

export const exerciseSchema = z.object({
  id,
  name,
  aliases: z.array(tag).max(50),
  primaryMuscles: z.array(tag).max(30),
  secondaryMuscles: z.array(tag).max(30),
  equipment: z.array(tag).max(30),
  movementPattern: tag.optional(),
  exerciseType,
  isUnilateral: z.boolean().optional(),
  favorite: z.boolean().optional(),
  instructions: text(20_000).optional(),
  formCues: z.array(text(500)).max(50).optional(),
  media: z
    .array(
      z.object({
        type: z.enum(["image", "video", "gif", "external_link"]),
        url: httpUrl,
        attribution: text(500).optional(),
        license: text(200).optional(),
      }),
    )
    .max(20)
    .optional(),
  source: z
    .object({
      provider: text(200),
      externalId: text(200).optional(),
      sourceUrl: httpUrl.optional(),
      license: text(200).optional(),
      attribution: text(500).optional(),
    })
    .optional(),
  isCustom: z.boolean(),
  archivedAt: iso.optional(),
  createdAt: iso,
  updatedAt: iso,
});

const prescribedSet = z.object({
  id,
  type: setType,
  repRange: z.tuple([nonneg, nonneg]).optional(),
  targetWeight: nonneg.optional(),
  targetDurationSeconds: nonneg.optional(),
  targetDistance: nonneg.optional(),
  targetRpe: num.optional(),
  targetRir: num.optional(),
});

const routineExercise = z.object({
  id,
  exerciseId: id,
  prescribedSets: z.array(prescribedSet).max(100),
  restSeconds: nonneg.optional(),
  notes: text().optional(),
  supersetGroupId: id.optional(),
});

export const routineSchema = z.object({
  id,
  programId: id.optional(),
  programOrder: num.optional(),
  name,
  description: text().optional(),
  exercises: z.array(routineExercise).max(200),
  folderId: id.optional(),
  createdAt: iso,
  updatedAt: iso,
});

export const programSchema = z.object({
  id,
  name,
  description: text(5000).optional(),
  goal: text(500).optional(),
  experienceLevel: text(100).optional(),
  daysPerWeek: nonneg.optional(),
  schedule: z
    .object({
      type: z.literal("weekly"),
      days: z.array(z.object({ day: tag, routineId: id })).max(14),
    })
    .optional(),
  source: z
    .object({
      name: text(200).optional(),
      url: httpUrl.optional(),
      attribution: text(500).optional(),
    })
    .optional(),
  schemaVersion: num,
  createdAt: iso,
  updatedAt: iso,
});

const loggedSet = z.object({
  id,
  prescribedSetId: id.optional(),
  type: setType,
  weight: num.optional(),
  reps: nonneg.optional(),
  durationSeconds: nonneg.optional(),
  distance: nonneg.optional(),
  rpe: num.optional(),
  rir: num.optional(),
  completedAt: iso.optional(),
  notes: text().optional(),
});

const sessionExercise = z.object({
  id,
  exerciseId: id,
  exerciseNameSnapshot: name,
  exerciseTypeSnapshot: exerciseType,
  prescribedSets: z.array(prescribedSet).max(100).optional(),
  restSeconds: nonneg.optional(),
  supersetGroupId: id.optional(),
  notes: text().optional(),
  sets: z.array(loggedSet).max(500),
});

/** `exerciseIds` is a derived index and is not exported; restore recomputes it from `exercises`. */
export const sessionSchema = z.object({
  id,
  routineId: id.optional(),
  programId: id.optional(),
  routineNameSnapshot: text(200).optional(),
  name: text(200),
  status: z.enum(["active", "completed"]),
  startedAt: iso,
  endedAt: iso.optional(),
  timeZone: text(100),
  notes: text(5000).optional(),
  exercises: z.array(sessionExercise).max(200),
  restTimer: z
    .object({
      endsAt: iso,
      durationSeconds: nonneg,
      pausedRemainingMs: nonneg.optional(),
    })
    .optional(),
  createdAt: iso,
  updatedAt: iso,
});

const plateStock = z.object({
  weight: num.positive().max(1000),
  count: z.number().int().nonnegative().max(100),
});

export const settingsSchema = z.object({
  weightUnit: z.enum(["kg", "lb"]),
  defaultRestSeconds: nonneg,
  autoStartRestTimer: z.boolean(),
  timerSound: z.boolean().optional(),
  restNotifications: z.boolean().optional(),
  previousValuesMode: z.enum(["exercise", "routine"]),
  effortInput: z.enum(["off", "rpe", "rir"]).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  theme: z.enum(["system", "light", "dark"]),
  lastBackupAt: iso.optional(),
  backupReminderDays: nonneg.optional(),
  backupReminderSessions: nonneg.optional(),
  hevyExerciseMap: z
    .record(name, id)
    .refine((m) => Object.keys(m).length <= 10_000, "too many mappings")
    .optional(),
  barWeightKg: nonneg.max(1000).optional(),
  plateInventory: z
    .object({ kg: z.array(plateStock).max(50), lb: z.array(plateStock).max(50) })
    .optional(),
});

/** User state on a built-in (seed) exercise; the exercise itself comes from the app catalog. */
export const builtinExerciseStateSchema = z.object({
  id,
  favorite: z.boolean().optional(),
  archivedAt: iso.optional(),
  /** Aliases the user added (not the seed's own). */
  aliases: z.array(tag).max(50).optional(),
});

export const backupV2 = z.object({
  backupVersion: z.literal(BACKUP_VERSION),
  app: z.object({
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(50),
  }),
  exportedAt: iso,
  data: z.object({
    customExercises: z.array(exerciseSchema).max(10_000),
    builtinExerciseState: z.array(builtinExerciseStateSchema).max(10_000),
    programs: z.array(programSchema).max(1_000),
    routines: z.array(routineSchema).max(10_000),
    sessions: z.array(sessionSchema).max(100_000),
    settings: settingsSchema,
    measurements: z.array(measurementSchema).max(100_000),
  }),
});

export type BackupV2 = z.infer<typeof backupV2>;
