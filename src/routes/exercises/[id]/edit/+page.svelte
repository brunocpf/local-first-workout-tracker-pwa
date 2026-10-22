<script lang="ts">
  import { t, tn } from "#lib/i18n.svelte";
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
  const back = $derived({ href: detail(), label: t("ex.backTo") });

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
    }, t("ex.saveFailed"));

  const toggleArchive = () =>
    run(async () => {
      if (!exercise) return;
      const archive = !exercise.archivedAt;
      await setArchived(id, archive);
      exercise = await getExercise(id);
      toast(archive ? t("ex.archivedToast") : t("ex.restoredToast"));
    }, t("ex.updateFailed"));

  async function remove() {
    if (!exercise) return;
    const ok = await confirm({
      title: t("ex.deleteTitle", { name: exercise.name }),
      body: t("ex.deleteBody"),
      confirmLabel: t("ex.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await deleteCustomExercise(id);
      toast(t("ex.deleted"));
      await goto(resolve("/exercises"));
    }, t("ex.deleteFailed"));
  }

  async function merge([target]: Exercise[]) {
    if (!exercise || !target) return;
    const fromName = exercise.name;
    await run(async () => {
      const counts = await mergePreview(id, target.id);
      const ok = await confirm({
        title: t("ex.mergeTitle", { name: target.name }),
        body: t("ex.mergeBody", { workouts: tn("count.workouts", counts.sessions), routines: tn("count.routines", counts.routines), target: target.name, from: fromName }),
        confirmLabel: t("ex.mergeConfirm"),
        danger: true,
      });
      if (!ok) return;
      await mergeExercises(id, target.id);
      toast(t("ex.merged"));
      await goto(resolve(`/exercises/${target.id}` as "/"));
    }, t("ex.mergeFailed"));
  }
</script>

{#if failed}
  <PageHeader title={t("ex.editTitle")} {back} />
  <EmptyState icon="alert-triangle" title={t("ex.loadOneFailed")} body={t("history.reloadHint")} />
{:else if loaded && !exercise}
  <PageHeader title={t("ex.editTitle")} {back} />
  <EmptyState icon="search" title={t("ex.notFound")} />
{:else if exercise && !exercise.isCustom}
  <PageHeader title={t("ex.editTitle")} {back} />
  <EmptyState icon="info" title={t("ex.builtinLocked")} />
{:else if exercise}
  <PageHeader title={t("ex.editTitle")} {back} />
  {#if error}<Banner variant="danger" urgent>{error}</Banner>{/if}
  {#if exercise.archivedAt}<Banner variant="info">{t("ex.archivedBanner")}</Banner>{/if}

  <div class="body">
    <ExerciseForm
      initial={exercise}
      submitLabel={t("ex.saveChanges")}
      onsubmit={save}
      oncancel={() => goto(resolve(`/exercises/${id}` as "/"))}
    />

    <section>
      <h2>{t("ex.manage")}</h2>
      <div class="manage">
        <Button block onclick={toggleArchive}>{exercise.archivedAt ? t("ex.unarchive") : t("ex.archive")}</Button>
        <Button block onclick={() => (mergeOpen = true)}>{t("ex.mergeInto")}</Button>
        {#if !referenced}<Button variant="danger" block onclick={remove}>{t("ex.deleteConfirm")}</Button>{/if}
      </div>
      {#if referenced}<p class="hint">{t("ex.usedHint")}</p>{/if}
    </section>
  </div>

  <ExercisePicker bind:open={mergeOpen} title={t("ex.mergeInto")} excludeIds={[id]} allowCreate={false} onpick={merge} />
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
