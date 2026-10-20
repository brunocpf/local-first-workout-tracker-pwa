import { programImportV1, programImportV1Strict, type ExerciseRefV1, type ProgramImportV1 } from "./programSchema";

export const MAX_IMPORT_BYTES = 1_000_000;
/** Plausibility warning threshold: working (non-warm-up) sets in one routine. */
export const MAX_WORKING_SETS_PER_ROUTINE = 30;
const MAX_MESSAGES = 50;

export type ParseResult =
  | { ok: true; data: ProgramImportV1; warnings: string[] }
  | { ok: false; errors: string[]; warnings?: string[] };

/** Parse untrusted text. Never evaluates anything; accepts raw JSON only (extraction of fenced blocks is a P1 explicit step). */
export function parseProgramImport(text: string): ParseResult {
  // UTF-16 units never exceed UTF-8 bytes, so the cheap check can reject before encoding.
  if (text.length > MAX_IMPORT_BYTES || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES)
    return { ok: false, errors: [`Input too large (max ${MAX_IMPORT_BYTES} bytes)`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Malformed JSON"] };
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 1) return { ok: false, errors: [`Unsupported schemaVersion: ${String(version)}`] };

  // Unknown keys are stripped from `data`; the strict schema is run only to report them.
  const warnings = unsupportedFieldWarnings(raw);
  const r = programImportV1.safeParse(raw);
  if (!r.success)
    return { ok: false, errors: cap(r.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`)), warnings: cap(warnings) };
  return { ok: true, data: r.data, warnings: cap([...warnings, ...plausibilityWarnings(r.data)]) };
}

/** Exercise references without a catalog id: the preview must resolve them (match, custom exercise, or drop). */
export function unresolvedExercises(data: ProgramImportV1): { path: string; ref: ExerciseRefV1 }[] {
  return data.program.routines.flatMap((r, ri) =>
    r.exercises.flatMap((e, ei) =>
      e.exercise.id === undefined ? [{ path: `program.routines[${ri}].exercises[${ei}].exercise`, ref: e.exercise }] : [],
    ),
  );
}

function unsupportedFieldWarnings(raw: unknown): string[] {
  const r = programImportV1Strict.safeParse(raw);
  if (r.success) return [];
  return r.error.issues.flatMap((i) =>
    i.code === "unrecognized_keys" ? i.keys.map((k) => `${formatPath([...i.path, k])}: unsupported field, ignored`) : [],
  );
}

function plausibilityWarnings(data: ProgramImportV1): string[] {
  const out: string[] = [];
  const { schedule, daysPerWeek, routines } = data.program;

  if (schedule) {
    const days = schedule.days.map((d) => d.day);
    const unique = new Set(days);
    for (const d of unique)
      if (days.filter((x) => x === d).length > 1) out.push(`program.schedule: ${d} is scheduled more than once`);
    if (daysPerWeek !== undefined && daysPerWeek !== unique.size)
      out.push(`program.daysPerWeek: is ${daysPerWeek} but schedule has ${unique.size} distinct day(s)`);
  }

  routines.forEach((r, ri) => {
    const base = `program.routines[${ri}]`;
    const workingSets = r.exercises.reduce((n, e) => {
      if (e.setList) return n + e.setList.filter((s) => (s.setType ?? "normal") !== "warmup").length;
      return n + (e.setType === "warmup" ? 0 : (e.sets ?? 0));
    }, 0);
    if (workingSets > MAX_WORKING_SETS_PER_ROUTINE)
      out.push(`${base}: ${workingSets} working sets is unusually high (over ${MAX_WORKING_SETS_PER_ROUTINE})`);

    // A superset group must be one contiguous run of exercises.
    const seen = new Set<string>();
    let prev: string | undefined;
    r.exercises.forEach((e, ei) => {
      const g = e.supersetGroup;
      if (g !== undefined && g !== prev && seen.has(g))
        out.push(`${base}.exercises[${ei}].supersetGroup: "${g}" members are not adjacent`);
      if (g !== undefined) seen.add(g);
      prev = g;
    });
  });
  return out;
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join("");
}

function cap(messages: string[]): string[] {
  return messages.length <= MAX_MESSAGES
    ? messages
    : [...messages.slice(0, MAX_MESSAGES), `…and ${messages.length - MAX_MESSAGES} more`];
}
