// Parsing and display of typed numbers for NumberField (docs/design.md §6.5). Pure; no DOM.

export type NumberMode = "decimal" | "integer";
export type ParseResult = { ok: true; value: number | null } | { ok: false };

const DECIMAL = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;
const INTEGER = /^-?\d+$/;

/** Parses what a user typed. Empty → `null`. `82,5` and `82.5` → 82.5. Surrounding whitespace is ignored; anything else is rejected. */
export function parseNumberInput(raw: string, mode: NumberMode = "decimal"): ParseResult {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!(mode === "integer" ? INTEGER : DECIMAL).test(text)) return { ok: false };
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/** Display string for a stored value, using the user's decimal separator and no grouping. */
export function formatNumber(value: number | null, locale?: string): string {
  if (value === null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(value);
}
