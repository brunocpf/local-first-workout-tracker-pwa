<script lang="ts">
  import { formatLocaleNumber } from "#lib/format";
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { buildConvertPrompt, buildPlanPrompt, MAX_CONVERT_TEXT_CHARS, formatHistory, HISTORY_WEEKS, summarizeHistory, type HistoryLine } from "#lib/imports/prompt";
  import { listExercises } from "#lib/storage/exercises";
  import { listCompletedSessions } from "#lib/storage/sessions";
  import type { Exercise } from "#lib/types";

  let mode = $state("create");
  let planText = $state("");
  let sourceUrl = $state("");
  let goal = $state("Build muscle");
  let daysPerWeek = $state<number | null>(4);
  let sessionMinutes = $state<number | null>(60);
  let experience = $state("intermediate");
  let equipment = $state("Full gym");
  let notes = $state("");
  let includeHistory = $state(false);

  let exercises = $state<Exercise[]>([]);
  let history = $state<HistoryLine[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let copyResult = $state<"copied" | "manual" | undefined>();
  let promptEl = $state<HTMLTextAreaElement>();

  onMount(async () => {
    try {
      exercises = await listExercises();
      const cutoff = Date.now() - HISTORY_WEEKS * 7 * 86_400_000;
      const recent = (await listCompletedSessions({ limit: 200 })).filter((s) => Date.parse(s.startedAt) >= cutoff);
      history = summarizeHistory(recent);
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const prompt = $derived(
    mode === "convert"
      ? buildConvertPrompt({ text: planText, sourceUrl, exercises })
      : buildPlanPrompt({
      goal,
      daysPerWeek: daysPerWeek ?? 4,
      sessionMinutes: sessionMinutes ?? 60,
      experience,
      equipment,
      notes,
      exercises,
      history: includeHistory ? history : undefined,
    }),
  );
  const canCopy = $derived(mode === "create" || planText.trim().length > 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      copyResult = "copied";
    } catch {
      // Clipboard API unavailable or denied (some iOS contexts): select the text so the user can copy it.
      copyResult = "manual";
      promptEl?.focus();
      promptEl?.select();
    }
  }
</script>

<PageHeader title={t("gen.title")} back={{ href: resolve("/routines"), label: t("imp.backTo") }} />

<div class="page">
  <p>
    {t("gen.intro")}
  </p>

  <SegmentedControl
    legend={t("gen.mode")}
    bind:value={mode}
    options={[
      { value: "create", label: t("gen.create") },
      { value: "convert", label: t("gen.convert") },
    ]}
  />

  {#if mode === "convert"}
    <form onsubmit={(e) => e.preventDefault()} novalidate>
      <TextField
        label={t("gen.planText")}
        bind:value={planText}
        multiline
        placeholder={t("gen.planPlaceholder")}
        hint={t("gen.planHint", { max: formatLocaleNumber(MAX_CONVERT_TEXT_CHARS) })}
      />
      <TextField label={t("gen.source")} bind:value={sourceUrl} placeholder="https://…" hint={t("gen.sourceHint")} />
    </form>
  {:else}
  <form onsubmit={(e) => e.preventDefault()} novalidate>
    <TextField label={t("gen.goal")} bind:value={goal} placeholder={t("gen.goalPlaceholder")} />
    <NumberField label={t("gen.days")} mode="integer" bind:value={daysPerWeek} min={1} max={7} />
    <NumberField label={t("gen.minutes")} mode="integer" bind:value={sessionMinutes} min={10} max={300} />
    <Select
      label={t("gen.experience")}
      bind:value={experience}
      options={[
        { value: "beginner", label: t("gen.beginner") },
        { value: "intermediate", label: t("gen.intermediate") },
        { value: "advanced", label: t("gen.advanced") },
      ]}
    />
    <TextField label={t("gen.equipment")} bind:value={equipment} placeholder={t("gen.equipmentPlaceholder")} />
    <TextField label={t("gen.notes")} bind:value={notes} multiline hint={t("gen.notesHint")} />

    <Switch
      label={t("gen.history")}
      bind:checked={includeHistory}
      description={t("gen.historyDesc", { weeks: HISTORY_WEEKS })}
      disabled={!loaded || history.length === 0}
    />
    {#if includeHistory}
      <div class="preview">
        <strong>{t("gen.exactly")}</strong>
        <pre>{formatHistory(history)}</pre>
      </div>
    {/if}
  </form>
  {/if}

  {#if failed}
    <Banner variant="warning" title={t("gen.loadFailed")}>{t("gen.loadFailedBody")}</Banner>
  {/if}

  <label class="label" for="prompt-text">{t("gen.prompt", { chars: formatLocaleNumber(prompt.length) })}</label>
  <textarea id="prompt-text" bind:this={promptEl} readonly rows="10" value={prompt} spellcheck="false"></textarea>

  <div class="actions" role="status">
    <Button variant="primary" icon="copy" onclick={copy} disabled={!canCopy}>{t("gen.copy")}</Button>
    <Button variant="secondary" icon="import" href={resolve("/routines/import")}>{t("gen.next")}</Button>
  </div>
  {#if copyResult === "copied"}<p>{t("gen.copied")}</p>{/if}
  {#if copyResult === "manual"}<p>{t("gen.manual")}</p>{/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--space-4); }
  p { margin: 0; }
  form { display: flex; flex-direction: column; gap: var(--space-3); }
  .label { font-weight: var(--weight-semibold); }
  .preview { display: flex; flex-direction: column; gap: var(--space-1); }
  pre {
    margin: 0;
    padding: var(--space-3);
    max-block-size: 12rem;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: var(--color-surface-2);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
  }
  textarea {
    box-sizing: border-box;
    inline-size: 100%;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface-2);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    resize: vertical;
  }
  textarea:focus-visible { border-color: var(--color-accent); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
