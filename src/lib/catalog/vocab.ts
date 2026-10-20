/** Controlled vocabularies for the built-in exercise catalog. Values are stored as-is on `Exercise`, so never rename one. */

export const MUSCLES = [
  "chest",
  "upper_back",
  "lats",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "abductors",
  "calves",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith_machine",
  "bodyweight",
  "band",
  "ez_bar",
  "trap_bar",
  "bench",
  "pull_up_bar",
  "cardio_machine",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "lunge",
  "carry",
  "core",
  "isolation",
  "cardio",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];
