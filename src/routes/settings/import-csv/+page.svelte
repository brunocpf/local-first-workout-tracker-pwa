<script lang="ts">
  import { intlLocale } from "#lib/i18n.svelte";
  import type { MessageKey } from "#lib/messages";
  import { t, tn } from "#lib/i18n.svelte";
  // CSV history import (PRD §12.2, docs/csv-format.md): file → column mapping, units, time zone → summary → exercise mapping →
  // duplicates → confirm. Nothing is written until the final confirm; the write is the Hevy import's one all-or-nothing transaction.
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
  import {
    CSV_FIELDS,
    CSV_FIELD_LABELS,
    MAX_CSV_BYTES,
    csvInitialChoices,
    freshenTakenIds,
    mappingIssues,
    normalizeCsvHistory,
    readCsvTable,
    reservedExerciseIds,
    suggestMapping,
    suggestUnits,
    type CsvField,
    type CsvMapping,
    type CsvNormalizeResult,
    type CsvTable,
    type CsvUnits,
  } from "#lib/imports/csvHistory";
  import { findDuplicates, type DuplicateMatch } from "#lib/imports/duplicates";
  import type { HevyNameResolution } from "#lib/imports/hevy/exerciseMap";
  import { buildHevyPlan, includeByDefault, type HevyChoice, type HevyChoiceSource } from "#lib/imports/hevy/plan";
  import { listExercises } from "#lib/storage/exercises";
  import { commitHevyImport, existingSessionIds, listSessionIdentitiesAround } from "#lib/storage/hevyImport";
  import { currentTimeZone } from "#lib/time";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Exercise } from "#lib/types";

  type Step = "file" | "columns" | "summary" | "exercises" | "review" | "done";
  const STEPS: { id: Exclude<Step, "done"> }[] = [{ id: "file" }, { id: "columns" }, { id: "summary" }, { id: "exercises" }, { id: "review" }];
  const SHOWN = 10;
  const NONE = "";
  const stepTitle = (id: Exclude<Step, "done">) => (id === "file" || id === "columns" ? t(`csv.step.${id}`) : t(`hv.step.${id}`));
  const fieldLabel = (f: CsvField) => t(`csv.field.${f}`);
  const fieldHint = (f: CsvField) => (CSV_FIELD_LABELS[f].hint ? t(`csv.hint.${f}` as MessageKey) : undefined);

  let step = $state<Step>("file");
  let fileName = $state("");
  let reading = $state(false);
  let fileError = $state("");
  let table = $state.raw<CsvTable>();

  let columns = $state<Record<CsvField, string>>(emptyColumns());
  let units = $state<CsvUnits>({ weight: "kg", distance: "m", duration: "s" });
  let timeZone = $state(currentTimeZone());
  let analyzing = $state(false);
  let analysisError = $state("");

  let normalized = $state.raw<CsvNormalizeResult>();
  let drafts = $state.raw<CsvNormalizeResult["drafts"]>([]);
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

  function emptyColumns(): Record<CsvField, string> {
    return Object.fromEntries(CSV_FIELDS.map((f) => [f, NONE])) as Record<CsvField, string>;
  }

  const zones = $derived.by(() => {
    const names = [...(globalThis.Intl?.supportedValuesOf?.("timeZone") ?? []), currentTimeZone(), timeZone];
    return names.filter((z, i) => names.indexOf(z) === i).sort().map((z) => ({ value: z, label: z }));
  });
  const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

  const mapping = $derived.by((): CsvMapping => {
    const m: CsvMapping = {};
    for (const f of CSV_FIELDS) if (columns[f] !== NONE) m[f] = Number(columns[f]);
    return m;
  });
  const problems = $derived(mappingIssues(mapping));
  const columnOptions = $derived([
    { value: NONE, label: t("csv.notInFile") },
    ...(table?.headers ?? []).map((h, i) => ({ value: String(i), label: h === "" ? t("csv.columnN", { n: i + 1 }) : h.length > 60 ? `${h.slice(0, 59)}…` : h })),
  ]);

  const plan = $derived(
    normalized ? buildHevyPlan({ drafts, exercises: normalized.exercises, choices, catalog, duplicates, include, createdIds }) : undefined,
  );
  const flagged = $derived(drafts.flatMap((d, i) => (duplicates[i] && duplicates[i].status !== "new" ? [{ draft: d, match: duplicates[i] }] : [])));
  const newCount = $derived(drafts.length - flagged.length);

  const formatIn = (iso: string, zone: string) =>
    new Intl.DateTimeFormat(intlLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(iso));

  async function onfile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    fileName = file.name;
    fileError = "";
    table = undefined;
    reading = true;
    try {
      const read = await readTextFile(file, MAX_CSV_BYTES);
      if (!read.ok) return void (fileError = t("hv.tooBig"));
      const result = readCsvTable(read.text);
      if (!result.ok) return void (fileError = result.error);
      table = result.table;
      const suggested = suggestMapping(result.table.headers);
      columns = { ...emptyColumns(), ...Object.fromEntries(Object.entries(suggested).map(([f, i]) => [f, String(i)])) };
      units = suggestUnits(result.table.headers, suggested);
    } catch {
      fileError = t("hv.readFailed");
    } finally {
      reading = false;
    }
  }

  /** Normalize with the chosen mapping, load the catalog and stored sessions, classify duplicates. Writes nothing. */
  async function analyze() {
    if (!table || problems.length > 0) return;
    analyzing = true;
    analysisError = "";
    try {
      const result = normalizeCsvHistory(table, mapping, { timeZone, units });
      const exercises = await listExercises();
      const initial = csvInitialChoices(result.exercises, exercises, result.exerciseIds);
      let ready = result.drafts;
      let existing: { startedAt: string; name: string }[] = [];
      if (ready.length > 0) {
        // A file's own session ids are kept; one that is already stored gets a fresh id instead of aborting the import.
        ready = freshenTakenIds(ready, await existingSessionIds(ready.map((d) => d.id)));
        existing = await listSessionIdentitiesAround(ready[0].startedAt, ready[ready.length - 1].startedAt);
      }

      // Keep decisions made for a previous mapping where the exercise name is still there.
      const kept: Record<string, HevyChoice | undefined> = {};
      for (const e of result.exercises) kept[e.title] = choices[e.title] ?? initial.choices[e.title];
      for (const [title, c] of Object.entries(kept)) if (c?.kind === "exercise" && !exercises.some((x) => x.id === c.exerciseId)) kept[title] = undefined;

      createdIds.clear();
      for (const [title, id] of reservedExerciseIds(result.exercises, exercises, result.exerciseIds)) createdIds.set(title, id);

      normalized = result;
      drafts = ready;
      catalog = exercises;
      resolutions = initial.resolutions;
      sources = initial.sources;
      choices = kept;
      duplicates = findDuplicates(ready, existing);
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
      // The Hevy import remembers title → exercise choices for later Hevy files; CSV names say nothing about those.
      const written = await commitHevyImport({ ...plan, mappings: {} });
      importedCount = written;
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
    table = undefined;
    normalized = undefined;
    drafts = [];
    fileName = "";
    fileError = "";
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

  const unitOptions = $derived({
    weight: [
      { value: "kg", label: t("csv.kg") },
      { value: "lb", label: t("csv.lb") },
    ],
    distance: [
      { value: "m", label: t("csv.m") },
      { value: "km", label: t("csv.km") },
      { value: "mi", label: t("csv.mi") },
    ],
    duration: [
      { value: "s", label: t("csv.s") },
      { value: "min", label: t("csv.min") },
    ],
  });
</script>

<PageHeader title={t("csv.title")} back={{ href: resolve("/settings"), label: t("hv.back") }} />

<div class="steps">
  {#if step !== "done"}
    <p class="progress" aria-live="polite">{t("hv.step", { n: stepIndex + 1, total: STEPS.length, title: stepTitle(STEPS[stepIndex].id) })}</p>
  {/if}

  {#if step === "file"}
    <Card as="section">
      <div class="stack">
        <p class="note">
          {t("csv.intro")}
        </p>
        <input bind:this={fileInput} type="file" accept=".csv,text/csv" hidden onchange={onfile} data-testid="csv-file-input" />
        <Button onclick={() => fileInput?.click()} loading={reading}>{fileName ? t("hv.chooseAnother") : t("hv.choose")}</Button>
        {#if fileName}<p class="file" data-testid="csv-file-name">{fileName}</p>{/if}
        {#if fileError}
          <Banner variant="danger" urgent title={t("hv.badFile")}>{fileError}</Banner>
        {/if}
        {#if table}
          <Banner variant="success">{t("csv.read", { rows: tn("count.rows", table.rows.length), cols: tn("count.columns", table.headers.length) })}</Banner>
        {/if}
        <Button variant="primary" disabled={!table} onclick={() => (step = "columns")}>{t("hv.continue")}</Button>
      </div>
    </Card>
  {:else if step === "columns" && table}
    <Card as="section">
      <div class="stack">
        <p class="note">{t("csv.pickColumns")}</p>
        {#each CSV_FIELDS as f (f)}
          <Select label={fieldLabel(f)} hint={fieldHint(f)} options={columnOptions} bind:value={columns[f]} />
        {/each}

        <Select label={t("csv.weightUnit")} options={unitOptions.weight} bind:value={units.weight} hint={t("csv.weightHint")} />
        <Select label={t("csv.distanceUnit")} options={unitOptions.distance} bind:value={units.distance} hint={t("csv.distanceHint")} />
        <Select
          label={t("csv.durationUnit")}
          options={unitOptions.duration}
          bind:value={units.duration}
          hint={t("csv.durationHint")}
        />
        <Select
          label={t("past.timeZone")}
          hint={t("csv.zoneHint")}
          options={zones}
          bind:value={timeZone}
        />

        {#if problems.length > 0}
          <Banner variant="warning" title={t("csv.finish")}><ul>{#each problems as m (m)}<li>{m}</li>{/each}</ul></Banner>
        {/if}
        {#if analysisError}<Banner variant="danger" urgent>{analysisError}</Banner>{/if}
        <div class="nav">
          <Button onclick={() => (step = "file")}>{t("hv.back2")}</Button>
          <Button variant="primary" disabled={problems.length > 0} loading={analyzing} onclick={analyze}>{t("hv.continue")}</Button>
        </div>
      </div>
    </Card>
  {:else if step === "summary" && normalized}
    {@const totals = normalized.totals}
    {@const first = drafts[0]}
    {@const last = drafts[drafts.length - 1]}
    {@const r = normalized.report}
    <Card as="section">
      <div class="stack">
        <dl data-testid="csv-summary">
          <dt>{t("hv.workouts")}</dt>
          <dd>{totals.workouts}</dd>
          <dt>{t("hv.sets")}</dt>
          <dd>{totals.sets}</dd>
          <dt>{t("hv.exercises")}</dt>
          <dd>{normalized.exercises.length}</dd>
          {#if first && last}
            <dt>{t("hv.first")}</dt>
            <dd>{formatIn(first.startedAt, first.timeZone)}<span class="sub">{first.startedAt.slice(0, 16).replace("T", " ")} UTC</span></dd>
            <dt>{t("hv.last")}</dt>
            <dd>{formatIn(last.startedAt, last.timeZone)}<span class="sub">{last.startedAt.slice(0, 16).replace("T", " ")} UTC</span></dd>
          {/if}
          <dt>{t("csv.defaultZone")}</dt>
          <dd>{timeZone}</dd>
        </dl>

        {#if totals.workouts === 0}
          <Banner variant="warning" title={t("hv.noWorkoutsTitle")}>{t("csv.noWorkoutsBody")}</Banner>
        {/if}

        {#if r.rowErrorCount > 0 || r.emptySetsSkipped > 0 || r.unknownSetTypes.length > 0 || r.workoutsRejected.length > 0}
          <Banner variant="warning" title={t("hv.notImported")}>
            <ul>
              {#each r.rowErrors.slice(0, SHOWN) as e, i (i)}<li>{e.where}: {e.message}</li>{/each}
              {#if r.rowErrorCount > SHOWN}<li>{t("csv.moreRows", { n: r.rowErrorCount - SHOWN })}</li>{/if}
              {#if r.emptySetsSkipped > 0}<li>{t("hv.emptySkipped", { count: tn("count.emptySets", r.emptySetsSkipped) })}</li>{/if}
              {#each r.unknownSetTypes as s (s.value)}<li>{t("hv.setType", { value: s.value, sets: tn("count.sets", s.rows) })}</li>{/each}
              {#each r.workoutsRejected.slice(0, SHOWN) as w, i (i)}<li>{w.where}: {w.message}</li>{/each}
              {#if r.workoutsRejected.length > SHOWN}<li>{t("hv.moreLeftOut", { n: r.workoutsRejected.length - SHOWN })}</li>{/if}
            </ul>
          </Banner>
        {/if}
        <p class="note">{t("csv.onlyMapped")}</p>
        {#if r.warnings.length > 0}
          <details>
            <summary>{tn("count.warnings", r.warnings.length)}</summary>
            <ul>
              {#each r.warnings.slice(0, 50) as w, i (i)}<li>{w.where ? `${w.where}: ` : ""}{w.message}</li>{/each}
              {#if r.warnings.length > 50}<li>{t("hv.andMore", { n: r.warnings.length - 50 })}</li>{/if}
            </ul>
          </details>
        {/if}
        <div class="nav">
          <Button onclick={() => (step = "columns")}>{t("hv.back2")}</Button>
          <Button variant="primary" disabled={totals.workouts === 0} onclick={() => (step = "exercises")}>{t("hv.continue")}</Button>
        </div>
      </div>
    </Card>
  {:else if step === "exercises" && normalized}
    <Card as="section">
      <div class="stack">
        <p class="note">{t("csv.matchNote")}</p>
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
          <div class="stack" data-testid="csv-duplicates">
            <p class="note">
              {tn("hv.flagged", flagged.length)}
            </p>
            {#each flagged as { draft, match } (draft.id)}
              <div class="dup">
                <Switch
                  label="{draft.name} · {formatIn(draft.startedAt, draft.timeZone)}"
                  description={matchLabel(match)}
                  bind:checked={() => include[draft.id] ?? includeByDefault(match), (v) => (include[draft.id] = v)}
                />
              </div>
            {/each}
          </div>
        {/if}

        <dl>
          <dt>{t("hv.newWorkouts")}</dt>
          <dd>{newCount}</dd>
          {#if flagged.length > 0}
            <dt>{t("hv.flaggedIncluded")}</dt>
            <dd>{flagged.length - plan.counts.deselectedWorkouts}</dd>
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
</style>
