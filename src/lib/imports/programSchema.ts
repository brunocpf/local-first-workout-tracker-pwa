import { z } from "zod";

/**
 * Public contract for external AI-generated programs (docs/import-schema.md is the spec).
 * Independent of the domain types and the IndexedDB schema.
 *
 * `buildSchema(false)` is the schema used for data and errors (unknown keys are stripped).
 * `buildSchema(true)` is the same schema with strict objects; parseProgram uses it only to
 * report unknown keys as warnings.
 */
const setType = z.enum(["normal", "warmup", "drop", "failure"]);
const exerciseType = z.enum(["weighted_reps", "bodyweight_reps", "duration", "distance"]);
const weekday = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

/** Only http/https: `z.string().url()` alone would accept `javascript:` and `data:`. */
const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

const repRange = z
  .tuple([z.number().int().positive().max(1000), z.number().int().positive().max(1000)])
  .refine(([a, b]) => a <= b, "min must be <= max");

/** Prescription fields shared by the `sets` shorthand and each `setList` entry. */
const setFields = {
  setType: setType.optional(),
  repRange: repRange.optional(),
  targetWeight: z.number().nonnegative().max(1000).optional(), // kg
  targetDurationSeconds: z.number().int().positive().max(86_400).optional(),
  targetDistanceMeters: z.number().positive().max(1_000_000).optional(),
  rpe: z.number().min(1).max(10).optional(),
  rir: z.number().min(0).max(10).optional(),
};
const setFieldNames = Object.keys(setFields);

export function buildSchema(strict: boolean) {
  const object = (strict ? z.strictObject : z.object) as typeof z.object;

  const exerciseRef = object({
    id: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(120).optional(),
    equipment: z.string().min(1).max(60).optional(),
    exerciseType: exerciseType.optional(),
  }).refine((e) => e.id !== undefined || e.name !== undefined, 'exercise needs "id" or "name"');

  const routineExercise = object({
    exercise: exerciseRef,
    supersetGroup: z.string().min(1).max(30).optional(),
    restSeconds: z.number().int().nonnegative().max(3600).optional(),
    notes: z.string().max(1000).optional(),
    sets: z.number().int().positive().max(50).optional(),
    setList: z.array(object(setFields)).min(1).max(50).optional(),
    ...setFields,
  }).superRefine((e, ctx) => {
    if ((e.sets === undefined) === (e.setList === undefined))
      ctx.addIssue({ code: "custom", message: 'provide exactly one of "sets" or "setList"', path: [] });
    if (e.setList !== undefined)
      for (const k of setFieldNames)
        if (e[k as keyof typeof e] !== undefined)
          ctx.addIssue({ code: "custom", message: `"${k}" is not allowed with "setList"; put it on each setList entry`, path: [k] });
  });

  const routine = object({
    id: z.string().min(1).max(60),
    name: z.string().min(1).max(100),
    exercises: z.array(routineExercise).min(1).max(40),
  });

  return object({
    schemaVersion: z.literal(1),
    program: object({
      name: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      goal: z.string().max(100).optional(),
      experienceLevel: z.string().max(50).optional(),
      daysPerWeek: z.number().int().min(1).max(7).optional(),
      schedule: object({
        type: z.literal("weekly"),
        days: z.array(object({ day: weekday, routine: z.string().min(1).max(60) })).min(1).max(14),
      }).optional(),
      routines: z.array(routine).min(1).max(30),
      source: object({
        name: z.string().max(200).optional(),
        url: httpUrl.optional(),
        attribution: z.string().max(500).optional(),
      }).optional(),
    }),
  }).superRefine((v, ctx) => {
    const ids = v.program.routines.map((r) => r.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate routine ids", path: ["program", "routines"] });
    v.program.schedule?.days.forEach((d, i) => {
      if (!ids.includes(d.routine))
        ctx.addIssue({ code: "custom", message: `Unknown routine "${d.routine}"`, path: ["program", "schedule", "days", i, "routine"] });
    });
  });
}

export const programImportV1 = buildSchema(false);
export const programImportV1Strict = buildSchema(true);

export type ProgramImportV1 = z.infer<typeof programImportV1>;
export type ExerciseRefV1 = ProgramImportV1["program"]["routines"][number]["exercises"][number]["exercise"];
