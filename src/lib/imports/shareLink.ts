import { MAX_IMPORT_BYTES, parseProgramImport, type ParseResult } from "./parseProgram";
import type { ProgramImportV1 } from "./programSchema";
import type { Exercise, PrescribedSet, Program, Routine } from "#lib/types";

// Shareable program links (PRD P2): the program is exported as import schema v1 JSON, deflated and put in the URL
// fragment (`#p=…`), which browsers never send to a server. Opening the link only prefills the import preview.

/** Messaging apps tend to truncate or break links beyond roughly this many characters. */
export const SHARE_URL_WARN_LENGTH = 2000;
/** Upper bound for the encoded fragment payload; bigger input is rejected before any decompression. */
export const MAX_FRAGMENT_CHARS = 500_000;

const FRAGMENT_KEY = "p";
const FRAGMENT = new RegExp(`^#${FRAGMENT_KEY}=([A-Za-z0-9_-]+)$`);

export class ShareLinkError extends Error {}

type ExerciseInfo = Pick<Exercise, "name" | "isCustom" | "exerciseType" | "equipment">;
type RefType = NonNullable<ProgramImportV1["program"]["routines"][number]["exercises"][number]["exercise"]["exerciseType"]>;
const REF_TYPES: readonly string[] = ["weighted_reps", "bodyweight_reps", "duration", "distance"] satisfies RefType[];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type SetFields = NonNullable<ProgramImportV1["program"]["routines"][number]["exercises"][number]["setList"]>[number];

function setFields(s: PrescribedSet): SetFields {
  return {
    setType: s.type,
    ...(s.repRange ? { repRange: [s.repRange[0], s.repRange[1]] as [number, number] } : {}),
    ...(s.targetWeight !== undefined ? { targetWeight: s.targetWeight } : {}),
    ...(s.targetDurationSeconds !== undefined ? { targetDurationSeconds: s.targetDurationSeconds } : {}),
    ...(s.targetDistance !== undefined ? { targetDistanceMeters: s.targetDistance } : {}),
    ...(s.targetRpe !== undefined ? { rpe: s.targetRpe } : {}),
    ...(s.targetRir !== undefined ? { rir: s.targetRir } : {}),
  };
}

/** Identical sets use the `sets: N` shorthand (shorter links, nicer preview); anything else an explicit `setList`. */
function prescription(sets: PrescribedSet[]): SetFields & { sets?: number; setList?: SetFields[] } {
  const fields = sets.map(setFields);
  const first = JSON.stringify(fields[0]);
  if (fields.every((f) => JSON.stringify(f) === first)) return { ...fields[0], sets: sets.length };
  return { setList: fields };
}

/**
 * Builds the schema v1 document for a program (or, without `program`, for standalone routines).
 * Routines or exercises with nothing to prescribe are left out, since the schema requires at least one set.
 * Throws `ShareLinkError` when nothing shareable remains.
 */
export function buildShareData(
  routines: Routine[],
  exercises: ReadonlyMap<string, ExerciseInfo>,
  program?: Pick<Program, "name" | "description" | "goal" | "experienceLevel" | "daysPerWeek" | "schedule" | "source">,
): ProgramImportV1 {
  const fileIds = new Map<string, string>();
  const out: ProgramImportV1["program"]["routines"] = [];
  for (const r of routines) {
    const list: ProgramImportV1["program"]["routines"][number]["exercises"] = [];
    const groups = new Map<string, string>();
    for (const e of r.exercises) {
      if (e.prescribedSets.length === 0) continue;
      const info = exercises.get(e.exerciseId);
      const exercise: ProgramImportV1["program"]["routines"][number]["exercises"][number]["exercise"] = info
        ? info.isCustom
          ? {
              name: info.name.slice(0, 120),
              ...(info.equipment[0] ? { equipment: info.equipment[0].slice(0, 60) } : {}),
              ...(REF_TYPES.includes(info.exerciseType) ? { exerciseType: info.exerciseType as RefType } : {}),
            }
          : { id: e.exerciseId, name: info.name.slice(0, 120) }
        : { id: e.exerciseId };
      let supersetGroup: string | undefined;
      if (e.supersetGroupId !== undefined) {
        if (!groups.has(e.supersetGroupId)) groups.set(e.supersetGroupId, `G${groups.size + 1}`);
        supersetGroup = groups.get(e.supersetGroupId);
      }
      list.push({
        exercise,
        ...(supersetGroup ? { supersetGroup } : {}),
        ...(e.restSeconds !== undefined ? { restSeconds: e.restSeconds } : {}),
        ...(e.notes ? { notes: e.notes } : {}),
        ...prescription(e.prescribedSets.slice(0, 50)),
      });
    }
    if (list.length === 0) continue;
    const id = `r${out.length + 1}`;
    fileIds.set(r.id, id);
    out.push({ id, name: r.name, exercises: list.slice(0, 40) });
  }
  if (out.length === 0) throw new ShareLinkError("Nothing to share: add exercises with sets first.");

  const days = (program?.schedule?.days ?? []).flatMap((d) => {
    const routine = fileIds.get(d.routineId);
    const day = WEEKDAYS.find((w) => w === d.day);
    return routine && day ? [{ day, routine }] : [];
  });
  const data: ProgramImportV1 = {
    schemaVersion: 1,
    program: {
      name: (program?.name ?? (out.length === 1 ? out[0].name : "Shared routines")).slice(0, 100),
      ...(program?.description ? { description: program.description } : {}),
      ...(program?.goal ? { goal: program.goal } : {}),
      ...(program?.experienceLevel ? { experienceLevel: program.experienceLevel } : {}),
      ...(program?.daysPerWeek !== undefined && days.length > 0 ? { daysPerWeek: program.daysPerWeek } : {}),
      ...(days.length > 0 ? { schedule: { type: "weekly" as const, days: days.slice(0, 14) } } : {}),
      routines: out.slice(0, 30),
      ...(program?.source ? { source: program.source } : {}),
    },
  };
  // Never hand out a link that our own importer would reject.
  const check = parseProgramImport(JSON.stringify(data));
  if (!check.ok) throw new ShareLinkError(`This plan can't be shared: ${check.errors[0]}`);
  return data;
}

// --- Encoding -------------------------------------------------------------------------------------------------------

export function isShareLinkSupported(): boolean {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ShareLinkError("This link's content is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, maxBytes: number) {
  // The write side is not awaited: reading drives the stream, and a failing write surfaces on the read.
  const writer = transform.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => {});
  return readAll(transform.readable, maxBytes);
}

/** Text → deflate-raw → base64url. */
export async function encodePayload(json: string): Promise<string> {
  if (!isShareLinkSupported()) throw new ShareLinkError("This browser can't create share links.");
  const input = new TextEncoder().encode(json);
  if (input.byteLength > MAX_IMPORT_BYTES) throw new ShareLinkError("This plan is too large to share.");
  return toBase64Url(await pipe(input, new CompressionStream("deflate-raw"), MAX_IMPORT_BYTES));
}

/** Inverse of `encodePayload`. Throws `ShareLinkError` for corrupt or oversize input; output is capped while inflating. */
export async function decodePayload(payload: string): Promise<string> {
  if (!isShareLinkSupported()) throw new ShareLinkError("This browser can't open share links.");
  if (payload.length > MAX_FRAGMENT_CHARS) throw new ShareLinkError("This link is too large to import.");
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(payload);
  } catch {
    throw new ShareLinkError("This link is damaged or incomplete.");
  }
  let inflated: Uint8Array;
  try {
    inflated = await pipe(bytes, new DecompressionStream("deflate-raw"), MAX_IMPORT_BYTES);
  } catch (err) {
    if (err instanceof ShareLinkError) throw err;
    throw new ShareLinkError("This link is damaged or incomplete.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(inflated);
  } catch {
    throw new ShareLinkError("This link is damaged or incomplete.");
  }
}

// --- URLs -----------------------------------------------------------------------------------------------------------

/** `importUrl` is the absolute URL of the import page (without fragment). */
export async function buildShareUrl(data: ProgramImportV1, importUrl: string): Promise<{ url: string; tooLong: boolean }> {
  const payload = await encodePayload(JSON.stringify(data));
  const url = `${importUrl}#${FRAGMENT_KEY}=${payload}`;
  return { url, tooLong: url.length > SHARE_URL_WARN_LENGTH };
}

/** The payload of a `#p=…` fragment, or `undefined` when the hash is not a share link. */
export function payloadFromHash(hash: string): string | undefined {
  return FRAGMENT.exec(hash)?.[1];
}

/** Hash that looks like a share link attempt (`#p=` with anything after it), even if malformed. */
export function isShareHash(hash: string): boolean {
  return hash.startsWith(`#${FRAGMENT_KEY}=`);
}

/** Decodes and validates a share fragment with the normal import rules. Nothing is saved here. */
export async function parseShareHash(hash: string): Promise<ParseResult> {
  const payload = payloadFromHash(hash);
  if (!payload) return { ok: false, errors: ["This link is damaged or incomplete."] };
  try {
    return parseProgramImport(await decodePayload(payload));
  } catch (err) {
    return { ok: false, errors: [err instanceof ShareLinkError ? err.message : "This link is damaged or incomplete."] };
  }
}
