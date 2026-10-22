<script lang="ts">
  import { intlLocale } from "#lib/i18n.svelte";
  import { t, tn } from "#lib/i18n.svelte";
  // Hevy history import (PRD §12.1, docs/hevy-import.md): file + time zone → summary → exercise mapping → duplicates → confirm.
  // Nothing is written until the final confirm; the write is one all-or-nothing transaction (commitHevyImport).
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import ExerciseMappingTable from "#lib/components/import/ExerciseMappingTable.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import { readTextFile } from "#lib/files";
  import { findDuplicates, type DuplicateMatch } from "#lib/imports/duplicates";
  import { normalizeHevyRows, type HevyNormalizeResult } from "#lib/imports/hevy/normalize";
  import { MAX_HEVY_BYTES, parseHevyCsv, type HevyParseResult } from "#lib/imports/hevy/parse";
  import { buildHevyPlan, includeByDefault, initialChoices, type HevyChoice, type HevyChoiceSource } from "#lib/imports/hevy/plan";
  import type { HevyNameResolution } from "#lib/imports/hevy/exerciseMap";
  import { settings } from "#lib/settings.svelte";
  import { listExercises } from "#lib/storage/exercises";
  import { commitHevyImport, listSessionIdentitiesAround } from "#lib/storage/hevyImport";
  import { currentTimeZone } from "#lib/time";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Exercise } from "#lib/types";

  type Step = "file" | "summary" | "exercises" | "review" | "done";
  const STEPS: { id: Exclude<Step, "done"> }[] = [{ id: "file" }, { id: "summary" }, { id: "exercises" }, { id: "review" }];
  const SHOWN = 10;

  let step = $state<Step>("file");
  let fileName = $state("");
  let reading = $state(false);
  let fileErrors = $state<string[]>([]);
  let parsed = $state.raw<Extract<HevyParseResult, { ok: true }>>();
  let timeZone = $state(currentTimeZone());
  let analyzing = $state(false);
  let analysisError = $state("");

  let normalized = $state.raw<HevyNormalizeResult>();
  let catalog = $state.raw<Exercise[]>([]);
  let resolutions = $state.raw<Record<string, HevyNameResolution>>({});
  let sources = $state.raw<Record<string, HevyChoiceSource>>({});
  let choices = $state<Record<string, HevyChoice | undefined>>({});
  let duplicates = $state.raw<DuplicateMatch[]>([]);
  let include = $state<Record<string, boolean | undefined>>({});
  // Plain bookkeeping (not rendered): ids reserved for exercises that may be created, so they stay stable between recomputations.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const createdIds = new Map<string, string>();

  let committing = $state(false);
  let commitError = $state("");
  let importedCount = $state(0);

  let fileInput = $state<HTMLInputElement>();

  const zones = $derived.by(() => {
    const names = [...(globalThis.Intl?.supportedValuesOf?.("timeZone") ?? []), currentTimeZone(), timeZone];
    return names.filter((z, i) => names.indexOf(z) === i).sort().map((z) => ({ value: z, label: z }));
  });
  const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

  const plan = $derived(
    normalized
      ? buildHevyPlan({ drafts: normalized.drafts, exercises: normalized.exercises, choices, catalog, duplicates, include, createdIds })
      : undefined,
  );
  const flagged = $derived(
    (normalized?.drafts ?? []).flatMap((d, i) => (duplicates[i] && duplicates[i].status !== "new" ? [{ draft: d, match: duplicates[i] }] : [])),
  );
  const newCount = $derived((normalized?.drafts.length ?? 0) - flagged.length);

  const formatIn = (iso: string, zone: string) =>
    new Intl.DateTimeFormat(intlLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(iso));

  async function onfile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    fileName = file.name;
    fileErrors = [];
    parsed = undefined;
    reading = true;
    try {
      const read = await readTextFile(file, MAX_HEVY_BYTES);
      if (!read.ok) return void (fileErrors = [t("hv.tooBig")]);
      const result = parseHevyCsv(read.text);
      if (result.ok) parsed = result;
      else fileErrors = result.errors.map((e) => e.message);
    } catch {
      fileErrors = [t("hv.readFailed")];
    } finally {
      reading = false;
    }
  }

  /** Normalize with the chosen zone, load the catalog and stored sessions, classify duplicates. Writes nothing. */
  async function analyze() {
    if (!parsed) return;
    analyzing = true;
    analysisError = "";
    try {
      const result = normalizeHevyRows(parsed.rows, { timeZone, unsupportedColumns: parsed.unsupportedColumnsWithData });
      const exercises = await listExercises();
      const initial = initialChoices(result.exercises, exercises, settings.hevyExerciseMap);
      let existing: { startedAt: string; name: string }[] = [];
      if (result.drafts.length > 0)
        existing = await listSessionIdentitiesAround(result.drafts[0].startedAt, result.drafts[result.drafts.length - 1].startedAt);

      // Keep decisions made for a previous zone/file where the title is still there.
      const kept: Record<string, HevyChoice | undefined> = {};
      for (const e of result.exercises) kept[e.title] = choices[e.title] ?? initial.choices[e.title];
      for (const [title, c] of Object.entries(kept)) if (c?.kind === "exercise" && !exercises.some((x) => x.id === c.exerciseId)) kept[title] = undefined;

      normalized = result;
      catalog = exercises;
      resolutions = initial.resolutions;
      sources = initial.sources;
      choices = kept;
      duplicates = findDuplicates(result.drafts, existing);
      include = {};
      step = "summary";
    } catch {
      analysisError = t("hv.analysisFailed");
    } finally {
      analyzing = false;
    }
  }

  async function confirm() {
    if (!plan || plan.undecided.length > 0 || plan.sessions.length === 0 || committing) return;
    committing = true;
    commitError = "";
    try {
      const written = await commitHevyImport(plan);
      importedCount = written;
      settings.hevyExerciseMap = { ...settings.hevyExerciseMap, ...plan.mappings };
      step = "done";
      toast(t("hv.imported", { workouts: tn("count.workouts", written) }), { action: { label: t("hv.viewHistory"), run: () => void goto(resolve("/history")) } });
    } catch {
      commitError = t("hv.importFailed");
    } finally {
      committing = false;
    }
  }

  function reset() {
    step = "file";
    parsed = undefined;
    normalized = undefined;
    fileName = "";
    fileErrors = [];
    choices = {};
    include = {};
    createdIds.clear();
    importedCount = 0;
  }

  const matchLabel = (m: DuplicateMatch) =>
    m.status === "duplicate"
      ? m.source === "stored"
        ? t("hv.alreadyImported")
        : t("hv.repeated")
      : t("hv.possibleDup");
</script>

<PageHeader title={t("hv.title")} back={{ href: resolve("/settings"), label: t("hv.back") }} />

<div class="steps">
  {#if step !== "done"}
    <p class="progress" aria-live="polite">{t("hv.step", { n: stepIndex + 1, total: STEPS.length, title: t(`hv.step.${STEPS[stepIndex].id}`) })}</p>
  {/if}

  {#if step === "file"}
    <Card as="section">
      <div class="stack">
        <p class="note">
          {t("hv.help")} <code>workouts.csv</code> {t("hv.helpEnd")}
        </p>
        <input bind:this={fileInput} type="file" accept=".csv,text/csv" hidden onchange={onfile} data-testid="hevy-file-input" />
        <Button onclick={() => fileInput?.click()} loading={reading}>{fileName ? t("hv.chooseAnother") : t("hv.choose")}</Button>
        {#if fileName}<p class="file" data-testid="hevy-file-name">{fileName}</p>{/if}
        {#if fileErrors.length > 0}
          <Banner variant="danger" urgent title={t("hv.badFile")}>
            <ul>{#each fileErrors as m, i (i)}<li>{m}</li>{/each}</ul>
          </Banner>
        {/if}
        {#if parsed}
          <Banner variant="success">{t("hv.read", { rows: tn("count.setRows", parsed.rows.length), units: parsed.units })}</Banner>
        {/if}
        <Select
          label={t("hv.zone")}
          hint={t("hv.zoneHint")}
          options={zones}
          bind:value={timeZone}
        />
        {#if analysisError}<Banner variant="danger" urgent>{analysisError}</Banner>{/if}
        <Button variant="primary" disabled={!parsed} loading={analyzing} onclick={analyze}>{t("hv.continue")}</Button>
      </div>
    </Card>
  {:else if step === "summary" && normalized}
    {@const totals = normalized.totals}
    {@const first = normalized.drafts[0]}
    {@const last = normalized.drafts[normalized.drafts.length - 1]}
    {@const u = normalized.unsupported}
    <Card as="section">
      <div class="stack">
        <dl data-testid="hevy-summary">
          <dt>{t("hv.workouts")}</dt>
          <dd>{totals.workouts}</dd>
          <dt>{t("hv.sets")}</dt>
          <dd>{totals.sets}</dd>
          <dt>{t("hv.exercises")}</dt>
          <dd>{normalized.exercises.length}</dd>
          {#if first && last}
            <dt>{t("hv.first")}</dt>
            <dd>{formatIn(first.startedAt, timeZone)}<span class="sub">{new Date(first.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span></dd>
            <dt>{t("hv.last")}</dt>
            <dd>{formatIn(last.startedAt, timeZone)}<span class="sub">{new Date(last.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span></dd>
          {/if}
          <dt>{t("hv.timeZone")}</dt>
          <dd>{timeZone}</dd>
        </dl>

        {#if totals.workouts === 0}
          <Banner variant="warning" title={t("hv.noWorkoutsTitle")}>{t("hv.noWorkouts")}</Banner>
        {/if}

        {#if u.columns.length > 0 || u.emptySetsSkipped > 0 || u.unknownSetTypes.length > 0 || u.workoutsRejected.length > 0 || (parsed?.errorCount ?? 0) > 0}
          <Banner variant="warning" title={t("hv.notImported")}>
            <ul>
              {#if u.columns.length > 0}<li>{t("hv.unsupportedCols", { cols: u.columns.join(", ") })}</li>{/if}
              {#if u.emptySetsSkipped > 0}<li>{t("hv.emptySkipped", { count: tn("count.emptySets", u.emptySetsSkipped) })}</li>{/if}
              {#each u.unknownSetTypes as s (s.value)}<li>{t("hv.setType", { value: s.value, sets: tn("count.sets", s.rows) })}</li>{/each}
              {#if (parsed?.errorCount ?? 0) > 0}<li>{t("hv.invalidSkipped", { count: tn("count.invalidRows", parsed?.errorCount ?? 0) })}</li>{/if}
              {#each u.workoutsRejected.slice(0, SHOWN) as w, i (i)}<li>{w.workout}: {w.message}</li>{/each}
              {#if u.workoutsRejected.length > SHOWN}<li>{t("hv.moreLeftOut", { n: u.workoutsRejected.length - SHOWN })}</li>{/if}
            </ul>
          </Banner>
        {/if}
        <p class="note">{t("hv.noExtras")}</p>
        {#if u.warnings.length > 0}
          <details>
            <summary>{tn("count.warnings", u.warnings.length)}</summary>
            <ul>
              {#each u.warnings.slice(0, 50) as w, i (i)}<li>{w.workout ? `${w.workout}: ` : ""}{w.message}</li>{/each}
              {#if u.warnings.length > 50}<li>{t("hv.andMore", { n: u.warnings.length - 50 })}</li>{/if}
            </ul>
          </details>
        {/if}
        <div class="nav">
          <Button onclick={() => (step = "file")}>{t("hv.back2")}</Button>
          <Button variant="primary" disabled={totals.workouts === 0} onclick={() => (step = "exercises")}>{t("hv.continue")}</Button>
        </div>
      </div>
    </Card>
  {:else if step === "exercises" && normalized}
    <Card as="section">
      <div class="stack">
        <p class="note">{t("hv.matchNote")}</p>
        <ExerciseMappingTable exercises={normalized.exercises} {catalog} {resolutions} {sources} bind:choices />
        <div class="nav">
          <Button onclick={() => (step = "summary")}>{t("hv.back2")}</Button>
          <Button variant="primary" onclick={() => (step = "review")}>{t("hv.continue")}</Button>
        </div>
      </div>
    </Card>
  {:else if step === "review" && normalized && plan}
    <Card as="section">
      <div class="stack">
        {#if flagged.length > 0}
          <div class="stack" data-testid="hevy-duplicates">
            <p class="note">
              {tn("hv.flagged", flagged.length)}
            </p>
            {#each flagged as { draft, match } (draft.id)}
              <div class="dup">
                <Switch
                  label="{draft.name} · {formatIn(draft.startedAt, timeZone)}"
                  description={matchLabel(match)}
                  bind:checked={() => include[draft.id] ?? includeByDefault(match), (v) => (include[draft.id] = v)}
                />
              </div>
            {/each}
          </div>
        {/if}
        <p class="note">
          {t("hv.zoneNote")}
        </p>

        <dl>
          <dt>{t("hv.newWorkouts")}</dt>
          <dd>{newCount}</dd>
          {#if flagged.length > 0}
            <dt>{t("hv.flaggedIncluded")}</dt>
            <dd>{flagged.length - (plan.counts.deselectedWorkouts)}</dd>
          {/if}
          <dt>{t("hv.sets")}</dt>
          <dd>{plan.counts.sets}</dd>
          {#if plan.counts.skippedSets > 0}
            <dt>{t("hv.setsSkipped")}</dt>
            <dd>{plan.counts.skippedSets}</dd>
          {/if}
          {#if plan.newExercises.length > 0}
            <dt>{t("hv.newCustom")}</dt>
            <dd>{plan.newExercises.length}</dd>
          {/if}
        </dl>

        {#if plan.undecided.length > 0}
          <Banner variant="warning" title={t("hv.undecidedTitle")}>
            {tn("hv.undecided", plan.undecided.length, { names: plan.undecided.slice(0, 5).join(", ") + (plan.undecided.length > 5 ? "…" : "") })}
            <Button size="sm" onclick={() => (step = "exercises")}>{t("hv.goExercises")}</Button>
          </Banner>
        {:else if plan.sessions.length === 0}
          <Banner variant="info" title={t("hv.nothingNewTitle")}>{t("hv.nothingNew")}</Banner>
        {/if}
        {#if plan.counts.emptiedWorkouts > 0}
          <Banner variant="warning">{tn("hv.emptied", plan.counts.emptiedWorkouts)}</Banner>
        {/if}
        {#if commitError}<Banner variant="danger" urgent>{commitError}</Banner>{/if}

        <div class="nav">
          <Button onclick={() => (step = "exercises")}>{t("hv.back2")}</Button>
          <Button variant="primary" loading={committing} disabled={plan.undecided.length > 0 || plan.sessions.length === 0} onclick={confirm}>
            {t("hv.import", { workouts: tn("count.workouts", plan.counts.workouts) })}
          </Button>
        </div>
      </div>
    </Card>
  {:else if step === "done"}
    <Card as="section">
      <div class="stack">
        <Banner variant="success" title={t("hv.doneTitle")}>{t("hv.done", { workouts: tn("count.workouts", importedCount) })}</Banner>
        <div class="nav">
          <Button onclick={reset}>{t("hv.another")}</Button>
          <Button variant="primary" href={resolve("/history")}>{t("hv.viewHistory")}</Button>
        </div>
      </div>
    </Card>
  {/if}
</div>

<style>
  .steps,
  .stack {
    display: grid;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .progress,
  .note,
  .file {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
  }
  .file {
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    text-align: end;
    overflow-wrap: anywhere;
  }
  .sub {
    display: block;
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    color: var(--color-text-muted);
  }
  ul {
    margin: 0;
    padding-inline-start: var(--space-4);
  }
  li {
    overflow-wrap: anywhere;
  }
  .nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .dup {
    padding: var(--space-2) var(--space-3);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
  }
  details summary {
    min-block-size: var(--tap-min);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  code {
    font-family: var(--font-mono);
  }
</style>
