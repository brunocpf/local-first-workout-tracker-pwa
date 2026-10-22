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

const BASE_EXERCISES: readonly SeedExercise[] = [
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

type Guide = { instructions: string; formCues: string[] };

/** Original guide text per seed id (written for this project, no copied descriptions). */
const GUIDES: Record<string, Guide> = {
  back_squat: {
    instructions: "Rest the bar on your upper back, feet about shoulder-width apart, and brace your trunk before each rep. Sit down and back until your hips reach about knee height or a little lower, then drive up through the whole foot.",
    formCues: ["Brace before you descend", "Keep the bar over mid-foot", "Knees follow the line of your toes", "Keep the chest tall through the drive"],
  },
  front_squat: {
    instructions: "Hold the bar across the front of your shoulders with elbows high, so it stays in place as you sink. Keep the torso upright and descend until your hips are at or below knee level, then stand back up.",
    formCues: ["Elbows stay high throughout", "Torso stays upright", "Knees move forward over the toes", "Brace before each rep"],
  },
  goblet_squat: {
    instructions: "Hold one dumbbell or kettlebell vertically against your chest with both hands. Squat down between your legs with your chest up, then push the floor away to return to standing.",
    formCues: ["Weight close to the chest", "Elbows point down inside the knees", "Heels stay flat", "Pause briefly at the bottom"],
  },
  smith_machine_squat: {
    instructions: "Set the bar on your upper back in the Smith machine and place your feet so the bar path feels comfortable. Lower under control until your hips reach about knee height, then press back up.",
    formCues: ["Set foot position before unracking", "Brace before you start", "Control the descent", "Rerack the bar with care"],
  },
  hack_squat: {
    instructions: "Place your shoulders under the pads and your feet on the platform, then release the safety handles. Lower until your hips are about knee height or lower, then press through the platform.",
    formCues: ["Back and shoulders flat on the pad", "Feet placed for comfortable depth", "Keep the heels down", "Don't let the hips roll up at the bottom"],
  },
  leg_press: {
    instructions: "Sit with your back flat on the pad and place your feet on the platform about shoulder width apart. Lower the platform until your knees bend to roughly ninety degrees, then press back up without locking your knees.",
    formCues: ["Lower back stays on the pad", "Avoid locking out hard at the top", "Feet shoulder width, mid-platform", "Lower with control"],
  },
  bodyweight_squat: {
    instructions: "Stand with feet about shoulder width apart and arms forward for balance. Sit back and down, keeping your weight through the whole foot, then stand up tall.",
    formCues: ["Weight through the whole foot", "Chest up and tall", "Knees track over the toes", "Move at a steady pace"],
  },
  walking_lunge: {
    instructions: "Stand tall holding a dumbbell in each hand at your sides. Step forward into a lunge, lower the back knee toward the floor, then push through the front foot to step into the next lunge.",
    formCues: ["Step far enough to keep the front shin near vertical", "Torso stays tall", "Front knee tracks over the toes", "Lower the back knee under control"],
  },
  reverse_lunge: {
    instructions: "Stand tall holding a dumbbell in each hand at your sides. Step one foot back, lower the back knee toward the floor, then drive through the front foot to return to standing.",
    formCues: ["Keep weight in the front heel", "Torso stays upright", "Front knee tracks over the toes", "Step back the same distance each rep"],
  },
  barbell_lunge: {
    instructions: "Rest the bar on your upper back and step forward into a lunge. Lower until the back knee nears the floor, then push through the front foot to return and switch legs.",
    formCues: ["Bar stays level over the shoulders", "Front knee tracks over the toes", "Chest up through the lunge", "Keep the stance steady and balanced"],
  },
  bulgarian_split_squat: {
    instructions: "Rest the top of one foot on a bench behind you, with the front foot a comfortable step forward. Lower straight down until the back knee nears the floor, then drive up through the front foot.",
    formCues: ["Front foot far enough forward", "Torso leans only slightly forward", "Front knee follows the toes", "Keep the hips level"],
  },
  step_up: {
    instructions: "Stand facing a sturdy box or bench. Place one whole foot on the box, press up through that heel to stand tall, then lower with control.",
    formCues: ["Use the whole foot on the box", "Drive through the heel", "Don't push off the back foot", "Lower slowly"],
  },
  conventional_deadlift: {
    instructions: "Stand with the bar over mid-foot, grip just outside your legs, and set your hips and shoulders before lifting. Push the floor away to stand tall, then lower by pushing the hips back until the bar returns to the floor.",
    formCues: ["Bar stays close to the shins", "Neutral back throughout", "Chest up at the start", "Hips and shoulders rise together"],
  },
  sumo_deadlift: {
    instructions: "Stand with a wide stance, toes turned out, and grip the bar inside your knees. Keep your chest up, push the floor away, and press the hips forward at the top.",
    formCues: ["Knees track over the toes", "Chest up and back flat", "Grip inside the knees", "Bar stays close through the lift"],
  },
  trap_bar_deadlift: {
    instructions: "Stand inside the trap bar with feet about hip width apart and grip the handles at your sides. Brace, then stand up by pushing the floor away, and lower under control.",
    formCues: ["Center your feet in the bar", "Brace before pulling", "Chest tall and back neutral", "Stand fully tall at the top"],
  },
  romanian_deadlift: {
    instructions: "Hold the bar at hip height with a shoulder-width grip and soft knees. Push the hips back, letting the bar slide close to the legs, then return to standing by driving the hips forward.",
    formCues: ["Push the hips back, not down", "Bar stays close to the legs", "Keep the back flat", "Stop where the hamstrings are stretched"],
  },
  dumbbell_romanian_deadlift: {
    instructions: "Hold a dumbbell in each hand at your sides with soft knees. Push the hips back while lowering the weights along your legs, then stand tall by driving the hips forward.",
    formCues: ["Hinge at the hips", "Weights stay close to the legs", "Back stays flat", "Squeeze the glutes to stand"],
  },
  stiff_leg_deadlift: {
    instructions: "Hold the bar at hip height with a shoulder-width grip and keep your knees nearly straight. Lower the bar by hinging at the hips until you feel a stretch in the hamstrings, then return to standing.",
    formCues: ["Knees stay nearly straight, not locked", "Hinge from the hips", "Keep the back flat", "Control the lowering phase"],
  },
  good_morning: {
    instructions: "Rest the bar on your upper back with a soft knee bend. Hinge forward at the hips, keeping the back flat, until your torso is near parallel to the floor, then return upright.",
    formCues: ["Bar stays on the upper back", "Hinge at the hips", "Back stays flat", "Use a light weight to learn the pattern"],
  },
  barbell_hip_thrust: {
    instructions: "Sit with your upper back against a bench and the bar across your hips. Drive through your heels to lift the hips until your torso is level with your thighs, then lower under control.",
    formCues: ["Heels planted under the knees", "Chin tucked, ribs down", "Pause at the top", "Lower the hips with control"],
  },
  glute_bridge: {
    instructions: "Lie on your back with knees bent and feet flat on the floor. Press through your heels to lift your hips until your body forms a straight line, then lower with control.",
    formCues: ["Heels close to the glutes", "Squeeze at the top", "Ribs down, don't arch the back", "Keep the knees in line with the feet"],
  },
  kettlebell_swing: {
    instructions: "Stand with feet slightly wider than hip width and hold a kettlebell with both hands. Hinge at the hips to swing the bell back between your legs, then snap the hips forward to float it to chest height.",
    formCues: ["Power comes from the hips", "Arms stay relaxed", "Bell stops at chest height", "Brace the trunk on every swing"],
  },
  back_extension: {
    instructions: "Set the pad just below your hips and lock your legs in place. Hinge forward with a flat back, then raise your torso by squeezing the glutes and back until you are in line with your body.",
    formCues: ["Move from the hips", "Don't hyperextend at the top", "Hold a weight close to the chest if needed", "Lower slowly"],
  },
  barbell_bench_press: {
    instructions: "Lie on the bench with your eyes under the bar, feet flat, and a grip slightly wider than shoulder width. Lower the bar to the lower chest with control, then press it up until your arms are straight.",
    formCues: ["Shoulder blades pulled back and down", "Forearms vertical at the bottom", "Feet planted firmly", "Bar path is a slight arc toward the upper chest"],
  },
  incline_barbell_bench_press: {
    instructions: "Set the bench to a moderate incline and unrack the bar over your upper chest. Lower it under control to the upper chest, then press back up over your shoulders.",
    formCues: ["Keep the incline moderate", "Shoulder blades set on the bench", "Elbows at a comfortable angle", "Press in a smooth path"],
  },
  dumbbell_bench_press: {
    instructions: "Sit on the end of a flat bench with a dumbbell on each thigh, then lie back and bring them to chest level. Press them up until your arms are straight, then lower with control.",
    formCues: ["Lower the dumbbells beside the chest", "Wrists stacked over elbows", "Press evenly on both sides", "Keep the feet stable"],
  },
  incline_dumbbell_press: {
    instructions: "Set the bench to a moderate incline and hold a dumbbell in each hand at shoulder height. Press upward until your arms are straight, then lower the weights with control.",
    formCues: ["Shoulder blades back", "Elbows slightly below the bench", "Press evenly on both sides", "Lower to a comfortable stretch"],
  },
  close_grip_bench_press: {
    instructions: "Lie on a flat bench and grip the bar about shoulder width apart. Lower the bar to the lower chest with elbows tucked, then press it back up.",
    formCues: ["Hands about shoulder width", "Elbows stay close to the body", "Bar touches the lower chest", "Don't flare the elbows out"],
  },
  smith_machine_bench_press: {
    instructions: "Lie under the Smith bar with your eyes under it and set the grip slightly wider than shoulder width. Lower the bar to the lower chest under control, then press it straight up.",
    formCues: ["Set the bar height before lying down", "Shoulder blades pulled back", "Feet planted firmly", "Use the safety stops"],
  },
  machine_chest_press: {
    instructions: "Adjust the seat so the handles line up with the middle of your chest. Press the handles forward until your arms are almost straight, then return slowly.",
    formCues: ["Back stays on the pad", "Handles at mid-chest height", "Don't lock the elbows hard", "Move the handles smoothly"],
  },
  push_up: {
    instructions: "Place your hands slightly wider than your shoulders and keep your body in a straight line from head to heels. Lower your chest toward the floor with the elbows angled back, then press back up.",
    formCues: ["Body in a straight line", "Elbows angle back, not flared", "Lower until the chest nears the floor", "Press the floor away at the top"],
  },
  chest_dip: {
    instructions: "Grip the parallel bars and lift yourself so your arms are straight. Lean the torso slightly forward, lower until the upper arms are about level with the floor, then press back up.",
    formCues: ["Lean slightly forward for chest focus", "Shoulders pulled down away from the ears", "Lower only as far as is comfortable", "Press up with control"],
  },
  weighted_dip: {
    instructions: "Attach a weight to a belt or hold it between your feet. Start from the top of a dip, lower with control, then press back up.",
    formCues: ["Secure the weight before starting", "Lean slightly forward", "Shoulders stay down", "Lower until comfortable"],
  },
  dumbbell_fly: {
    instructions: "Lie on a flat bench holding dumbbells above your chest with a soft bend in your elbows. Open your arms in a wide arc until you feel a stretch across your chest, then bring them back together over the chest.",
    formCues: ["Keep the elbow bend fixed", "Move in a wide arc", "Stop before the shoulders feel strained", "Squeeze the chest on the way up"],
  },
  cable_crossover: {
    instructions: "Set the pulleys at about shoulder height and step forward with a split stance. Bring the handles together in front of your chest in a wide arc, then return slowly to the stretch.",
    formCues: ["Lean slightly forward", "Keep the elbows soft", "Squeeze at the midline", "Control the return"],
  },
  pec_deck: {
    instructions: "Sit with your back against the pad and place your forearms on the pads. Bring the pads together in front of your chest, then return slowly until you feel a stretch.",
    formCues: ["Back and shoulders stay on the pad", "Keep the elbow bend fixed", "Squeeze at the center", "Return with control"],
  },
  overhead_press: {
    instructions: "Hold the bar at shoulder height with a grip just outside your shoulders. Brace your trunk, press the bar straight up while moving your head back slightly, then lower it to the upper chest.",
    formCues: ["Glutes and trunk braced", "Bar path straight over mid-foot", "Head moves back to let the bar pass", "Lock out overhead with the bar over the shoulders"],
  },
  seated_dumbbell_press: {
    instructions: "Sit upright on a bench with back support and hold a dumbbell at each shoulder. Press the weights overhead until your arms are straight, then lower them to shoulder height.",
    formCues: ["Back stays against the pad", "Wrists stacked over elbows", "Press evenly on both sides", "Lower to shoulder height"],
  },
  arnold_press: {
    instructions: "Start seated with dumbbells in front of your shoulders and palms facing you. As you press up, rotate your palms to face forward, then reverse the motion on the way down.",
    formCues: ["Rotate smoothly through the press", "Keep the torso upright", "Press in a controlled arc", "Lower with the same rotation"],
  },
  machine_shoulder_press: {
    instructions: "Adjust the seat so the handles start about level with your shoulders. Press the handles up until your arms are almost straight, then lower with control.",
    formCues: ["Back stays on the pad", "Handles start at shoulder height", "Don't lock the elbows hard", "Control the lowering"],
  },
  push_press: {
    instructions: "Hold the bar at shoulder height and dip your knees slightly. Drive through the legs and press the bar overhead, then lower it with control to the start.",
    formCues: ["Short, quick dip and drive", "Trunk braced through the drive", "Bar stays close to the face", "Lock out the arms at the top"],
  },
  dumbbell_lateral_raise: {
    instructions: "Stand tall holding a dumbbell in each hand at your sides. Raise your arms out to the sides until they are about level with your shoulders, then lower slowly.",
    formCues: ["Slight bend in the elbows", "Lead with the elbows", "Stop at shoulder height", "Use a weight you can control"],
  },
  cable_lateral_raise: {
    instructions: "Stand side-on to a low cable pulley and hold the handle in the hand farther from the stack. Raise your arm out to the side to shoulder height, then return slowly.",
    formCues: ["Keep the torso still", "Lead with the elbow", "Stop at shoulder height", "Control the return"],
  },
  reverse_pec_deck: {
    instructions: "Sit facing the pec deck with your chest against the pad and your arms straight. Open your arms out to the sides in a wide arc, then bring them back to the start.",
    formCues: ["Chest stays on the pad", "Slight bend in the elbows", "Lead with the elbows", "Move slowly through the full range"],
  },
  rear_delt_fly: {
    instructions: "Hinge at the hips with a dumbbell in each hand and a neutral spine. Raise your arms out to the sides until they are about level with your shoulders, then lower with control.",
    formCues: ["Hinge with a flat back", "Slight bend in the elbows", "Lead with the elbows", "Keep the neck relaxed"],
  },
  face_pull: {
    instructions: "Set a rope on a high cable pulley and grip it with palms facing down. Pull the rope toward your face, separating the ends and bringing the elbows up and back, then return with control.",
    formCues: ["Elbows higher than the hands", "Pull toward the forehead", "Keep the torso upright", "Squeeze the upper back at the end"],
  },
  barbell_shrug: {
    instructions: "Hold a barbell at your thighs with arms straight and an overhand grip. Lift your shoulders straight up toward your ears, pause, then lower them with control.",
    formCues: ["Move straight up and down", "Don't roll the shoulders", "Arms stay straight", "Pause at the top"],
  },
  dumbbell_shrug: {
    instructions: "Stand tall holding a dumbbell in each hand at your sides. Lift your shoulders straight up toward your ears, pause, then lower slowly.",
    formCues: ["Move straight up, not forward", "Arms stay relaxed", "Pause briefly at the top", "Control the lowering"],
  },
  pull_up: {
    instructions: "Grip the bar slightly wider than shoulder width with palms facing away. Pull your chest toward the bar by driving the elbows down, then lower under control until your arms are straight.",
    formCues: ["Start from a dead hang", "Pull the elbows down", "Keep the chest proud", "Avoid swinging"],
  },
  chin_up: {
    instructions: "Grip the bar with palms facing you at about shoulder width. Pull your chest toward the bar, leading with the chin and elbows, then lower under control.",
    formCues: ["Start from a dead hang", "Drive the elbows down and in", "Avoid swinging", "Lower slowly"],
  },
  weighted_pull_up: {
    instructions: "Attach a weight to a belt or hold it between your feet. Pull your chest toward the bar from a dead hang, then lower with control to full arm extension.",
    formCues: ["Secure the weight before starting", "Pull the elbows down", "Keep the body still", "Lower fully each rep"],
  },
  weighted_chin_up: {
    instructions: "Attach a weight to a belt or hold it between your feet. Grip the bar with palms facing you, pull your chest up to the bar, then lower with control.",
    formCues: ["Secure the weight before starting", "Drive the elbows down", "Avoid swinging", "Lower to a full hang"],
  },
  assisted_pull_up: {
    instructions: "Set the assistance on the machine to a level that lets you complete the reps with control. Grip the handles, pull your chest toward the bar, then lower until your arms are straight.",
    formCues: ["Choose an assistance level that keeps form", "Pull the elbows down", "Keep the body still", "Lower fully each rep"],
  },
  assisted_dip: {
    instructions: "Set the assistance on the machine so you can press up with control. Lower until your upper arms are about level with the floor, then press back up.",
    formCues: ["Lean slightly forward", "Shoulders down from the ears", "Lower only as far as comfortable", "Press up smoothly"],
  },
  lat_pulldown: {
    instructions: "Sit with your thighs under the pads and grip the bar wider than shoulder width. Pull the bar to your upper chest by driving the elbows down and back, then let the arms straighten under control.",
    formCues: ["Sit tall with the chest up", "Pull the elbows toward the ribs", "Avoid leaning far back", "Control the return"],
  },
  close_grip_lat_pulldown: {
    instructions: "Sit with your thighs under the pads and grip the close handle with palms facing each other. Pull the handle down to your upper chest, then return the arms to the top under control.",
    formCues: ["Keep the chest up", "Drive the elbows down", "Lean back only slightly", "Pull to the upper chest"],
  },
  straight_arm_pulldown: {
    instructions: "Stand facing a high cable pulley and grip a straight bar at about shoulder width. Keeping the arms straight, pull the bar down in an arc to the thighs, then return slowly.",
    formCues: ["Keep the elbows nearly straight", "Hinge slightly forward", "Move the bar in an arc", "Squeeze the lats at the bottom"],
  },
  barbell_row: {
    instructions: "Hinge forward with a flat back and grip the bar just outside your knees. Pull the bar toward your lower ribs by driving the elbows back, then lower it under control.",
    formCues: ["Back stays flat", "Bar stays close to the legs", "Pull to the lower ribs", "Brace the trunk before each rep"],
  },
  pendlay_row: {
    instructions: "Set the bar on the floor and hinge until your torso is near parallel to the ground. Pull the bar explosively to the lower chest, then return it to the floor between reps.",
    formCues: ["Start each rep from the floor", "Keep the back flat", "Pull to the lower chest", "Let the bar return to the floor"],
  },
  one_arm_dumbbell_row: {
    instructions: "Place one hand and knee on a bench, keeping the back flat. Pull the dumbbell up toward your hip by driving the elbow back, then lower it fully.",
    formCues: ["Keep the back flat and parallel", "Pull toward the hip", "Keep the shoulder down", "Avoid twisting the torso"],
  },
  chest_supported_row: {
    instructions: "Lie face down on an incline bench with your chest supported. Pull the handles or dumbbells toward your sides by driving the elbows back, then lower with control.",
    formCues: ["Chest stays on the pad", "Squeeze the shoulder blades together", "Pull to the sides of the torso", "Avoid shrugging"],
  },
  seated_cable_row: {
    instructions: "Sit with your feet on the platform and knees slightly bent. Pull the handle toward your lower ribs while keeping the chest up, then return with control.",
    formCues: ["Chest up, back neutral", "Pull to the lower ribs", "Keep the shoulders down", "Don't rock the torso"],
  },
  machine_row: {
    instructions: "Set the seat so the handles start at about arm's length. Pull the handles toward your torso by driving the elbows back, then return slowly.",
    formCues: ["Chest stays against the pad", "Pull the elbows back", "Shoulders stay down", "Return to a full stretch"],
  },
  t_bar_row: {
    instructions: "Straddle the bar with a neutral back and grip the handles. Pull the weight toward your chest by driving the elbows back, then lower under control.",
    formCues: ["Hinge with a flat back", "Keep the chest over the bar", "Pull the elbows back", "Avoid jerking the weight"],
  },
  inverted_row: {
    instructions: "Lie under a bar set at about hip height and grip it. Keep your body in a straight line, pull your chest toward the bar, then lower with control.",
    formCues: ["Body in a straight line", "Pull the chest to the bar", "Elbows drive back", "Don't sag the hips"],
  },
  barbell_curl: {
    instructions: "Stand holding a barbell with an underhand grip at about shoulder width. Curl the bar up by bending the elbows, keeping the upper arms still, then lower it under control.",
    formCues: ["Elbows stay at your sides", "Don't swing the torso", "Squeeze at the top", "Lower slowly"],
  },
  ez_bar_curl: {
    instructions: "Hold the EZ bar at the angled grips with an underhand grip. Curl the bar up while keeping the elbows still, then lower it under control.",
    formCues: ["Elbows stay close to the ribs", "Avoid swinging the body", "Use the angled grips", "Lower slowly"],
  },
  dumbbell_curl: {
    instructions: "Stand holding a dumbbell in each hand with palms facing forward. Curl the weights up by bending the elbows, then lower them under control.",
    formCues: ["Keep the upper arms still", "Rotate the palms up as you curl", "Don't swing", "Lower fully each rep"],
  },
  hammer_curl: {
    instructions: "Stand holding a dumbbell in each hand with palms facing each other. Curl the weights up without rotating the wrists, then lower them under control.",
    formCues: ["Palms face each other", "Elbows stay at your sides", "Don't swing the torso", "Lower slowly"],
  },
  incline_dumbbell_curl: {
    instructions: "Sit on an incline bench with your back supported and let your arms hang straight down. Curl the dumbbells up without moving the upper arms, then lower them slowly.",
    formCues: ["Upper arms stay behind the body", "Let the arms hang fully", "Don't swing", "Control the lowering"],
  },
  preacher_curl: {
    instructions: "Sit at a preacher bench with your upper arms resting on the pad. Curl the weight up, then lower it slowly until the arms are nearly straight.",
    formCues: ["Keep the upper arms on the pad", "Don't lift the elbows off the pad", "Lower fully", "Avoid bouncing at the bottom"],
  },
  cable_curl: {
    instructions: "Stand facing a low cable pulley and grip the handle with an underhand grip. Curl the handle up with the elbows at your sides, then lower with control.",
    formCues: ["Elbows stay at your sides", "Keep the torso still", "Squeeze at the top", "Lower slowly"],
  },
  triceps_pushdown: {
    instructions: "Stand facing a high cable pulley with elbows at your sides. Push the bar or rope down until your arms are straight, then let it return with control.",
    formCues: ["Elbows stay pinned", "Lock out at the bottom", "Keep the torso upright", "Don't lean into the push"],
  },
  overhead_triceps_extension: {
    instructions: "Hold a dumbbell or cable handle overhead with both hands. Lower it behind your head by bending the elbows, then extend the arms back to the top.",
    formCues: ["Keep the elbows close to the head", "Lower to a comfortable stretch", "Keep the ribs down", "Move only the forearms"],
  },
  skull_crusher: {
    instructions: "Lie on a bench holding an EZ bar or dumbbells above your chest. Lower the weight toward your forehead by bending the elbows, then extend the arms back up.",
    formCues: ["Elbows point toward the ceiling", "Upper arms stay still", "Lower to just above the forehead", "Control each rep"],
  },
  bench_dip: {
    instructions: "Sit on the edge of a bench with your hands beside your hips, then slide forward. Lower by bending the elbows until they are about ninety degrees, then press back up.",
    formCues: ["Keep the back close to the bench", "Elbows point back, not out", "Shoulders stay down", "Lower only as far as comfortable"],
  },
  leg_extension: {
    instructions: "Sit in the machine with the pad on your lower shins and grip the handles. Extend the knees until the legs are straight, pause briefly, then lower under control.",
    formCues: ["Keep the back against the seat", "Pause at full extension", "Control the lowering", "Don't use momentum"],
  },
  lying_leg_curl: {
    instructions: "Lie face down on the machine with the pad just above your heels. Curl the heels toward your glutes, then lower under control.",
    formCues: ["Hips stay on the pad", "Don't lift the hips", "Squeeze at the top", "Control the lowering"],
  },
  seated_leg_curl: {
    instructions: "Sit in the machine with the pad resting on your lower legs and your thighs secured. Bend the knees to draw the pad down, then return under control.",
    formCues: ["Keep the back against the seat", "Keep the thighs secured", "Squeeze at the bend", "Control the return"],
  },
  nordic_curl: {
    instructions: "Kneel with your ankles secured and your body straight from knees to head. Lower your torso forward as slowly as you can by controlling the hamstrings, then use your hands to push back up if needed.",
    formCues: ["Keep the hips extended", "Lower slowly", "Use the hands to assist the return", "Start with a partial range"],
  },
  hip_adduction_machine: {
    instructions: "Sit in the machine with the pads against the inside of your thighs. Squeeze the legs together, pause, then return slowly to the start.",
    formCues: ["Keep the back against the seat", "Move in a smooth path", "Pause at the squeeze", "Don't bounce at the end"],
  },
  hip_abduction_machine: {
    instructions: "Sit in the machine with the pads against the outside of your thighs. Push the legs apart, pause, then return slowly.",
    formCues: ["Keep the back against the seat", "Move in a smooth path", "Pause when the legs are apart", "Return with control"],
  },
  cable_glute_kickback: {
    instructions: "Attach an ankle strap to a low cable and face the stack, holding the frame for support. With the knee soft, kick the leg straight back and up, squeeze the glute, then return under control.",
    formCues: ["Keep the torso still", "Don't arch the lower back", "Squeeze the glute at the top", "Control the return"],
  },
  standing_calf_raise: {
    instructions: "Stand on the edge of a step or machine platform with the balls of your feet on it. Raise your heels as high as possible, pause, then lower slowly to a full stretch.",
    formCues: ["Use a full range of motion", "Pause at the top", "Lower until the calves stretch", "Keep the knees straight"],
  },
  seated_calf_raise: {
    instructions: "Sit in the machine with the pad on your thighs just above the knees and the balls of your feet on the platform. Raise your heels, pause, then lower slowly to a stretch.",
    formCues: ["Use a full range of motion", "Pause at the top", "Control the lowering", "Keep the pad secure on the thighs"],
  },
  leg_press_calf_raise: {
    instructions: "Sit in the leg press with the balls of your feet on the lower edge of the platform and your legs straight. Push through the balls of the feet to raise the heels, pause, then lower slowly.",
    formCues: ["Keep the knees straight", "Use a full range of motion", "Pause at the top", "Lower until the calves stretch"],
  },
  wrist_curl: {
    instructions: "Sit with your forearms resting on your thighs or a bench and palms facing up, holding a dumbbell. Curl the wrists upward, then lower slowly to a stretch.",
    formCues: ["Keep the forearms still", "Move only the wrists", "Use a light weight", "Lower slowly"],
  },
  plank: {
    instructions: "Support yourself on your forearms and toes, with your elbows under your shoulders. Hold a straight line from head to heels while bracing the abs and breathing steadily.",
    formCues: ["Body in a straight line", "Ribs down, glutes engaged", "Elbows under the shoulders", "Breathe steadily"],
  },
  side_plank: {
    instructions: "Lie on one side and support yourself on your forearm with your elbow under your shoulder. Lift your hips so the body forms a straight line, then hold, and switch sides.",
    formCues: ["Body in a straight line", "Keep the hips lifted", "Elbow under the shoulder", "Don't let the hips sag"],
  },
  hanging_leg_raise: {
    instructions: "Hang from a bar with your arms straight and palms facing away. Raise your legs by curling the pelvis up, pause, then lower with control.",
    formCues: ["Avoid swinging", "Curl the pelvis up", "Lower slowly", "Keep the legs as straight as is comfortable"],
  },
  cable_crunch: {
    instructions: "Kneel facing a high cable pulley and hold the rope behind your head. Crunch the torso down by bending the spine, bringing the elbows toward the knees, then return slowly.",
    formCues: ["Move from the spine, not the hips", "Keep the hips still", "Breathe out on the crunch", "Control the return"],
  },
  crunch: {
    instructions: "Lie on your back with knees bent and feet flat on the floor. Curl the shoulders off the floor by bringing the ribs toward the hips, pause, then lower slowly.",
    formCues: ["Don't pull on the neck", "Move the ribs toward the hips", "Keep the feet flat", "Exhale as you curl up"],
  },
  ab_wheel_rollout: {
    instructions: "Kneel and hold the ab wheel under your shoulders. Roll forward slowly while keeping your back straight, going only as far as you can control, then pull back to the start.",
    formCues: ["Keep the back flat", "Brace the abs throughout", "Roll only as far as you can control", "Keep the hips in line"],
  },
  russian_twist: {
    instructions: "Sit with your knees bent and your torso leaned back slightly, holding a weight at your chest. Rotate the torso from side to side, touching the weight near the floor on each side.",
    formCues: ["Keep the back straight", "Rotate from the torso", "Keep the feet controlled", "Move at a steady pace"],
  },
  pallof_press: {
    instructions: "Stand side-on to a cable at chest height and hold the handle at your chest. Press the handle straight out in front of you, resist the rotation, pause, then bring it back to your chest.",
    formCues: ["Stay square to the cable", "Resist the pull", "Keep the ribs down", "Move the arms without the torso"],
  },
  dead_bug: {
    instructions: "Lie on your back with your arms reaching up and your knees bent over the hips. Slowly extend one arm and the opposite leg toward the floor while keeping your lower back in contact with the floor, then return.",
    formCues: ["Keep the lower back pressed down", "Move slowly and under control", "Exhale as you extend", "Keep the ribs down"],
  },
  farmers_carry: {
    instructions: "Hold a heavy dumbbell or kettlebell in each hand at your sides. Walk a set distance with your shoulders down, back tall and steps steady, then set the weights down.",
    formCues: ["Stand tall with shoulders down", "Brace the trunk", "Keep steps short and steady", "Grip the handles firmly"],
  },
  kettlebell_clean_and_press: {
    instructions: "Start with a kettlebell on the floor between your feet. Swing it up and catch it at the shoulder in the rack position, then press it overhead and lower it back to the shoulder with control.",
    formCues: ["Use the hips to drive the bell up", "Catch the bell at the shoulder", "Brace before pressing", "Keep the wrist straight in the rack"],
  },
  kettlebell_turkish_get_up: {
    instructions: "Lie on your back holding a kettlebell straight up in one hand. Move slowly through the stages to stand, keeping your eyes on the bell and the arm straight, then reverse the movement to return to the floor.",
    formCues: ["Keep the eyes on the bell", "Move one stage at a time", "Keep the bell arm straight", "Use a light weight to learn it"],
  },
  barbell_power_clean: {
    instructions: "Start with the bar over mid-foot and grip just outside the knees. Drive the bar up with the legs and hips, then shrug and pull the elbows high to catch the bar at the shoulders in a quarter squat.",
    formCues: ["Keep the bar close to the body", "Extend the hips fully", "Elbows high on the catch", "Land in a stable quarter squat"],
  },
  band_pull_apart: {
    instructions: "Hold a resistance band at shoulder height with your arms straight in front of you. Pull the band apart by moving your arms out to the sides, squeezing the shoulder blades together, then return slowly.",
    formCues: ["Keep the arms straight", "Squeeze the shoulder blades", "Keep the shoulders down", "Control the return"],
  },
  rowing_machine: {
    instructions: "Strap your feet in and grip the handle with the seat in the forward position. Push with the legs first, then lean back and pull the handle to the lower ribs, reversing the order to return.",
    formCues: ["Legs drive first, then the back", "Keep the arms straight until the legs finish", "Lean back only slightly", "Keep a steady rhythm"],
  },
  treadmill_run: {
    instructions: "Set a comfortable speed and incline on the treadmill, holding the handrails only for balance. Run at an even pace that lets you keep a steady breath, and slow down before stepping off.",
    formCues: ["Let the arms swing naturally", "Land under the hips", "Keep the posture tall", "Hold the handrails only if needed"],
  },
  stationary_bike: {
    instructions: "Adjust the saddle so your knee has a slight bend at the bottom of the pedal stroke. Pedal at a steady pace with the handlebars comfortable and the trunk relaxed.",
    formCues: ["Set the saddle height first", "Keep the torso relaxed", "Pedal with smooth circles", "Keep a steady breathing pace"],
  },
  elliptical: {
    instructions: "Stand on the pedals with your feet flat and hold the handles lightly. Move in a smooth, continuous stride at a steady pace, keeping the posture upright.",
    formCues: ["Keep the posture tall", "Push through the whole foot", "Hold the handles lightly", "Keep the stride smooth"],
  },
  stair_climber: {
    instructions: "Hold the handrails only for balance and step up at a steady pace. Keep your weight over the full foot and avoid leaning heavily on the handles.",
    formCues: ["Keep the posture upright", "Hold the rails lightly", "Push through the whole foot", "Keep the pace steady"],
  },
  jump_rope: {
    instructions: "Hold the handles at hip height and turn the rope with the wrists, not the arms. Jump lightly on the balls of the feet, keeping the knees soft and the rhythm steady.",
    formCues: ["Turn the rope with the wrists", "Jump low on the balls of the feet", "Keep the elbows close to the sides", "Land softly with bent knees"],
  },
};

/** Built-in exercises with their guide text merged in. */
export const SEED_EXERCISES: readonly SeedExercise[] = BASE_EXERCISES.map((x) => ({ ...x, ...GUIDES[x.id] }));

/** Lookup by id. */
export const SEED_EXERCISES_BY_ID: ReadonlyMap<string, SeedExercise> = new Map(SEED_EXERCISES.map((x) => [x.id, x]));
