import { backupV1, BACKUP_VERSION, type BackupV1 } from "#lib/backup/format";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { db as defaultDb, SETTINGS_KEY, type AppDB } from "#lib/storage/db";
import { exerciseIdsOf } from "#lib/storage/sessions";
import type { Exercise } from "#lib/types";

/** Bounds untrusted input before it is parsed. A year of daily sessions is a few MB. */
export const MAX_BACKUP_BYTES = 50_000_000;
const MAX_MESSAGES = 50;

export type ParseBackupResult = { ok: true; backup: BackupV1 } | { ok: false; errors: string[] };

/** Thrown by `restoreBackup` when its input is not a valid backup; nothing was written. */
export class InvalidBackupError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid backup: ${errors.join("; ")}`);
    this.name = "InvalidBackupError";
  }
}

/**
 * Parses untrusted backup text: size limit, JSON, version check, Zod validation, then integrity checks.
 * Never evaluates anything and never touches the database. Errors carry the path of the bad field.
 */
export function parseBackup(text: string): ParseBackupResult {
  // UTF-16 units never exceed UTF-8 bytes, so the cheap check can reject before encoding.
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    return { ok: false, errors: [`File too large (max ${MAX_BACKUP_BYTES / 1_000_000} MB)`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Not a valid JSON file (it may be truncated or not a backup)"] };
  }
  return validateBackup(raw);
}

/** Validates already-parsed data. Returns a fresh plain copy (Zod rebuilds objects and strips unknown keys). */
export function validateBackup(raw: unknown): ParseBackupResult {
  const version = (raw as { backupVersion?: unknown } | null)?.backupVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > BACKUP_VERSION)
    return {
      ok: false,
      errors: [`This backup was made by a newer version of the app (format ${version}). Update the app, then restore again.`],
    };
  // Older formats would be migrated here with pure vN → vN+1 functions (docs/backup-restore.md); v1 is the first.
  if (version !== BACKUP_VERSION)
    return { ok: false, errors: [`Not a workout backup, or unsupported format version: ${String(version)}`] };

  const r = backupV1.safeParse(raw);
  if (!r.success) return { ok: false, errors: cap(r.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`)) };
  const errors = integrityErrors(r.data);
  return errors.length ? { ok: false, errors: cap(errors) } : { ok: true, backup: r.data };
}

const SEED_IDS = new Set(SEED_EXERCISES.map((s) => s.id));

/** Checks the schema cannot express. Each would otherwise fail mid-write or corrupt the catalog. */
function integrityErrors({ data }: BackupV1): string[] {
  const errors: string[] = [];
  const unique = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) errors.push(`data.${name}[${i}].id: duplicate id ${id}`);
      seen.add(id);
    });
  };
  unique("customExercises", data.customExercises.map((e) => e.id));
  unique("builtinExerciseState", data.builtinExerciseState.map((e) => e.id));
  unique("programs", data.programs.map((p) => p.id));
  unique("routines", data.routines.map((r) => r.id));
  unique("sessions", data.sessions.map((s) => s.id));
  data.customExercises.forEach((e, i) => {
    if (!e.isCustom) errors.push(`data.customExercises[${i}].isCustom: must be true`);
    if (SEED_IDS.has(e.id)) errors.push(`data.customExercises[${i}].id: ${e.id} is a built-in exercise id`);
  });
  if (data.sessions.filter((s) => s.status === "active").length > 1)
    errors.push("data.sessions: more than one active session");

  // References the app follows must resolve. Sessions are not checked: they snapshot exercise and
  // routine names, so history stays readable even if the referenced row is gone. A routine's
  // `programId` is not checked either: the app already lists such routines as standalone.
  const exerciseIds = new Set([...SEED_IDS, ...data.customExercises.map((e) => e.id)]);
  data.routines.forEach((r, ri) =>
    r.exercises.forEach((x, xi) => {
      if (!exerciseIds.has(x.exerciseId))
        errors.push(`data.routines[${ri}].exercises[${xi}].exerciseId: unknown exercise ${x.exerciseId}`);
    }),
  );
  const routineIds = new Set(data.routines.map((r) => r.id));
  data.programs.forEach((p, pi) =>
    p.schedule?.days.forEach((d, di) => {
      if (!routineIds.has(d.routineId))
        errors.push(`data.programs[${pi}].schedule.days[${di}].routineId: unknown routine ${d.routineId}`);
    }),
  );
  return errors;
}

export type DataSummary = {
  sessions: number;
  routines: number;
  programs: number;
  customExercises: number;
  /** `startedAt` of the most recent session, if any. */
  latestSessionAt?: string;
};

/** Counts for the restore confirmation ("replaces N sessions…"). */
export function summarizeBackup(backup: BackupV1): DataSummary {
  const { sessions, routines, programs, customExercises } = backup.data;
  let latest: string | undefined;
  for (const s of sessions) if (!latest || Date.parse(s.startedAt) > Date.parse(latest)) latest = s.startedAt;
  return {
    sessions: sessions.length,
    routines: routines.length,
    programs: programs.length,
    customExercises: customExercises.length,
    ...(latest ? { latestSessionAt: latest } : {}),
  };
}

/** The same counts for what is in the database now, i.e. what a restore would replace. */
export async function summarizeCurrentData(database: AppDB = defaultDb): Promise<DataSummary> {
  return database.transaction("r", [database.exercises, database.programs, database.routines, database.sessions], async () => {
    const latest = await database.sessions.orderBy("startedAt").last();
    return {
      sessions: await database.sessions.count(),
      routines: await database.routines.count(),
      programs: await database.programs.count(),
      // Booleans are not valid IndexedDB keys, so `isCustom` cannot be queried through its index.
      customExercises: await database.exercises.filter((e) => e.isCustom).count(),
      ...(latest ? { latestSessionAt: latest.startedAt } : {}),
    };
  });
}

/**
 * Replaces ALL user data with the backup in one `rw` transaction: either everything is written or,
 * on any error, nothing changed. The input is re-validated first (it may not come from `parseBackup`).
 * Built-in exercises are rewritten from the app's catalog with the backup's user state applied, inside
 * the same transaction, so the catalog is never missing (this is the re-seed). Stored built-ins missing
 * from the current catalog are kept, never deleted. State for built-in ids that exist in neither is
 * ignored. Session `exerciseIds` is recomputed.
 * Callers must not hold an in-memory active session across a restore (reload state afterwards).
 */
export async function restoreBackup(backup: BackupV1, database: AppDB = defaultDb): Promise<void> {
  // Plain copy first: `$state` proxies and foreign objects never reach Zod or IndexedDB.
  const checked = validateBackup(JSON.parse(JSON.stringify(backup)));
  if (!checked.ok) throw new InvalidBackupError(checked.errors);
  const { data } = checked.backup;

  const tables = [database.exercises, database.programs, database.routines, database.sessions, database.settings];
  await database.transaction("rw", tables, async () => {
    const previous = new Map((await database.exercises.filter((e) => !e.isCustom).toArray()).map((r) => [r.id, r]));
    const now = new Date().toISOString();
    const state = new Map(data.builtinExerciseState.map((s) => [s.id, s]));
    /** Base built-in row (no user state) with the backup's user state applied. */
    const withState = (base: Exercise, seedAliases: string[]): Exercise => {
      const row: Exercise = JSON.parse(JSON.stringify(base));
      delete row.favorite;
      delete row.archivedAt;
      const user = state.get(row.id);
      row.aliases = [...new Set([...seedAliases, ...(user?.aliases ?? [])])];
      if (user?.favorite !== undefined) row.favorite = user.favorite;
      if (user?.archivedAt !== undefined) row.archivedAt = user.archivedAt;
      row.updatedAt = now;
      return row;
    };
    const builtins: Exercise[] = SEED_EXERCISES.map((s) =>
      withState({ ...s, isCustom: false, createdAt: previous.get(s.id)?.createdAt ?? now, updatedAt: now }, s.aliases),
    );
    // Built-ins this app version no longer ships are kept, like catalog seeding does: retired ids must
    // still resolve. Their seed aliases are unknown, so the stored aliases are kept.
    for (const row of previous.values()) if (!SEED_IDS.has(row.id)) builtins.push(withState(row, row.aliases));

    await Promise.all(tables.map((t) => t.clear()));
    await database.exercises.bulkAdd([...builtins, ...data.customExercises]);
    await database.programs.bulkAdd(data.programs);
    await database.routines.bulkAdd(data.routines);
    await database.sessions.bulkAdd(data.sessions.map((s) => ({ ...s, exerciseIds: exerciseIdsOf(s) })));
    await database.settings.put({ ...data.settings, key: SETTINGS_KEY });
  });
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
