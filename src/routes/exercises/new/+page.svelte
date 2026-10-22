<script lang="ts">
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
      error = "Couldn’t save the exercise. Try again.";
    }
  }
</script>

<PageHeader title="New exercise" back={{ href: resolve("/exercises"), label: "Back to exercises" }} />
{#if error}<Banner variant="danger" urgent>{error}</Banner>{/if}
<div class="body"><ExerciseForm submitLabel="Create exercise" onsubmit={save} /></div>

<style>
  .body {
    padding-block: var(--space-3);
  }
</style>
