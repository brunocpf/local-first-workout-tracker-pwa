import { z } from "zod";

/** Public contract for external AI-generated programs (docs/import-schema.md). Independent of the IndexedDB schema. */
const setType = z.enum(["normal", "warmup", "drop", "failure"]);

const routineExercise = z.object({
  exercise: z.string().min(1).max(120),
  sets: z.number().int().positive().max(50),
  repRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).refine(([a, b]) => a <= b, "min must be <= max").optional(),
  targetWeight: z.number().nonnegative().optional(),
  restSeconds: z.number().int().nonnegative().max(3600).optional(),
  setType: setType.optional(),
  rpe: z.number().min(1).max(10).optional(),
  rir: z.number().min(0).max(10).optional(),
  notes: z.string().max(1000).optional(),
});

const routine = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(100),
  exercises: z.array(routineExercise).min(1).max(40),
});

const weekday = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

export const programImportV1 = z
  .object({
    schemaVersion: z.literal(1),
    program: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      goal: z.string().max(100).optional(),
      experienceLevel: z.string().max(50).optional(),
      daysPerWeek: z.number().int().min(1).max(7).optional(),
      schedule: z.object({ type: z.literal("weekly"), days: z.array(z.object({ day: weekday, routine: z.string() })) }).optional(),
      routines: z.array(routine).min(1).max(30),
      source: z.object({ name: z.string().optional(), url: z.string().url().optional(), attribution: z.string().optional() }).optional(),
    }),
  })
  .superRefine((v, ctx) => {
    const ids = v.program.routines.map((r) => r.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate routine ids", path: ["program", "routines"] });
    for (const d of v.program.schedule?.days ?? [])
      if (!ids.includes(d.routine))
        ctx.addIssue({ code: "custom", message: `Unknown routine "${d.routine}"`, path: ["program", "schedule"] });
  });

export type ProgramImportV1 = z.infer<typeof programImportV1>;
