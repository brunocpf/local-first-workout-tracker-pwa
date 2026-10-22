<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import ExerciseForm, { type ExerciseValues } from "#lib/components/exercises/ExerciseForm.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { createCustomExercise } from "#lib/storage/exercises";

  let error = $state("");

  async function save(values: ExerciseValues) {
    error = "";
    try {
      const created = await createCustomExercise(values);
      await goto(resolve(`/exercises/${created.id}` as "/"));
    } catch {
      error = t("ex.saveFailed");
    }
  }
</script>

<PageHeader title={t("ex.createTitle")} back={{ href: resolve("/exercises"), label: t("ex.back") }} />
{#if error}<Banner variant="danger" urgent>{error}</Banner>{/if}
<div class="body"><ExerciseForm submitLabel={t("ex.create")} onsubmit={save} /></div>

<style>
  .body {
    padding-block: var(--space-3);
  }
</style>
