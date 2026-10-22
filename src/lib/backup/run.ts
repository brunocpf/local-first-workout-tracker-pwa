import { backupFileName, buildBackup, serializeBackup } from "#lib/backup/export";
import { saveFile } from "#lib/files";
import { settings } from "#lib/settings.svelte";
import { saveSettings } from "#lib/storage/settings";

export type ExportOutcome = { status: "cancelled" } | { status: "downloaded" | "shared"; name: string; bytes: number; at: string };

/** Builds and hands off a backup. Records `lastBackupAt` only when the file was actually saved or shared. Throws on failure. */
export async function exportAndRecord(): Promise<ExportOutcome> {
  const now = new Date();
  const blob = serializeBackup(await buildBackup({ now }));
  const name = backupFileName(now);
  const result = await saveFile(blob, name);
  if (result === "cancelled") return { status: "cancelled" };
  const at = now.toISOString();
  try {
    settings.lastBackupAt = at;
    await saveSettings({ lastBackupAt: at });
  } catch {
    // The file is saved; only the "last backup" note is lost.
  }
  return { status: result, name, bytes: blob.size, at };
}
