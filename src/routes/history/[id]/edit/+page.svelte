<script lang="ts">
  // Edits a completed session on a local `$state` copy: not the active store, no rest timer, no prefill-on-complete.
  import { onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import ExerciseCard from "#lib/components/workout/ExerciseCard.svelte";
  import { newId } from "#lib/ids";
  import {
    addExercise,
    addSet,
    completeSet,
    createSessionExercise,
    duplicateSet,
    moveExercise,
    removeExercise,
    removeSet,
    uncompleteSet,
    updateSet,
    type SetPatch,
  } from "#lib/logger/workout";
  import { settings } from "#lib/settings.svelte";
  import { getSession, InvalidSessionEditError, updateCompletedSession } from "#lib/storage/sessions";
  import { utcToZonedLocal, zonedLocalToUtc } from "#lib/time";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Exercise, SessionExercise, WorkoutSession } from "#lib/types";

  let draft = $state<WorkoutSession>();
  let loaded = $state(false);
  let failed = $state(false);
  let saving = $state(false);
  let pickerOpen = $state(false);
  let baseline = "";

  // Start/duration are edited as form fields (in the session's zone) and applied to the timestamps on save.
  let startLocal = $state("");
  let minutes = $state<number | null>(null);
  let error = $state("");

  const back = $derived({ href: resolve(`/history/${page.params.id}` as "/"), label: "Session" });
  const snapshot = () => JSON.stringify([$state.snapshot(draft), startLocal, minutes]);
  const dirty = $derived(loaded && draft !== undefined && snapshot() !== baseline);

  onMount(async () => {
    try {
      const s = await getSession(page.params.id ?? "");
      if (s?.status === "completed" && s.endedAt) {
        draft = s;
        startLocal = utcToZonedLocal(s.startedAt, s.timeZone);
        minutes = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000);
        baseline = snapshot();
      }
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const unit = $derived(settings.weightUnit);

  function withExercise(id: string, fn: (e: SessionExercise) => void) {
    const e = draft?.exercises.find((x) => x.id === id);
    if (e) fn(e);
  }

  function addPicked(picked: Exercise[]) {
    if (!draft) return;
    for (const e of picked) {
      const se = createSessionExercise(e);
      se.sets.push({ id: newId(), type: "normal" });
      addExercise(draft, se);
    }
  }

  function move(id: string, direction: -1 | 1) {
    if (!draft) return;
    const i = draft.exercises.findIndex((e) => e.id === id);
    if (i >= 0) moveExercise(draft, id, i + direction);
  }

  function toggleSet(id: string, setId: string) {
    withExercise(id, (e) => {
      const set = e.sets.find((x) => x.id === setId);
      if (!set || !draft) return;
      if (set.completedAt) uncompleteSet(set);
      else completeSet(set, {}, draft.endedAt ?? draft.startedAt);
    });
  }

  async function save() {
    if (!draft || saving) return;
    const startedAt = zonedLocalToUtc(startLocal, draft.timeZone);
    if (!startedAt || minutes === null) {
      error = "Enter a start date and time and a duration.";
      return;
    }
    error = "";
    const next = $state.snapshot(draft);
    const [startLocal0, minutes0] = JSON.parse(baseline).slice(1);
    // Leave the stored timestamps (and their seconds) alone unless the user changed the field.
    if (startLocal !== startLocal0) next.startedAt = startedAt;
    if (startLocal !== startLocal0 || minutes !== minutes0) next.endedAt = new Date(Date.parse(next.startedAt) + minutes * 60_000).toISOString();
    next.name = next.name.trim() || draft.name;
    if (!next.notes?.trim()) delete next.notes;
    const ok = await confirm({
      title: "Save changes?",
      body: "Stats and PRs will be recalculated from the edited session.",
      confirmLabel: "Save changes",
    });
    if (!ok) return;
    saving = true;
    try {
      await updateCompletedSession(next);
      baseline = snapshot();
      toast("Session updated");
      await goto(resolve(`/history/${page.params.id}` as "/"), { replaceState: true });
    } catch (e) {
      toast(e instanceof InvalidSessionEditError ? e.message : "Couldn’t save the session");
    } finally {
      saving = false;
    }
  }

  async function cancel() {
    await goto(resolve(`/history/${page.params.id}` as "/"));
  }

  beforeNavigate(async (nav) => {
    if (!dirty || nav.type === "leave") return;
    nav.cancel();
    const to = nav.to?.url;
    const ok = await confirm({
      title: "Discard changes?",
      body: "You have unsaved changes to this session.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      danger: true,
    });
    if (ok && to) {
      baseline = snapshot();
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
<svelte:head><title>Edit session · Workouts</title></svelte:head>

{#if !loaded}
  <PageHeader title="Edit session" {back} />
{:else if failed}
  <PageHeader title="Edit session" {back} />
  <EmptyState icon="alert-triangle" title="Couldn’t load this session" body="Reload the app and try again." />
{:else if !draft}
  <PageHeader title="Edit session" back={{ href: resolve("/history"), label: "History" }} />
  <EmptyState icon="history" title="Session not found" body="It may have been deleted.">
    {#snippet action()}<Button variant="primary" href={resolve("/history")}>Back to History</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title="Edit session" {back}>
    {#snippet actions()}
      <Button variant="ghost" size="md" disabled={saving} onclick={cancel}>Cancel</Button>
      <Button variant="primary" size="md" disabled={saving} onclick={save}>Save</Button>
    {/snippet}
  </PageHeader>

  <div class="form">
    <TextField label="Name" bind:value={draft.name} required />
    <TextField
      label="Start"
      type="datetime-local"
      bind:value={startLocal}
      required
      hint="In the time zone of the workout ({draft.timeZone})."
      {error}
    />
    <NumberField label="Duration" bind:value={minutes} mode="integer" suffix="min" min={0} />
    <TextField label="Notes" multiline bind:value={() => draft?.notes ?? "", (v) => draft && (draft.notes = v)} />
  </div>

  <div class="exercises">
    {#each draft.exercises as exercise, i (exercise.id)}
      <ExerciseCard
        {exercise}
        index={i}
        count={draft.exercises.length}
        onremove={() => draft && removeExercise(draft, exercise.id)}
        onmove={(d) => move(exercise.id, d)}
        onnotes={(n) =>
          withExercise(exercise.id, (e) => {
            if (n) e.notes = n;
            else delete e.notes;
          })}
        defaultRestSeconds={settings.defaultRestSeconds}
        onrest={(seconds) =>
          withExercise(exercise.id, (e) => {
            if (seconds === undefined) delete e.restSeconds;
            else e.restSeconds = seconds;
          })}
        {unit}
        onaddset={() => withExercise(exercise.id, (e) => addSet(e))}
        onsetchange={(setId: string, patch: SetPatch) => withExercise(exercise.id, (e) => updateSet(e, setId, patch))}
        ontoggleset={(setId) => toggleSet(exercise.id, setId)}
        onduplicateset={(setId) => withExercise(exercise.id, (e) => duplicateSet(e, setId))}
        ontogglewarmup={(setId) =>
          withExercise(exercise.id, (e) => {
            const set = e.sets.find((x) => x.id === setId);
            if (set) updateSet(e, setId, { type: set.type === "warmup" ? "normal" : "warmup" });
          })}
        ondeleteset={(setId) => withExercise(exercise.id, (e) => removeSet(e, setId))}
      />
    {/each}
    <Button block icon="plus" onclick={() => (pickerOpen = true)}>Add exercise</Button>
  </div>
  <ExercisePicker bind:open={pickerOpen} multiple onpick={addPicked} />
{/if}

<style>
  .form,
  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block: var(--space-4);
  }
</style>
