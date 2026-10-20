import type { Exercise, ExerciseType } from "#lib/types";
import type { Equipment, MovementPattern, Muscle } from "./vocab";

/**
 * Built-in exercise catalog. Text is written for this project (no third-party data).
 *
 * Id policy: snake_case, permanent. Ids are referenced by history, backups and import
 * files, so never rename or reuse one. To retire an exercise keep its entry (the
 * importer, history and backups still resolve it) and hide it instead.
 */
export type SeedExercise = Omit<
  Exercise,
  "primaryMuscles" | "secondaryMuscles" | "equipment" | "movementPattern" | "isCustom" | "createdAt" | "updatedAt"
> & {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  movementPattern: MovementPattern;
  isCustom: false;
};

type Opts = { type?: ExerciseType; unilateral?: boolean };

const e = (
  id: string,
  name: string,
  aliases: string[],
  primary: Muscle[],
  secondary: Muscle[],
  equipment: Equipment[],
  movementPattern: MovementPattern,
  { type = "weighted_reps", unilateral }: Opts = {},
): SeedExercise => ({
  id,
  name,
  aliases,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  equipment,
  movementPattern,
  exerciseType: type,
  ...(unilateral ? { isUnilateral: true } : {}),
  isCustom: false,
});

export const SEED_EXERCISES: readonly SeedExercise[] = [
  // Squat
  e("back_squat", "Back Squat", ["Barbell Squat", "Squat"], ["quads", "glutes"], ["adductors", "lower_back", "abs"], ["barbell"], "squat"),
  e("front_squat", "Front Squat", ["Barbell Front Squat"], ["quads"], ["glutes", "abs", "upper_back"], ["barbell"], "squat"),
  e("goblet_squat", "Goblet Squat", ["Dumbbell Goblet Squat", "Kettlebell Goblet Squat"], ["quads", "glutes"], ["abs", "adductors"], ["dumbbell", "kettlebell"], "squat"),
  e("smith_machine_squat", "Smith Machine Squat", ["Smith Squat"], ["quads", "glutes"], ["adductors"], ["smith_machine"], "squat"),
  e("hack_squat", "Hack Squat", ["Machine Hack Squat"], ["quads"], ["glutes", "adductors"], ["machine"], "squat"),
  e("leg_press", "Leg Press", ["45 Degree Leg Press", "Sled Leg Press"], ["quads", "glutes"], ["adductors", "hamstrings"], ["machine"], "squat"),
  e("bodyweight_squat", "Bodyweight Squat", ["Air Squat"], ["quads", "glutes"], ["adductors"], ["bodyweight"], "squat", { type: "bodyweight_reps" }),

  // Lunge / single leg
  e("walking_lunge", "Walking Lunge", ["Dumbbell Walking Lunge"], ["quads", "glutes"], ["hamstrings", "adductors"], ["dumbbell"], "lunge", { unilateral: true }),
  e("reverse_lunge", "Reverse Lunge", ["Dumbbell Reverse Lunge"], ["quads", "glutes"], ["hamstrings"], ["dumbbell"], "lunge", { unilateral: true }),
  e("barbell_lunge", "Barbell Lunge", ["Barbell Forward Lunge"], ["quads", "glutes"], ["hamstrings", "adductors"], ["barbell"], "lunge", { unilateral: true }),
  e("bulgarian_split_squat", "Bulgarian Split Squat", ["Rear Foot Elevated Split Squat", "RFESS"], ["quads", "glutes"], ["adductors", "hamstrings"], ["dumbbell", "bench"], "lunge", { unilateral: true }),
  e("step_up", "Step-Up", ["Dumbbell Step Up", "Box Step Up"], ["quads", "glutes"], ["hamstrings", "calves"], ["dumbbell", "bench"], "lunge", { unilateral: true }),

  // Hinge
  e("conventional_deadlift", "Conventional Deadlift", ["Deadlift", "Barbell Deadlift"], ["glutes", "hamstrings", "lower_back"], ["upper_back", "lats", "forearms", "quads"], ["barbell"], "hinge"),
  e("sumo_deadlift", "Sumo Deadlift", ["Wide Stance Deadlift"], ["glutes", "adductors", "quads"], ["hamstrings", "lower_back", "upper_back"], ["barbell"], "hinge"),
  e("trap_bar_deadlift", "Trap Bar Deadlift", ["Hex Bar Deadlift"], ["quads", "glutes", "hamstrings"], ["lower_back", "upper_back", "forearms"], ["trap_bar"], "hinge"),
  e("romanian_deadlift", "Romanian Deadlift", ["RDL", "Barbell RDL"], ["hamstrings", "glutes"], ["lower_back", "forearms", "upper_back"], ["barbell"], "hinge"),
  e("dumbbell_romanian_deadlift", "Dumbbell Romanian Deadlift", ["DB RDL", "Dumbbell RDL"], ["hamstrings", "glutes"], ["lower_back", "forearms"], ["dumbbell"], "hinge"),
  e("stiff_leg_deadlift", "Stiff-Leg Deadlift", ["SLDL", "Straight Leg Deadlift"], ["hamstrings", "lower_back"], ["glutes"], ["barbell"], "hinge"),
  e("good_morning", "Good Morning", ["Barbell Good Morning"], ["hamstrings", "lower_back", "glutes"], ["abs"], ["barbell"], "hinge"),
  e("barbell_hip_thrust", "Barbell Hip Thrust", ["Hip Thrust"], ["glutes"], ["hamstrings", "adductors"], ["barbell", "bench"], "hinge"),
  e("glute_bridge", "Glute Bridge", ["Bodyweight Glute Bridge"], ["glutes"], ["hamstrings"], ["bodyweight"], "hinge", { type: "bodyweight_reps" }),
  e("kettlebell_swing", "Kettlebell Swing", ["KB Swing", "Russian Swing"], ["glutes", "hamstrings"], ["lower_back", "front_delts", "abs"], ["kettlebell"], "hinge"),
  e("back_extension", "Back Extension", ["Hyperextension", "45 Degree Back Extension"], ["lower_back", "glutes"], ["hamstrings"], ["bodyweight"], "hinge", { type: "bodyweight_reps" }),

  // Horizontal push
  e("barbell_bench_press", "Barbell Bench Press", ["Bench Press", "Flat Bench Press", "BB Bench"], ["chest"], ["triceps", "front_delts"], ["barbell", "bench"], "horizontal_push"),
  e("incline_barbell_bench_press", "Incline Barbell Bench Press", ["Incline Bench Press", "Incline Bench"], ["chest", "front_delts"], ["triceps"], ["barbell", "bench"], "horizontal_push"),
  e("dumbbell_bench_press", "Dumbbell Bench Press", ["DB Bench Press", "Flat Dumbbell Press"], ["chest"], ["triceps", "front_delts"], ["dumbbell", "bench"], "horizontal_push"),
  e("incline_dumbbell_press", "Incline Dumbbell Press", ["Incline DB Press"], ["chest", "front_delts"], ["triceps"], ["dumbbell", "bench"], "horizontal_push"),
  e("close_grip_bench_press", "Close-Grip Bench Press", ["CGBP", "Close Grip Bench"], ["triceps", "chest"], ["front_delts"], ["barbell", "bench"], "horizontal_push"),
  e("smith_machine_bench_press", "Smith Machine Bench Press", ["Smith Bench"], ["chest"], ["triceps", "front_delts"], ["smith_machine", "bench"], "horizontal_push"),
  e("machine_chest_press", "Machine Chest Press", ["Chest Press Machine", "Seated Chest Press"], ["chest"], ["triceps", "front_delts"], ["machine"], "horizontal_push"),
  e("push_up", "Push-Up", ["Pushup", "Press-Up"], ["chest"], ["triceps", "front_delts", "abs"], ["bodyweight"], "horizontal_push", { type: "bodyweight_reps" }),
  e("chest_dip", "Chest Dip", ["Dips", "Parallel Bar Dip"], ["chest", "triceps"], ["front_delts"], ["bodyweight"], "horizontal_push", { type: "bodyweight_reps" }),
  e("weighted_dip", "Weighted Dip", ["Weighted Dips"], ["chest", "triceps"], ["front_delts"], ["bodyweight", "other"], "horizontal_push", { type: "weighted_bodyweight" }),
  e("dumbbell_fly", "Dumbbell Fly", ["DB Fly", "Flat Dumbbell Fly"], ["chest"], ["front_delts"], ["dumbbell", "bench"], "isolation"),
  e("cable_crossover", "Cable Crossover", ["Cable Fly", "Cable Chest Fly"], ["chest"], ["front_delts"], ["cable"], "isolation"),
  e("pec_deck", "Pec Deck", ["Machine Fly", "Butterfly Machine"], ["chest"], ["front_delts"], ["machine"], "isolation"),

  // Vertical push
  e("overhead_press", "Overhead Press", ["OHP", "Standing Barbell Press", "Military Press", "Shoulder Press"], ["front_delts", "side_delts"], ["triceps", "upper_back", "abs"], ["barbell"], "vertical_push"),
  e("seated_dumbbell_press", "Seated Dumbbell Shoulder Press", ["Dumbbell Shoulder Press", "DB Shoulder Press"], ["front_delts", "side_delts"], ["triceps"], ["dumbbell", "bench"], "vertical_push"),
  e("arnold_press", "Arnold Press", ["Dumbbell Arnold Press"], ["front_delts", "side_delts"], ["triceps"], ["dumbbell"], "vertical_push"),
  e("machine_shoulder_press", "Machine Shoulder Press", ["Shoulder Press Machine"], ["front_delts", "side_delts"], ["triceps"], ["machine"], "vertical_push"),
  e("push_press", "Push Press", ["Barbell Push Press"], ["front_delts", "side_delts"], ["triceps", "quads"], ["barbell"], "vertical_push"),

  // Shoulder isolation
  e("dumbbell_lateral_raise", "Dumbbell Lateral Raise", ["Lateral Raise", "Side Raise", "DB Lateral Raise"], ["side_delts"], ["front_delts"], ["dumbbell"], "isolation"),
  e("cable_lateral_raise", "Cable Lateral Raise", ["Single-Arm Cable Lateral Raise"], ["side_delts"], [], ["cable"], "isolation", { unilateral: true }),
  e("reverse_pec_deck", "Reverse Pec Deck", ["Rear Delt Machine", "Reverse Fly Machine"], ["rear_delts"], ["upper_back"], ["machine"], "isolation"),
  e("rear_delt_fly", "Dumbbell Rear Delt Fly", ["Bent-Over Reverse Fly", "Rear Delt Raise"], ["rear_delts"], ["upper_back"], ["dumbbell"], "isolation"),
  e("face_pull", "Face Pull", ["Cable Face Pull", "Rope Face Pull"], ["rear_delts", "upper_back"], ["side_delts", "biceps"], ["cable"], "horizontal_pull"),
  e("barbell_shrug", "Barbell Shrug", ["Shrug"], ["upper_back"], ["forearms"], ["barbell"], "isolation"),
  e("dumbbell_shrug", "Dumbbell Shrug", ["DB Shrug"], ["upper_back"], ["forearms"], ["dumbbell"], "isolation"),

  // Vertical pull
  e("pull_up", "Pull-Up", ["Pullup", "Overhand Pull-Up"], ["lats"], ["biceps", "upper_back", "forearms"], ["pull_up_bar", "bodyweight"], "vertical_pull", { type: "bodyweight_reps" }),
  e("chin_up", "Chin-Up", ["Chinup", "Underhand Pull-Up"], ["lats", "biceps"], ["upper_back", "forearms"], ["pull_up_bar", "bodyweight"], "vertical_pull", { type: "bodyweight_reps" }),
  e("weighted_pull_up", "Weighted Pull-Up", ["Weighted Pullup"], ["lats"], ["biceps", "upper_back", "forearms"], ["pull_up_bar", "other"], "vertical_pull", { type: "weighted_bodyweight" }),
  e("weighted_chin_up", "Weighted Chin-Up", ["Weighted Chinup"], ["lats", "biceps"], ["upper_back", "forearms"], ["pull_up_bar", "other"], "vertical_pull", { type: "weighted_bodyweight" }),
  e("assisted_pull_up", "Assisted Pull-Up", ["Machine Assisted Pull-Up", "Assisted Pullup"], ["lats"], ["biceps", "upper_back"], ["machine"], "vertical_pull", { type: "assisted_bodyweight" }),
  e("assisted_dip", "Assisted Dip", ["Machine Assisted Dip"], ["chest", "triceps"], ["front_delts"], ["machine"], "horizontal_push", { type: "assisted_bodyweight" }),
  e("lat_pulldown", "Lat Pulldown", ["Wide-Grip Pulldown", "Cable Pulldown"], ["lats"], ["biceps", "upper_back", "rear_delts"], ["cable", "machine"], "vertical_pull"),
  e("close_grip_lat_pulldown", "Close-Grip Lat Pulldown", ["Neutral-Grip Pulldown", "V-Bar Pulldown"], ["lats"], ["biceps", "upper_back"], ["cable", "machine"], "vertical_pull"),
  e("straight_arm_pulldown", "Straight-Arm Pulldown", ["Cable Pullover"], ["lats"], ["triceps"], ["cable"], "vertical_pull"),

  // Horizontal pull
  e("barbell_row", "Barbell Row", ["Bent-Over Row", "BB Row"], ["lats", "upper_back"], ["biceps", "rear_delts", "lower_back", "forearms"], ["barbell"], "horizontal_pull"),
  e("pendlay_row", "Pendlay Row", ["Dead-Stop Row"], ["upper_back", "lats"], ["biceps", "lower_back", "rear_delts"], ["barbell"], "horizontal_pull"),
  e("one_arm_dumbbell_row", "One-Arm Dumbbell Row", ["Single-Arm Dumbbell Row", "DB Row"], ["lats", "upper_back"], ["biceps", "rear_delts", "forearms"], ["dumbbell", "bench"], "horizontal_pull", { unilateral: true }),
  e("chest_supported_row", "Chest-Supported Row", ["Incline Dumbbell Row", "Seal Row"], ["upper_back", "lats"], ["biceps", "rear_delts"], ["dumbbell", "bench"], "horizontal_pull"),
  e("seated_cable_row", "Seated Cable Row", ["Cable Row", "Low Row"], ["lats", "upper_back"], ["biceps", "rear_delts"], ["cable"], "horizontal_pull"),
  e("machine_row", "Machine Row", ["Seated Row Machine", "Plate-Loaded Row"], ["upper_back", "lats"], ["biceps", "rear_delts"], ["machine"], "horizontal_pull"),
  e("t_bar_row", "T-Bar Row", ["Landmine Row"], ["upper_back", "lats"], ["biceps", "rear_delts", "lower_back"], ["barbell", "other"], "horizontal_pull"),
  e("inverted_row", "Inverted Row", ["Bodyweight Row", "Australian Pull-Up"], ["upper_back", "lats"], ["biceps", "rear_delts", "abs"], ["bodyweight", "barbell"], "horizontal_pull", { type: "bodyweight_reps" }),

  // Biceps
  e("barbell_curl", "Barbell Curl", ["BB Curl", "Standing Barbell Curl"], ["biceps"], ["forearms"], ["barbell"], "isolation"),
  e("ez_bar_curl", "EZ-Bar Curl", ["EZ Curl", "EZ Bar Curl"], ["biceps"], ["forearms"], ["ez_bar"], "isolation"),
  e("dumbbell_curl", "Dumbbell Curl", ["DB Curl", "Alternating Dumbbell Curl"], ["biceps"], ["forearms"], ["dumbbell"], "isolation"),
  e("hammer_curl", "Hammer Curl", ["Dumbbell Hammer Curl"], ["biceps", "forearms"], [], ["dumbbell"], "isolation"),
  e("incline_dumbbell_curl", "Incline Dumbbell Curl", ["Incline Curl"], ["biceps"], ["forearms"], ["dumbbell", "bench"], "isolation"),
  e("preacher_curl", "Preacher Curl", ["EZ-Bar Preacher Curl"], ["biceps"], ["forearms"], ["ez_bar", "bench"], "isolation"),
  e("cable_curl", "Cable Curl", ["Cable Biceps Curl"], ["biceps"], ["forearms"], ["cable"], "isolation"),

  // Triceps
  e("triceps_pushdown", "Triceps Pushdown", ["Cable Pushdown", "Tricep Pushdown", "Rope Pushdown"], ["triceps"], [], ["cable"], "isolation"),
  e("overhead_triceps_extension", "Overhead Triceps Extension", ["Cable Overhead Extension", "French Press"], ["triceps"], [], ["cable", "dumbbell"], "isolation"),
  e("skull_crusher", "Skull Crusher", ["Lying Triceps Extension", "EZ-Bar Skullcrusher"], ["triceps"], [], ["ez_bar", "bench"], "isolation"),
  e("bench_dip", "Bench Dip", ["Triceps Bench Dip"], ["triceps"], ["chest", "front_delts"], ["bodyweight", "bench"], "horizontal_push", { type: "bodyweight_reps" }),

  // Legs isolation
  e("leg_extension", "Leg Extension", ["Machine Leg Extension"], ["quads"], [], ["machine"], "isolation"),
  e("lying_leg_curl", "Lying Leg Curl", ["Hamstring Curl", "Prone Leg Curl"], ["hamstrings"], ["calves"], ["machine"], "isolation"),
  e("seated_leg_curl", "Seated Leg Curl", ["Seated Hamstring Curl"], ["hamstrings"], ["calves"], ["machine"], "isolation"),
  e("nordic_curl", "Nordic Hamstring Curl", ["Nordic Curl", "Nordics"], ["hamstrings"], ["glutes"], ["bodyweight"], "isolation", { type: "bodyweight_reps" }),
  e("hip_adduction_machine", "Hip Adduction Machine", ["Adductor Machine", "Inner Thigh Machine"], ["adductors"], [], ["machine"], "isolation"),
  e("hip_abduction_machine", "Hip Abduction Machine", ["Abductor Machine", "Outer Thigh Machine"], ["abductors", "glutes"], [], ["machine"], "isolation"),
  e("cable_glute_kickback", "Cable Glute Kickback", ["Cable Kickback"], ["glutes"], ["hamstrings"], ["cable"], "isolation", { unilateral: true }),
  e("standing_calf_raise", "Standing Calf Raise", ["Calf Raise", "Machine Calf Raise"], ["calves"], [], ["machine"], "isolation"),
  e("seated_calf_raise", "Seated Calf Raise", ["Seated Calf"], ["calves"], [], ["machine"], "isolation"),
  e("leg_press_calf_raise", "Leg Press Calf Raise", ["Calf Press"], ["calves"], [], ["machine"], "isolation"),

  // Forearms
  e("wrist_curl", "Wrist Curl", ["Barbell Wrist Curl"], ["forearms"], [], ["barbell", "dumbbell"], "isolation"),

  // Core
  e("plank", "Plank", ["Front Plank", "Forearm Plank"], ["abs"], ["obliques", "lower_back", "front_delts"], ["bodyweight"], "core", { type: "duration" }),
  e("side_plank", "Side Plank", ["Lateral Plank"], ["obliques"], ["abs", "abductors"], ["bodyweight"], "core", { type: "duration", unilateral: true }),
  e("hanging_leg_raise", "Hanging Leg Raise", ["Hanging Knee Raise", "Leg Raise"], ["abs"], ["forearms", "obliques"], ["pull_up_bar", "bodyweight"], "core", { type: "bodyweight_reps" }),
  e("cable_crunch", "Cable Crunch", ["Kneeling Cable Crunch", "Rope Crunch"], ["abs"], ["obliques"], ["cable"], "core"),
  e("crunch", "Crunch", ["Floor Crunch", "Ab Crunch"], ["abs"], [], ["bodyweight"], "core", { type: "bodyweight_reps" }),
  e("ab_wheel_rollout", "Ab Wheel Rollout", ["Ab Roller", "Rollout"], ["abs"], ["lats", "lower_back"], ["other"], "core", { type: "bodyweight_reps" }),
  e("russian_twist", "Russian Twist", ["Weighted Russian Twist"], ["obliques"], ["abs"], ["bodyweight", "dumbbell"], "core"),
  e("pallof_press", "Pallof Press", ["Cable Pallof Press", "Anti-Rotation Press"], ["obliques", "abs"], ["front_delts"], ["cable", "band"], "core", { unilateral: true }),
  e("dead_bug", "Dead Bug", ["Dead Bugs"], ["abs"], ["obliques"], ["bodyweight"], "core", { type: "bodyweight_reps" }),

  // Carries
  e("farmers_carry", "Farmer's Carry", ["Farmer's Walk", "Farmers Walk", "Loaded Carry"], ["forearms", "upper_back"], ["abs", "obliques", "glutes"], ["dumbbell", "kettlebell", "trap_bar"], "carry", { type: "distance" }),

  // Kettlebell / full body
  e("kettlebell_clean_and_press", "Kettlebell Clean and Press", ["KB Clean and Press"], ["front_delts", "glutes"], ["hamstrings", "triceps", "abs", "upper_back"], ["kettlebell"], "vertical_push", { unilateral: true }),
  e("kettlebell_turkish_get_up", "Kettlebell Turkish Get-Up", ["Turkish Get Up", "TGU"], ["abs", "front_delts"], ["glutes", "obliques", "quads"], ["kettlebell"], "core", { unilateral: true }),
  e("barbell_power_clean", "Barbell Power Clean", ["Power Clean", "Clean"], ["glutes", "hamstrings", "upper_back"], ["quads", "front_delts", "forearms"], ["barbell"], "hinge"),
  e("band_pull_apart", "Band Pull-Apart", ["Pull Apart"], ["rear_delts", "upper_back"], [], ["band"], "horizontal_pull"),

  // Cardio
  e("rowing_machine", "Rowing Machine", ["Rower", "Erg", "Concept2"], ["lats", "quads"], ["upper_back", "hamstrings", "biceps", "glutes"], ["cardio_machine"], "cardio", { type: "distance" }),
  e("treadmill_run", "Treadmill Run", ["Treadmill", "Treadmill Running"], ["quads", "hamstrings", "calves"], ["glutes"], ["cardio_machine"], "cardio", { type: "distance" }),
  e("stationary_bike", "Stationary Bike", ["Exercise Bike", "Spin Bike", "Bike"], ["quads"], ["hamstrings", "glutes", "calves"], ["cardio_machine"], "cardio", { type: "distance" }),
  e("elliptical", "Elliptical", ["Cross Trainer"], ["quads", "glutes"], ["hamstrings", "calves"], ["cardio_machine"], "cardio", { type: "duration" }),
  e("stair_climber", "Stair Climber", ["Stairmaster", "Stepmill"], ["quads", "glutes"], ["calves", "hamstrings"], ["cardio_machine"], "cardio", { type: "duration" }),
  e("jump_rope", "Jump Rope", ["Skipping Rope", "Skipping"], ["calves"], ["quads", "forearms"], ["other"], "cardio", { type: "duration" }),
];

/** Lookup by id. */
export const SEED_EXERCISES_BY_ID: ReadonlyMap<string, SeedExercise> = new Map(SEED_EXERCISES.map((x) => [x.id, x]));
