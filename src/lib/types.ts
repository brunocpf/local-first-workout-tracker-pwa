// Logical domain model; see docs/data-model.md. Timestamps are ISO 8601, weights in kg.
export type ExerciseType = "weighted_reps" | "bodyweight_reps" | "duration" | "distance";
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
  order: number;
  prescribedSets: PrescribedSet[];
  restSeconds?: number;
  notes?: string;
  supersetGroupId?: string;
};

export type Routine = {
  id: string;
  programId?: string;
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
  routineIds: string[];
  schedule?: { type: "weekly"; days: { day: string; routineId: string }[] };
  source?: { name?: string; url?: string; attribution?: string };
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type CompletedSet = {
  id: string;
  prescribedSetId?: string;
  type: SetType;
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  distance?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  completedAt?: string;
  notes?: string;
};

export type SessionExercise = {
  id: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  order: number;
  notes?: string;
  sets: CompletedSet[];
};

export type WorkoutSession = {
  id: string;
  routineId?: string;
  programId?: string;
  routineSnapshot?: Routine;
  name: string;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  endedAt?: string;
  notes?: string;
  exercises: SessionExercise[];
  createdAt: string;
  updatedAt: string;
};
