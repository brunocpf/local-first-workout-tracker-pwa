/** The fields search reads. Any `Exercise` satisfies it. */
export type SearchableExercise = { name: string; aliases: string[]; archivedAt?: string };

export type SearchOptions = {
  /** Maximum number of results (default: all). */
  limit?: number;
  /** Archived exercises are hidden unless this is true. */
  includeArchived?: boolean;
};

/**
 * Canonical form for search and import matching: case-, diacritic- and punctuation-insensitive.
 * `Pèc-Déck & Co.` → `pec deck and co`.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // combining marks left by NFKD are the diacritics
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ") // punctuation and hyphens
    .replace(/\s+/g, " ")
    .trim();
}

// Lower rank = better match. `name` is the first entry of `fields`.
const EXACT = 0; // whole name or alias
const NAME_PREFIX = 1; // name starts with the query
const WORD_PREFIX = 2; // every query token starts a word of the name or an alias
const SUBSTRING = 3; // query appears inside the name or an alias

function rankOf(query: string, tokens: string[], name: string, fields: string[]): number | undefined {
  if (fields.includes(query)) return EXACT;
  if (name.startsWith(query)) return NAME_PREFIX;
  const words = fields.flatMap((f) => f.split(" "));
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return WORD_PREFIX;
  if (fields.some((f) => f.includes(query))) return SUBSTRING;
  return undefined;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Offline search over names and aliases. Results are ranked exact > name prefix > word prefix >
 * substring, then by name. An empty query returns everything, sorted by name.
 */
export function searchExercises<T extends SearchableExercise>(
  query: string,
  exercises: readonly T[],
  { limit, includeArchived = false }: SearchOptions = {},
): T[] {
  const q = normalizeName(query);
  const tokens = q === "" ? [] : q.split(" ");
  const hits: { item: T; name: string; rank: number }[] = [];

  for (const item of exercises) {
    if (!includeArchived && item.archivedAt !== undefined) continue;
    const name = normalizeName(item.name);
    if (q === "") {
      hits.push({ item, name, rank: EXACT });
      continue;
    }
    const fields = [name, ...item.aliases.map(normalizeName)];
    const rank = rankOf(q, tokens, name, fields);
    if (rank !== undefined) hits.push({ item, name, rank });
  }

  hits.sort((a, b) => a.rank - b.rank || compareText(a.name, b.name));
  const ranked = limit === undefined ? hits : hits.slice(0, limit);
  return ranked.map((h) => h.item);
}
