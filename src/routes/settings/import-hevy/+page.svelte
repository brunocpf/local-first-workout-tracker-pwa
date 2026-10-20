<script lang="ts">
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
  const STEPS: { id: Exclude<Step, "done">; title: string }[] = [
    { id: "file", title: "File and time zone" },
    { id: "summary", title: "Summary" },
    { id: "exercises", title: "Exercises" },
    { id: "review", title: "Duplicates and confirm" },
  ];
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
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(iso));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
      if (!read.ok) return void (fileErrors = ["File is larger than 10 MB."]);
      const result = parseHevyCsv(read.text);
      if (result.ok) parsed = result;
      else fileErrors = result.errors.map((e) => e.message);
    } catch {
      fileErrors = ["Couldn't read that file."];
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
      analysisError = "Couldn't read your exercises or workout history. Nothing was changed.";
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
      toast(`Imported ${plural(written, "workout")}`, { action: { label: "View history", run: () => void goto(resolve("/history")) } });
    } catch {
      commitError = "Couldn't import. Nothing was changed.";
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
        ? "Already imported"
        : "Repeated in this file"
      : "Possible duplicate: a workout starts within 10 minutes of this one";
</script>

<PageHeader title="Import from Hevy" back={{ href: resolve("/settings"), label: "Back to settings" }} />

<div class="steps">
  {#if step !== "done"}
    <p class="progress" aria-live="polite">Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].title}</p>
  {/if}

  {#if step === "file"}
    <Card as="section">
      <div class="stack">
        <p class="note">
          In Hevy: Settings → Export Data → Export Workout Data. Choose the <code>workouts.csv</code> file here. Nothing is saved until you confirm.
        </p>
        <input bind:this={fileInput} type="file" accept=".csv,text/csv" hidden onchange={onfile} data-testid="hevy-file-input" />
        <Button onclick={() => fileInput?.click()} loading={reading}>{fileName ? "Choose another file…" : "Choose file…"}</Button>
        {#if fileName}<p class="file" data-testid="hevy-file-name">{fileName}</p>{/if}
        {#if fileErrors.length > 0}
          <Banner variant="danger" urgent title="This file can't be imported">
            <ul>{#each fileErrors as m, i (i)}<li>{m}</li>{/each}</ul>
          </Banner>
        {/if}
        {#if parsed}
          <Banner variant="success">Read {plural(parsed.rows.length, "set row")} (units: {parsed.units}).</Banner>
        {/if}
        <Select
          label="Time zone of your Hevy workouts"
          hint="Hevy's export has no time zone. Pick where you trained; it decides which day each workout lands on."
          options={zones}
          bind:value={timeZone}
        />
        {#if analysisError}<Banner variant="danger" urgent>{analysisError}</Banner>{/if}
        <Button variant="primary" disabled={!parsed} loading={analyzing} onclick={analyze}>Continue</Button>
      </div>
    </Card>
  {:else if step === "summary" && normalized}
    {@const t = normalized.totals}
    {@const first = normalized.drafts[0]}
    {@const last = normalized.drafts[normalized.drafts.length - 1]}
    {@const u = normalized.unsupported}
    <Card as="section">
      <div class="stack">
        <dl data-testid="hevy-summary">
          <dt>Workouts</dt>
          <dd>{t.workouts}</dd>
          <dt>Sets</dt>
          <dd>{t.sets}</dd>
          <dt>Exercises</dt>
          <dd>{normalized.exercises.length}</dd>
          {#if first && last}
            <dt>First</dt>
            <dd>{formatIn(first.startedAt, timeZone)}<span class="sub">{new Date(first.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span></dd>
            <dt>Last</dt>
            <dd>{formatIn(last.startedAt, timeZone)}<span class="sub">{new Date(last.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span></dd>
          {/if}
          <dt>Time zone</dt>
          <dd>{timeZone}</dd>
        </dl>

        {#if t.workouts === 0}
          <Banner variant="warning" title="No workouts to import">The file has no workouts with usable sets.</Banner>
        {/if}

        {#if u.columns.length > 0 || u.emptySetsSkipped > 0 || u.unknownSetTypes.length > 0 || u.workoutsRejected.length > 0 || (parsed?.errorCount ?? 0) > 0}
          <Banner variant="warning" title="Not imported">
            <ul>
              {#if u.columns.length > 0}<li>Unsupported columns with data (ignored): {u.columns.join(", ")}.</li>{/if}
              {#if u.emptySetsSkipped > 0}<li>{plural(u.emptySetsSkipped, "empty set")} skipped.</li>{/if}
              {#each u.unknownSetTypes as s (s.value)}<li>Set type “{s.value}” ({plural(s.rows, "set")}) imported as normal.</li>{/each}
              {#if (parsed?.errorCount ?? 0) > 0}<li>{plural(parsed?.errorCount ?? 0, "invalid row")} skipped.</li>{/if}
              {#each u.workoutsRejected.slice(0, SHOWN) as w, i (i)}<li>{w.workout}: {w.message}</li>{/each}
              {#if u.workoutsRejected.length > SHOWN}<li>…and {u.workoutsRejected.length - SHOWN} more workouts left out.</li>{/if}
            </ul>
          </Banner>
        {/if}
        <p class="note">Hevy's export doesn't include per-set notes, media or routines, so those aren't imported.</p>
        {#if u.warnings.length > 0}
          <details>
            <summary>{plural(u.warnings.length, "warning")}</summary>
            <ul>
              {#each u.warnings.slice(0, 50) as w, i (i)}<li>{w.workout ? `${w.workout}: ` : ""}{w.message}</li>{/each}
              {#if u.warnings.length > 50}<li>…and {u.warnings.length - 50} more.</li>{/if}
            </ul>
          </details>
        {/if}
        <div class="nav">
          <Button onclick={() => (step = "file")}>Back</Button>
          <Button variant="primary" disabled={t.workouts === 0} onclick={() => (step = "exercises")}>Continue</Button>
        </div>
      </div>
    </Card>
  {:else if step === "exercises" && normalized}
    <Card as="section">
      <div class="stack">
        <p class="note">Match each Hevy exercise to your catalog. Your choices are remembered for the next import.</p>
        <ExerciseMappingTable exercises={normalized.exercises} {catalog} {resolutions} {sources} bind:choices />
        <div class="nav">
          <Button onclick={() => (step = "summary")}>Back</Button>
          <Button variant="primary" onclick={() => (step = "review")}>Continue</Button>
        </div>
      </div>
    </Card>
  {:else if step === "review" && normalized && plan}
    <Card as="section">
      <div class="stack">
        {#if flagged.length > 0}
          <div class="stack" data-testid="hevy-duplicates">
            <p class="note">
              {plural(flagged.length, "workout")} look{flagged.length === 1 ? "s" : ""} like ones already in your history. Already-imported workouts are skipped unless you
              switch them on; nothing is merged or overwritten.
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
          If you import the same file again with a different time zone, the workouts can't be recognised as duplicates. Delete mistaken imports from History.
        </p>

        <dl>
          <dt>New workouts</dt>
          <dd>{newCount}</dd>
          {#if flagged.length > 0}
            <dt>Flagged workouts included</dt>
            <dd>{flagged.length - (plan.counts.deselectedWorkouts)}</dd>
          {/if}
          <dt>Sets</dt>
          <dd>{plan.counts.sets}</dd>
          {#if plan.counts.skippedSets > 0}
            <dt>Sets skipped</dt>
            <dd>{plan.counts.skippedSets}</dd>
          {/if}
          {#if plan.newExercises.length > 0}
            <dt>New custom exercises</dt>
            <dd>{plan.newExercises.length}</dd>
          {/if}
        </dl>

        {#if plan.undecided.length > 0}
          <Banner variant="warning" title="Some exercises need a decision">
            {plural(plan.undecided.length, "exercise")} in the workouts to import {plan.undecided.length === 1 ? "isn't" : "aren't"} mapped yet:
            {plan.undecided.slice(0, 5).join(", ")}{plan.undecided.length > 5 ? "…" : ""}.
            <Button size="sm" onclick={() => (step = "exercises")}>Go to exercises</Button>
          </Banner>
        {:else if plan.sessions.length === 0}
          <Banner variant="info" title="Nothing new to import">Every workout in this file is already in your history or left out.</Banner>
        {/if}
        {#if plan.counts.emptiedWorkouts > 0}
          <Banner variant="warning">{plural(plan.counts.emptiedWorkouts, "workout")} left out because all of {plan.counts.emptiedWorkouts === 1 ? "its" : "their"} exercises are skipped.</Banner>
        {/if}
        {#if commitError}<Banner variant="danger" urgent>{commitError}</Banner>{/if}

        <div class="nav">
          <Button onclick={() => (step = "exercises")}>Back</Button>
          <Button variant="primary" loading={committing} disabled={plan.undecided.length > 0 || plan.sessions.length === 0} onclick={confirm}>
            Import {plural(plan.counts.workouts, "workout")}
          </Button>
        </div>
      </div>
    </Card>
  {:else if step === "done"}
    <Card as="section">
      <div class="stack">
        <Banner variant="success" title="Import complete">Imported {plural(importedCount, "workout")}. They now appear in History and in your previous values.</Banner>
        <div class="nav">
          <Button onclick={reset}>Import another file</Button>
          <Button variant="primary" href={resolve("/history")}>View history</Button>
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
