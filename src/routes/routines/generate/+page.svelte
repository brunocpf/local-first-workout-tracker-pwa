<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { buildPlanPrompt, formatHistory, HISTORY_WEEKS, summarizeHistory, type HistoryLine } from "#lib/imports/prompt";
  import { listExercises } from "#lib/storage/exercises";
  import { listCompletedSessions } from "#lib/storage/sessions";
  import type { Exercise } from "#lib/types";

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
    buildPlanPrompt({
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

<PageHeader title="Generate a plan with AI" back={{ href: resolve("/routines"), label: "Back to routines" }} />

<div class="page">
  <p>
    Tell us what you want, copy the prompt, and paste it into any AI assistant. Paste the JSON it returns into Import.
    Nothing is sent from this app; the prompt is only text on your device until you paste it somewhere.
  </p>

  <form onsubmit={(e) => e.preventDefault()} novalidate>
    <TextField label="Goal" bind:value={goal} placeholder="e.g. build muscle, get stronger" />
    <NumberField label="Training days per week" mode="integer" bind:value={daysPerWeek} min={1} max={7} />
    <NumberField label="Minutes per session" mode="integer" bind:value={sessionMinutes} min={10} max={300} />
    <Select
      label="Experience"
      bind:value={experience}
      options={[
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
      ]}
    />
    <TextField label="Equipment available" bind:value={equipment} placeholder="e.g. dumbbells and a bench" />
    <TextField label="Notes" bind:value={notes} multiline hint="Injuries, preferences, exercises to avoid" />

    <Switch
      label="Include my recent training"
      bind:checked={includeHistory}
      description={`Your last ${HISTORY_WEEKS} weeks: exercise names, session counts and top sets. Off by default.`}
      disabled={!loaded || history.length === 0}
    />
    {#if includeHistory}
      <div class="preview">
        <strong>Exactly what will be added to the prompt:</strong>
        <pre>{formatHistory(history)}</pre>
      </div>
    {/if}
  </form>

  {#if failed}
    <Banner variant="warning" title="Couldn’t load your exercises">The prompt will not list catalog ids. Reload and try again.</Banner>
  {/if}

  <label class="label" for="prompt-text">Prompt ({prompt.length.toLocaleString()} characters)</label>
  <textarea id="prompt-text" bind:this={promptEl} readonly rows="10" value={prompt} spellcheck="false"></textarea>

  <div class="actions" role="status">
    <Button variant="primary" icon="copy" onclick={copy}>Copy prompt</Button>
    <Button variant="secondary" icon="import" href={resolve("/routines/import")}>Next: Import the result</Button>
  </div>
  {#if copyResult === "copied"}<p>Prompt copied.</p>{/if}
  {#if copyResult === "manual"}<p>Couldn’t copy automatically. The prompt is selected: copy it manually.</p>{/if}
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
