/**
 * Explicit extraction of JSON from pasted assistant replies (PRD §11.2). Only two shapes are candidates:
 * the whole text when it starts with `{`, or the body of a ```json / ``` fenced block. Prose is never
 * scanned for braces. Nothing is evaluated; callers validate each candidate with `parseProgramImport`.
 */

// A fence line is ``` with an optional `json` tag; the body ends at the next line that starts with ```.
const FENCED_BLOCK = /^```[ \t]*(?:json)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

export function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return [trimmed];
  return [...text.matchAll(FENCED_BLOCK)].map((m) => m[1].trim()).filter((block) => block !== "");
}

export function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
