// Logical domain model; see docs/data-model.md. Timestamps are ISO 8601 UTC instants
// (always `toISOString()`), weights are kg numbers, IDs come from `newId()` (#lib/ids).
export type ExerciseType =
  | "weighted_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight" // logged weight is ADDED load (weighted pull-up)
  | "assisted_bodyweight" // logged weight is ASSISTANCE (assisted pull-up machine)
  | "duration"
  | "distance";
export type SetType = "normal" | "warmup" | "drop" | "failure";

export type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern?: string;
  exerciseType: ExerciseType;
  /** Reps are logged per side and never doubled. */
  isUnilateral?: boolean;
  favorite?: boolean;
  instructions?: string;
  formCues?: string[];
  media?: { type: "image" | "video" | "gif" | "external_link"; url: string; attribution?: string; license?: string }[];
  source?: { provider: string; externalId?: string; sourceUrl?: string; license?: string; attribution?: string };
  isCustom: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PrescribedSet = {
  id: string;
  type: SetType;
  repRange?: [number, number];
  targetWeight?: number;
  targetDurationSeconds?: number;
  targetDistance?: number;
  targetRpe?: number;
  targetRir?: number;
};

export type RoutineExercise = {
  id: string;
  exerciseId: string;
  prescribedSets: PrescribedSet[];
  restSeconds?: number;
  notes?: string;
  supersetGroupId?: string;
};

export type Routine = {
  id: string;
  programId?: string;
  /** A routine belongs to at most one program. Program membership is stored only here. */
  programOrder?: number;
  name: string;
  description?: string;
  exercises: RoutineExercise[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Program = {
  id: string;
  name: string;
  description?: string;
  goal?: string;
  experienceLevel?: string;
  daysPerWeek?: number;
  schedule?: { type: "weekly"; days: { day: string; routineId: string }[] };
  source?: { name?: string; url?: string; attribution?: string };
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

/** A set row in a session. Completed <=> `completedAt` is present. */
export type LoggedSet = {
  id: string;
  prescribedSetId?: string;
  type: SetType;
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  distance?: number;
  rpe?: number;
  rir?: number;
  completedAt?: string;
  notes?: string;
};

/** Self-describing: a copy of the prescription and names at session time, never a live reference. */
export type SessionExercise = {
  id: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  exerciseTypeSnapshot: ExerciseType;
  prescribedSets?: PrescribedSet[];
  restSeconds?: number;
  supersetGroupId?: string;
  notes?: string;
  sets: LoggedSet[];
};

export type RestTimer = {
  /** ISO instant the timer finishes (authoritative while running). */
  endsAt: string;
  durationSeconds: number;
  /** Present only while paused; `endsAt` is stale then. */
  pausedRemainingMs?: number;
};

export type WorkoutSession = {
  id: string;
  /** References for navigation only; history never depends on them still existing. */
  routineId?: string;
  programId?: string;
  routineNameSnapshot?: string;
  name: string;
  /** "Discard" deletes an active session; there is no "abandoned" status. */
  status: "active" | "completed";
  startedAt: string;
  endedAt?: string;
  /** IANA zone (Intl) the session was performed in; used for local day/week grouping. */
  timeZone: string;
  notes?: string;
  exercises: SessionExercise[];
  /** Denormalized for the multi-entry index; maintained by `saveSession`, never write by hand. */
  exerciseIds: string[];
  restTimer?: RestTimer;
  createdAt: string;
  updatedAt: string;
};

export type WeightUnit = "kg" | "lb";

/** One plate size in the user's inventory. `weight` is in that unit's system (45 for lb, 25 for kg); `count` is how many are available per side. */
export type PlateStock = { weight: number; count: number };

/** Plates the user owns, per plate system (`kg` plates for kg, `lb` plates for lb). */
export type PlateInventory = Record<WeightUnit, PlateStock[]>;

export type UserSettings = {
  weightUnit: WeightUnit;
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  /** Beep when a rest timer finishes (only while the app is open). */
  timerSound?: boolean;
  /** Opt-in background rest-timer notifications via the push relay (ADR 0014). The subscription itself is never stored here. */
  restNotifications?: boolean;
  previousValuesMode: "exercise" | "routine";
  /** 0 = Sunday, 1 = Monday, ... 6 = Saturday. */
  weekStartsOn: 0 | 1 | 6;
  theme: "system" | "light" | "dark";
  /** ISO 8601 time of the last successful backup export (not set until the first one). */
  lastBackupAt?: string;
  /** Remind to back up after this many days (0 = off). */
  backupReminderDays?: number;
  /** Remind to back up after this many completed workouts (0 = off). */
  backupReminderSessions?: number;
  /** Hevy `exercise_title` → exercise id, remembered from past imports so a re-import maps the same way (docs/hevy-import.md). */
  hevyExerciseMap?: Record<string, string>;
  /** Empty bar weight in kg for the plate calculator (default 20). */
  barWeightKg?: number;
  /** Plate calculator inventory (defaults in `#lib/tools/plates`). */
  plateInventory?: PlateInventory;
};
