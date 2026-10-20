import { programImportV1, type ProgramImportV1 } from "./programSchema";

export const MAX_IMPORT_BYTES = 1_000_000;

export type ParseResult =
  | { ok: true; data: ProgramImportV1 }
  | { ok: false; errors: string[] };

/** Parse untrusted text. Never evaluates anything; accepts raw JSON only (extraction of fenced blocks is a P1 explicit step). */
export function parseProgramImport(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ["Input too large"] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Malformed JSON"] };
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 1) return { ok: false, errors: [`Unsupported schemaVersion: ${String(version)}`] };
  const r = programImportV1.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}
