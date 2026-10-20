// File hand-off helpers (PRD §2.2/§13, docs/browser-limitations.md). Never uses the File System Access API.

export type SaveResult = "shared" | "downloaded" | "cancelled";

/** How long the object URL stays alive after the download click. Safari may ignore a revoke that is too early. */
export const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

export type SaveEnv = {
  navigator?: Partial<Navigator>;
  matchMedia?: (query: string) => { matches: boolean };
  document?: Document;
  URL?: typeof URL;
  setTimeout?: (fn: () => void, ms: number) => unknown;
};

const defaultEnv = (): SaveEnv => globalThis as unknown as SaveEnv;

function isCoarsePointer(env: SaveEnv): boolean {
  try {
    return env.matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    // matchMedia can throw in odd embedded webviews; treat as not touch.
    return false;
  }
}

function canShareFile(nav: Partial<Navigator> | undefined, file: File): boolean {
  try {
    return typeof nav?.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] });
  } catch {
    // canShare throws on some engines for unsupported payloads.
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string, env: SaveEnv): void {
  const urlApi = env.URL ?? URL;
  const doc = env.document ?? document;
  const url = urlApi.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  const later = env.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  later(() => urlApi.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}

/**
 * Hands a generated file to the user. On touch devices that support sharing files, opens the share sheet
 * (→ Files, iCloud Drive, Drive, …); otherwise downloads through an anchor with an object URL.
 * A dismissed share sheet is `'cancelled'`; any other share failure falls back to a download.
 */
export async function saveFile(
  blob: Blob,
  fileName: string,
  env: SaveEnv = defaultEnv(),
): Promise<SaveResult> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = env.navigator;
  if (isCoarsePointer(env) && canShareFile(nav, file)) {
    try {
      await nav?.share?.({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Share failed for another reason (e.g. no target app); the download below still gets the file to the user.
    }
  }
  downloadBlob(blob, fileName, env);
  return "downloaded";
}

export type ReadTextResult = { ok: true; text: string } | { ok: false; reason: "too-large"; size: number; maxBytes: number };

/** Reads a user-picked text file, rejecting it by size before any bytes are read. */
export async function readTextFile(file: Blob, maxBytes: number): Promise<ReadTextResult> {
  if (file.size > maxBytes) return { ok: false, reason: "too-large", size: file.size, maxBytes };
  return { ok: true, text: await file.text() };
}
