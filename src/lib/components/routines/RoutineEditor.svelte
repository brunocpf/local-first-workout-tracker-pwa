<script lang="ts">
  // Routine builder (PRD §7.2): the draft lives in memory; Save validates and writes, leaving with edits asks first.
  import { onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import {
    addRoutineExercise,
    moveRoutineExercise,
    removeRoutineExercise,
    replaceRoutineExercise,
    validateRoutine,
  } from "#lib/routines/edit";
  import { settings } from "#lib/settings.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { saveRoutine } from "#lib/storage/routines";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import { displayWeight } from "#lib/units";
  import type { Exercise, PrescribedSet, Routine, RoutineExercise } from "#lib/types";

  let { initial, isNew = false }: { initial: Routine; isNew?: boolean } = $props();

  // `initial` is only the starting point; the draft is ours from here on.
  // svelte-ignore state_referenced_locally
  let draft = $state<Routine>(JSON.parse(JSON.stringify(initial)));
  // svelte-ignore state_referenced_locally
  let baseline = $state(JSON.stringify(initial));
  let names = $state<Record<string, string>>({});
  let submitted = $state(false);
  let saving = $state(false);
  let pickerOpen = $state(false);
  let replacingId = $state<string>();

  const dirty = $derived(JSON.stringify($state.snapshot(draft)) !== baseline);
  const validation = $derived(validateRoutine(draft));
  const nameError = $derived(submitted ? validation.errors.find((e) => e.path === "name")?.message : undefined);
  const otherErrors = $derived(validation.errors.filter((e) => e.path !== "name"));
  const unit = $derived(settings.weightUnit);
  const back = $derived({
    href: isNew ? resolve("/routines") : resolve(`/routines/${initial.id}` as "/"),
    label: isNew ? "Routines" : "Routine",
  });

  async function loadNames(ids: string[]) {
    try {
      const found = await getExercisesByIds(ids);
      names = { ...names, ...Object.fromEntries(found.map((e) => [e.id, e.name])) };
    } catch {
      // Names are display-only; the row falls back to "Unknown exercise".
    }
  }
  onMount(() => loadNames(draft.exercises.map((e) => e.exerciseId)));

  function summary(re: RoutineExercise) {
    const sets = re.prescribedSets;
    if (sets.length === 0) return "No sets";
    const first = sets[0];
    const same = (f: (s: PrescribedSet) => unknown) => sets.every((s) => JSON.stringify(f(s)) === JSON.stringify(f(first)));
    const parts = [`${sets.length} ${sets.length === 1 ? "set" : "sets"}`];
    if (first.repRange && same((s) => s.repRange)) {
      parts[0] += ` × ${first.repRange[0] === first.repRange[1] ? first.repRange[0] : `${first.repRange[0]}–${first.repRange[1]}`}`;
    }
    if (first.targetWeight !== undefined && same((s) => s.targetWeight)) {
      parts.push(`@ ${displayWeight(first.targetWeight, unit).toLocaleString()} ${unit}`);
    }
    if (re.restSeconds !== undefined) parts.push(`rest ${re.restSeconds} s`);
    return parts.join(" ");
  }

  function picked(list: Exercise[]) {
    const target = replacingId;
    replacingId = undefined;
    for (const ex of list) {
      names[ex.id] = ex.name;
      if (target) replaceRoutineExercise(draft, target, ex.id);
      else addRoutineExercise(draft, ex.id);
    }
  }

  function remove(re: RoutineExercise) {
    const index = draft.exercises.findIndex((e) => e.id === re.id);
    const removed = removeRoutineExercise(draft, re.id);
    if (!removed) return;
    toast(`Removed ${names[removed.exerciseId] ?? "exercise"}`, {
      action: {
        label: "Undo",
        run: () => draft.exercises.splice(Math.min(index, draft.exercises.length), 0, removed),
      },
    });
  }

  async function save() {
    submitted = true;
    if (validation.errors.length > 0 || saving) return;
    saving = true;
    try {
      const saved = await saveRoutine($state.snapshot(draft) as Routine);
      baseline = JSON.stringify(saved);
      draft = JSON.parse(baseline);
      toast("Routine saved");
      await goto(resolve(`/routines/${saved.id}` as "/"));
    } catch {
      toast("Couldn't save the routine");
    } finally {
      saving = false;
    }
  }

  async function cancel() {
    await goto(isNew ? resolve("/routines") : resolve(`/routines/${initial.id}` as "/"));
  }

  beforeNavigate(async (nav) => {
    // Tab close/reload (type "leave") is covered by onbeforeunload.
    if (!dirty || nav.type === "leave") return;
    nav.cancel();
    const to = nav.to?.url;
    const ok = await confirm({
      title: "Discard changes?",
      body: "You have unsaved changes to this routine.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      danger: true,
    });
    if (ok && to) {
      baseline = JSON.stringify($state.snapshot(draft));
      // `to` is the already-resolved URL the user was heading to.
      // eslint-disable-next-line svelte/no-navigation-without-resolve
      await goto(to);
    }
  });

  function onbeforeunload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }
</script>

<svelte:window {onbeforeunload} />

<PageHeader title={isNew ? "New routine" : "Edit routine"} {back}>
  {#snippet actions()}
    <Button variant="primary" size="md" disabled={saving} onclick={save}>Save</Button>
  {/snippet}
</PageHeader>

<form
  class="form"
  onsubmit={(e) => {
    e.preventDefault();
    void save();
  }}
>
  <TextField label="Name" bind:value={draft.name} required autocomplete="off" error={nameError} />
  <TextField
    label="Description"
    multiline
    bind:value={() => draft.description ?? "", (v) => (draft.description = v.trim() === "" ? undefined : v)}
  />
</form>

{#if submitted && otherErrors.length > 0}
  <ul class="errors" role="alert">
    {#each otherErrors as e (e.path)}<li>{e.path}: {e.message}</li>{/each}
  </ul>
{/if}

<h2>Exercises</h2>
{#if draft.exercises.length === 0}
  <EmptyState icon="dumbbell" title="No exercises yet" body="Add the exercises this routine is made of." />
{:else}
  <ol class="list">
    {#each draft.exercises as re, i (re.id)}
      {@const name = names[re.exerciseId] ?? "Unknown exercise"}
      <li>
        <Card>
          <div class="row">
            <div class="text">
              <h3>{name}</h3>
              <p>{summary(re)}</p>
            </div>
            <div class="buttons">
              <IconButton icon="chevron-up" label={`Move ${name} up`} disabled={i === 0} onclick={() => moveRoutineExercise(draft, i, i - 1)} />
              <IconButton
                icon="chevron-down"
                label={`Move ${name} down`}
                disabled={i === draft.exercises.length - 1}
                onclick={() => moveRoutineExercise(draft, i, i + 1)}
              />
            </div>
          </div>
          <div class="row-actions">
            <Button
              size="sm"
              variant="secondary"
              onclick={() => {
                replacingId = re.id;
                pickerOpen = true;
              }}>Replace {name}</Button
            >
            <Button size="sm" variant="danger" icon="trash" onclick={() => remove(re)}>Remove {name}</Button>
          </div>
        </Card>
      </li>
    {/each}
  </ol>
{/if}

<div class="add">
  <Button
    variant="secondary"
    icon="plus"
    onclick={() => {
      replacingId = undefined;
      pickerOpen = true;
    }}>Add exercise</Button
  >
</div>

<ExercisePicker
  bind:open={pickerOpen}
  multiple={!replacingId}
  title={replacingId ? "Replace exercise" : "Add exercise"}
  onpick={picked}
  oncancel={() => (replacingId = undefined)}
/>

<div class="footer">
  <Button variant="ghost" onclick={cancel}>Cancel</Button>
  <Button variant="primary" disabled={saving} onclick={save}>Save routine</Button>
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: var(--space-5) 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .errors {
    margin: var(--space-3) 0 0;
    padding-inline-start: var(--space-4);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .text {
    min-inline-size: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }
  p {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .buttons {
    display: flex;
    flex-shrink: 0;
  }
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-block-start: var(--space-3);
  }
  .add {
    margin-block-start: var(--space-3);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-block: var(--space-6);
  }
</style>
