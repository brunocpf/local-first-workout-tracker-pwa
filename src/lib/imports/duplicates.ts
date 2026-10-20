import { normalizeName } from "#lib/catalog/search";

/**
 * The fields duplicate detection reads. A stored `WorkoutSession` and an unsaved import draft both
 * satisfy it, so the same check serves the Hevy import (T5.05) and the CSV import (T8.05).
 */
export type WorkoutIdentity = { startedAt: string; name: string };

export type DuplicateMatch =
  | { status: "new" }
  /** Same start minute and normalized name as a stored session (`stored`) or an earlier workout in the file (`file`). */
  | { status: "duplicate"; source: "stored" | "file"; index: number }
  /** A stored session starts within ±`POSSIBLE_DUPLICATE_MINUTES` but is not the same workout; `index` is the nearest. */
  | { status: "possible"; index: number };

/** Hevy has no seconds, so instants are compared by whole minute. */
const MINUTE_MS = 60_000;
export const POSSIBLE_DUPLICATE_MINUTES = 10;

type Identity = { minute: number; name: string };

function identityOf(w: WorkoutIdentity): Identity | undefined {
  const ms = Date.parse(w.startedAt);
  if (Number.isNaN(ms)) return undefined;
  return { minute: Math.floor(ms / MINUTE_MS), name: normalizeName(w.name) };
}

/**
 * Classify each draft against stored sessions and against earlier drafts in the same file.
 * Result `i` describes `drafts[i]`. Drafts with an unparseable `startedAt` are reported as `new`
 * and left to the importer's own validation. Existing sessions are only read, never modified.
 *
 * Rule (docs/hevy-import.md §10): exact duplicate = equal start minute and equal normalized name.
 * Stored sessions that start within ±10 minutes otherwise are "possible" duplicates. Possible
 * duplicates are checked against stored sessions only.
 */
export function findDuplicates(drafts: readonly WorkoutIdentity[], existing: readonly WorkoutIdentity[]): DuplicateMatch[] {
  const stored = existing.map(identityOf);
  const storedByKey = new Map<string, number>();
  stored.forEach((s, index) => {
    if (s !== undefined && !storedByKey.has(keyOf(s))) storedByKey.set(keyOf(s), index);
  });

  const fileFirst = new Map<string, number>();
  return drafts.map((draft, i): DuplicateMatch => {
    const id = identityOf(draft);
    if (id === undefined) return { status: "new" };

    const key = keyOf(id);
    const storedIndex = storedByKey.get(key);
    if (storedIndex !== undefined) return { status: "duplicate", source: "stored", index: storedIndex };

    const fileIndex = fileFirst.get(key);
    if (fileIndex !== undefined) return { status: "duplicate", source: "file", index: fileIndex };
    fileFirst.set(key, i);

    let nearest = -1;
    let nearestDelta = Infinity;
    stored.forEach((s, index) => {
      if (s === undefined) return;
      const delta = Math.abs(s.minute - id.minute);
      if (delta <= POSSIBLE_DUPLICATE_MINUTES && delta < nearestDelta) {
        nearest = index;
        nearestDelta = delta;
      }
    });
    return nearest === -1 ? { status: "new" } : { status: "possible", index: nearest };
  });
}

const keyOf = (id: Identity): string => `${id.minute}|${id.name}`;
