<script lang="ts">
    import { MAX_BACKUP_BYTES, parseBackup, restoreBackup, summarizeBackup, summarizeCurrentData, type DataSummary } from "#lib/backup/restore";
  import { exportAndRecord } from "#lib/backup/run";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import { buildHistoryCsv, csvBlob, csvFileName } from "#lib/exports/csv";
  import { readTextFile, saveFile } from "#lib/files";
  import { active } from "#lib/logger/activeSession.svelte";
  import { initSettings, settings, updateSettings } from "#lib/settings.svelte";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";

  const number = new Intl.NumberFormat();
  const size = (bytes: number) =>
    bytes < 1_000_000
      ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1000)))} KB`
      : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Unknown error");

  let exporting = $state(false);
  let restoring = $state(false);
  let exportError = $state("");
  let exportNote = $state("");
  let restoreErrors = $state<string[]>([]);
  let restoreFailure = $state("");
  let fileInput = $state<HTMLInputElement>();

  /** Runs the export and reports the outcome. */
  async function exportBackup(): Promise<boolean> {
    exportError = "";
    exportNote = "";
    exporting = true;
    try {
      const r = await exportAndRecord();
      if (r.status === "cancelled") return false;
      exportNote = `${r.status === "shared" ? "Shared" : "Saved"} ${r.name} · ${size(r.bytes)} · ${day(r.at)}`;
      toast(`Backup saved · ${size(r.bytes)}`);
      return true;
    } catch (e) {
      exportError = `Backup failed: ${message(e)}`;
      return false;
    } finally {
      exporting = false;
    }
  }

  let exportingCsv = $state(false);
  let csvError = $state("");

  async function exportCsv() {
    csvError = "";
    exportingCsv = true;
    try {
      const blob = csvBlob(await buildHistoryCsv());
      const result = await saveFile(blob, csvFileName());
      if (result !== "cancelled") toast(`History saved · ${size(blob.size)}`);
    } catch (e) {
      csvError = `CSV export failed: ${message(e)}`;
    } finally {
      exportingCsv = false;
    }
  }

  function describe(s: DataSummary) {
    const latest = s.latestSessionAt ? `latest workout ${day(s.latestSessionAt)}` : "no workouts";
    return `${number.format(s.sessions)} workouts, ${number.format(s.routines)} routines, ${number.format(s.programs)} programs, ${number.format(s.customExercises)} custom exercises; ${latest}`;
  }

  async function onfile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    restoreErrors = [];
    restoreFailure = "";
    restoring = true;
    try {
      // A saved-but-not-yet-loaded active session must count, so load it before checking.
      await active.load();
      if (active.isActive) {
        restoreFailure = "A workout is in progress. Finish or discard it before restoring a backup.";
        return;
      }
      const read = await readTextFile(file, MAX_BACKUP_BYTES);
      if (!read.ok) {
        restoreErrors = [`File too large (max ${MAX_BACKUP_BYTES / 1_000_000} MB)`];
        return;
      }
      const parsed = parseBackup(read.text);
      if (!parsed.ok) {
        restoreErrors = parsed.errors;
        return;
      }
      const incoming = summarizeBackup(parsed.backup);
      const current = await summarizeCurrentData();
      const ok = await confirm({
        title: "Replace all data?",
        body: `This replaces everything on this device with the backup. It can't be undone.\n\nOn this device now: ${describe(current)}.\n\nIn ${file.name}: ${describe(incoming)}.`,
        confirmLabel: "Replace all data",
        danger: true,
        secondaryAction: { label: "Export a backup first", run: () => void exportBackup() },
      });
      if (!ok) return;
      // A workout could have been started while the dialog was open.
      if (active.isActive) {
        restoreFailure = "A workout is in progress. Finish or discard it before restoring a backup.";
        return;
      }
      await restoreBackup(parsed.backup);
      await initSettings();
      await active.load();
      toast("Backup restored");
    } catch (err) {
      restoreFailure = `Restore failed: ${message(err)}. Your existing data was not changed.`;
    } finally {
      restoring = false;
    }
  }
</script>

<div class="stack">
  <p class="muted">
    Browsers can delete app data. Keep a backup file somewhere safe.
    {#if settings.lastBackupAt}Last backup: {day(settings.lastBackupAt)}.{:else}You haven't backed up yet.{/if}
  </p>
  <Button onclick={exportBackup} loading={exporting} icon="export">Export backup</Button>
  {#if exportNote}<p class="note" role="status" data-testid="export-note">{exportNote}</p>{/if}
  {#if exportError}<Banner variant="danger" urgent>{exportError}</Banner>{/if}
  <Button onclick={exportCsv} loading={exportingCsv} icon="export">Export history (CSV)</Button>
  <p class="muted">A spreadsheet of every logged set. It is not a backup and can't be restored.</p>
  {#if csvError}<Banner variant="danger" urgent>{csvError}</Banner>{/if}

  <NumberField
    label="Remind after (days)"
    mode="integer"
    suffix="days"
    min={0}
    max={365}
    hint="0 turns this reminder off."
    value={settings.backupReminderDays ?? 14}
    onchange={(n) => n !== null && updateSettings({ backupReminderDays: n })}
  />
  <NumberField
    label="Remind after (workouts)"
    mode="integer"
    suffix="workouts"
    min={0}
    max={1000}
    hint="0 turns this reminder off."
    value={settings.backupReminderSessions ?? 10}
    onchange={(n) => n !== null && updateSettings({ backupReminderSessions: n })}
  />

  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onfile} data-testid="restore-input" />
  <Button onclick={() => fileInput?.click()} loading={restoring} disabled={active.isActive}>Restore from backup…</Button>
  {#if active.isActive}
    <p class="muted">Finish or discard your current workout before restoring.</p>
  {/if}
  {#if restoreFailure}<Banner variant="danger" urgent>{restoreFailure}</Banner>{/if}
  {#if restoreErrors.length}
    <Banner variant="danger" urgent title="This file can't be restored. Nothing was changed.">
      <ul>
        {#each restoreErrors as err (err)}<li>{err}</li>{/each}
      </ul>
    </Banner>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: var(--space-3);
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--color-text-muted);
  }
  .note {
    color: var(--color-success-text);
  }
  ul {
    margin: 0;
    padding-inline-start: var(--space-4);
  }
</style>
