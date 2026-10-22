<script lang="ts">
  import { formatLocaleNumber } from "#lib/format";
  import { intlLocale } from "#lib/i18n.svelte";
  import { t, tn } from "#lib/i18n.svelte";
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

  const size = (bytes: number) =>
    bytes < 1_000_000
      ? `${formatLocaleNumber(Math.max(1, Math.round(bytes / 1000)), { maximumFractionDigits: 0 })} KB`
      : `${formatLocaleNumber(bytes / 1_000_000, { maximumFractionDigits: 1 })} MB`;
  const day = (iso: string) => new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "short", year: "numeric" });
  const message = (e: unknown) => (e instanceof Error && e.message ? e.message : t("bk.unknownError"));

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
      exportNote = t(r.status === "shared" ? "bk.shared" : "bk.saved", { name: r.name, size: size(r.bytes), date: day(r.at) });
      toast(t("bk.savedToast", { size: size(r.bytes) }));
      return true;
    } catch (e) {
      exportError = t("bk.failed", { error: message(e) });
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
      if (result !== "cancelled") toast(t("bk.csvSaved", { size: size(blob.size) }));
    } catch (e) {
      csvError = t("bk.csvFailed", { error: message(e) });
    } finally {
      exportingCsv = false;
    }
  }

  function describe(s: DataSummary) {
    const latest = s.latestSessionAt ? t("bk.latestWorkout", { date: day(s.latestSessionAt) }) : t("bk.noWorkouts");
    return t("bk.summary", {
      workouts: tn("count.workouts", s.sessions),
      routines: tn("count.routines", s.routines),
      programs: tn("bk.programs", s.programs),
      custom: tn("bk.custom", s.customExercises),
      measurements: tn("bk.measurements", s.measurements),
      latest,
    });
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
        restoreFailure = t("bk.inProgress");
        return;
      }
      const read = await readTextFile(file, MAX_BACKUP_BYTES);
      if (!read.ok) {
        restoreErrors = [t("bk.tooLarge", { mb: MAX_BACKUP_BYTES / 1_000_000 })];
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
        title: t("bk.replaceTitle"),
        body: t("bk.replaceBody", { current: describe(current), file: file.name, incoming: describe(incoming) }),
        confirmLabel: t("bk.replaceConfirm"),
        danger: true,
        secondaryAction: { label: t("bk.exportFirst"), run: () => void exportBackup() },
      });
      if (!ok) return;
      // A workout could have been started while the dialog was open.
      if (active.isActive) {
        restoreFailure = t("bk.inProgress");
        return;
      }
      await restoreBackup(parsed.backup);
      await initSettings();
      await active.load();
      toast(t("bk.restored"));
    } catch (err) {
      restoreFailure = t("bk.restoreFailed", { error: message(err) });
    } finally {
      restoring = false;
    }
  }
</script>

<div class="stack">
  <p class="muted">
    {t("bk.intro")}
    {#if settings.lastBackupAt}{t("bk.last", { date: day(settings.lastBackupAt) })}{:else}{t("bk.never")}{/if}
  </p>
  <Button onclick={exportBackup} loading={exporting} icon="export">{t("bk.export")}</Button>
  {#if exportNote}<p class="note" role="status" data-testid="export-note">{exportNote}</p>{/if}
  {#if exportError}<Banner variant="danger" urgent>{exportError}</Banner>{/if}
  <Button onclick={exportCsv} loading={exportingCsv} icon="export">{t("bk.csv")}</Button>
  <p class="muted">{t("bk.csvNote")}</p>
  {#if csvError}<Banner variant="danger" urgent>{csvError}</Banner>{/if}

  <NumberField
    label={t("bk.remindDays")}
    mode="integer"
    suffix={t("bk.days")}
    min={0}
    max={365}
    hint={t("bk.remindOff")}
    value={settings.backupReminderDays ?? 14}
    onchange={(n) => n !== null && updateSettings({ backupReminderDays: n })}
  />
  <NumberField
    label={t("bk.remindSessions")}
    mode="integer"
    suffix={t("bk.workouts")}
    min={0}
    max={1000}
    hint={t("bk.remindOff")}
    value={settings.backupReminderSessions ?? 10}
    onchange={(n) => n !== null && updateSettings({ backupReminderSessions: n })}
  />

  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onfile} data-testid="restore-input" />
  <Button onclick={() => fileInput?.click()} loading={restoring} disabled={active.isActive}>{t("bk.restore")}</Button>
  {#if active.isActive}
    <p class="muted">{t("bk.restoreBlocked")}</p>
  {/if}
  {#if restoreFailure}<Banner variant="danger" urgent>{restoreFailure}</Banner>{/if}
  {#if restoreErrors.length}
    <Banner variant="danger" urgent title={t("bk.badFile")}>
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
