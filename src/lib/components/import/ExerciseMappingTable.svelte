<script lang="ts">
  // Maps each distinct Hevy exercise title to a catalog exercise, a new custom exercise, or "skip" (docs/hevy-import.md §5).
  // Pure review state: nothing is written here; the parent builds the import plan from `choices`.
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import type { HevyNameResolution } from "#lib/imports/hevy/exerciseMap";
  import type { HevyExerciseSummary } from "#lib/imports/hevy/normalize";
  import type { HevyChoice, HevyChoiceSource } from "#lib/imports/hevy/plan";
  import type { Exercise } from "#lib/types";

  let {
    exercises,
    catalog,
    resolutions,
    sources,
    choices = $bindable({}),
  }: {
    exercises: readonly HevyExerciseSummary[];
    catalog: readonly Exercise[];
    resolutions: Readonly<Record<string, HevyNameResolution>>;
    sources: Readonly<Record<string, HevyChoiceSource>>;
    choices: Record<string, HevyChoice | undefined>;
  } = $props();

  const byId = $derived(new Map(catalog.map((x) => [x.id, x])));
  const undecided = $derived(exercises.filter((e) => choices[e.title] === undefined));

  let pickFor = $state<string>();
  let pickerOpen = $state(false);

  const PICK = "pick";
  const CREATE = "create";
  const SKIP = "skip";
  const valueOf = (title: string): string => {
    const c = choices[title];
    return c === undefined ? "" : c.kind === "exercise" ? `ex:${c.exerciseId}` : c.kind;
  };
  const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

  function optionsFor(title: string) {
    const out: { value: string; label: string }[] = [];
    const add = (value: string, label: string) => {
      if (!out.some((o) => o.value === value)) out.push({ value, label });
    };
    const c = choices[title];
    if (c === undefined) add("", "Choose…");
    if (c?.kind === "exercise") add(`ex:${c.exerciseId}`, byId.get(c.exerciseId)?.name ?? "Unknown exercise");
    const r = resolutions[title];
    if (r?.status === "suggested")
      for (const cand of r.candidates) {
        const x = byId.get(cand.exerciseId);
        if (x) add(`ex:${x.id}`, `Suggested: ${x.name}`);
      }
    add(PICK, "Choose from catalog…");
    add(CREATE, `Create “${clip(title)}”`);
    add(SKIP, "Skip this exercise");
    return out;
  }

  function choose(title: string, value: string) {
    if (value === PICK) {
      pickFor = title;
      pickerOpen = true;
    } else if (value === CREATE || value === SKIP) choices[title] = { kind: value };
    else if (value.startsWith("ex:")) choices[title] = { kind: "exercise", exerciseId: value.slice(3) };
  }

  function picked([exercise]: Exercise[]) {
    if (pickFor !== undefined && exercise) choices[pickFor] = { kind: "exercise", exerciseId: exercise.id };
  }

  function fillUndecided(kind: "create" | "skip") {
    for (const e of undecided) choices[e.title] = { kind };
  }

  function status(title: string): { variant: "success" | "info" | "warning" | "neutral"; label: string } {
    const c = choices[title];
    if (c === undefined) return { variant: "warning", label: "Needs a decision" };
    if (c.kind === "skip") return { variant: "neutral", label: "Skipped" };
    if (c.kind === "create") return { variant: "info", label: "New custom exercise" };
    const s = sources[title];
    return s === "remembered" ? { variant: "success", label: "Remembered" } : s === "matched" ? { variant: "success", label: "Matched" } : { variant: "info", label: "Chosen" };
  }
</script>

<div class="table">
  {#if undecided.length > 0}
    <div class="bulk">
      <p>{undecided.length} exercise{undecided.length === 1 ? "" : "s"} need{undecided.length === 1 ? "s" : ""} a decision.</p>
      <div class="buttons">
        <Button size="sm" onclick={() => fillUndecided("create")}>Create all as custom</Button>
        <Button size="sm" onclick={() => fillUndecided("skip")}>Skip all</Button>
      </div>
    </div>
  {/if}
  <ul>
    {#each exercises as e (e.title)}
      {@const s = status(e.title)}
      <li>
        <Select
          label={e.title}
          hint="{e.sets} set{e.sets === 1 ? '' : 's'} in {e.workouts} workout{e.workouts === 1 ? '' : 's'}"
          options={optionsFor(e.title)}
          bind:value={() => valueOf(e.title), (v) => choose(e.title, v)}
        />
        <Badge variant={s.variant}>{s.label}</Badge>
      </li>
    {/each}
  </ul>
</div>

<ExercisePicker bind:open={pickerOpen} title="Map to exercise" allowCreate={false} onpick={picked} />

<style>
  .table,
  ul {
    display: grid;
    gap: var(--space-3);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    min-inline-size: 0;
  }
  li :global(.field) {
    inline-size: 100%;
    min-inline-size: 0;
  }
  li :global(label) {
    overflow-wrap: anywhere;
  }
  .bulk {
    display: grid;
    gap: var(--space-2);
  }
  .bulk p {
    margin: 0;
    color: var(--color-text-muted);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
