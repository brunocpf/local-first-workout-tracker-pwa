<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ExerciseForm, { type ExerciseValues } from "#lib/components/exercises/ExerciseForm.svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import {
    deleteCustomExercise,
    getExercise,
    isExerciseReferenced,
    mergeExercises,
    mergePreview,
    setArchived,
    updateCustomExercise,
  } from "#lib/storage/exercises";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Exercise } from "#lib/types";

  const id = page.params.id ?? "";
  let exercise = $state<Exercise>();
  let referenced = $state(true);
  let loaded = $state(false);
  let failed = $state(false);
  let error = $state("");
  let mergeOpen = $state(false);

  onMount(async () => {
    try {
      exercise = await getExercise(id);
      if (exercise) referenced = await isExerciseReferenced(id);
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const detail = () => resolve(`/exercises/${id}` as "/");
  const back = $derived({ href: detail(), label: "Back to exercise" });

  async function run(action: () => Promise<void>, message: string) {
    error = "";
    try {
      await action();
    } catch {
      error = message;
    }
  }

  const save = (values: ExerciseValues) =>
    run(async () => {
      await updateCustomExercise(id, values);
      await goto(resolve(`/exercises/${id}` as "/"));
    }, "Couldn’t save the exercise. Try again.");

  const toggleArchive = () =>
    run(async () => {
      if (!exercise) return;
      const archive = !exercise.archivedAt;
      await setArchived(id, archive);
      exercise = await getExercise(id);
      toast(archive ? "Exercise archived" : "Exercise restored");
    }, "Couldn’t update the exercise. Try again.");

  async function remove() {
    if (!exercise) return;
    const ok = await confirm({
      title: `Delete “${exercise.name}”?`,
      body: "It isn’t used in any workout or routine. This can’t be undone.",
      confirmLabel: "Delete exercise",
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await deleteCustomExercise(id);
      toast("Exercise deleted");
      await goto(resolve("/exercises"));
    }, "Couldn’t delete the exercise. It may now be in use; archive it instead.");
  }

  async function merge([target]: Exercise[]) {
    if (!exercise || !target) return;
    const fromName = exercise.name;
    await run(async () => {
      const counts = await mergePreview(id, target.id);
      const n = (c: number, one: string) => `${c} ${one}${c === 1 ? "" : "s"}`;
      const ok = await confirm({
        title: `Merge into “${target.name}”?`,
        body: `${n(counts.sessions, "workout")} and ${n(counts.routines, "routine")} will use “${target.name}” instead. “${fromName}” will be deleted and kept as an alias. This can’t be undone.`,
        confirmLabel: "Merge exercises",
        danger: true,
      });
      if (!ok) return;
      await mergeExercises(id, target.id);
      toast("Exercises merged");
      await goto(resolve(`/exercises/${target.id}` as "/"));
    }, "Couldn’t merge the exercises. Nothing was changed.");
  }
</script>

{#if failed}
  <PageHeader title="Edit exercise" {back} />
  <EmptyState icon="alert-triangle" title="Couldn’t load exercise" body="Reload the app and try again." />
{:else if loaded && !exercise}
  <PageHeader title="Edit exercise" {back} />
  <EmptyState icon="search" title="Exercise not found" />
{:else if exercise && !exercise.isCustom}
  <PageHeader title="Edit exercise" {back} />
  <EmptyState icon="info" title="Built-in exercises can’t be edited" />
{:else if exercise}
  <PageHeader title="Edit exercise" {back} />
  {#if error}<Banner variant="danger" urgent>{error}</Banner>{/if}
  {#if exercise.archivedAt}<Banner variant="info">This exercise is archived and hidden from pickers.</Banner>{/if}

  <div class="body">
    <ExerciseForm
      initial={exercise}
      submitLabel="Save changes"
      onsubmit={save}
      oncancel={() => goto(resolve(`/exercises/${id}` as "/"))}
    />

    <section>
      <h2>Manage</h2>
      <div class="manage">
        <Button block onclick={toggleArchive}>{exercise.archivedAt ? "Unarchive" : "Archive"}</Button>
        <Button block onclick={() => (mergeOpen = true)}>Merge into…</Button>
        {#if !referenced}<Button variant="danger" block onclick={remove}>Delete exercise</Button>{/if}
      </div>
      {#if referenced}<p class="hint">Used in workouts or routines, so it can be archived or merged but not deleted.</p>{/if}
    </section>
  </div>

  <ExercisePicker bind:open={mergeOpen} title="Merge into…" excludeIds={[id]} allowCreate={false} onpick={merge} />
{/if}

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding-block: var(--space-3);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .manage {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .hint {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
