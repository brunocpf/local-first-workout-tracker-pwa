<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import RoutineEditor from "#lib/components/routines/RoutineEditor.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { getRoutine } from "#lib/storage/routines";
  import type { Routine } from "#lib/types";

  let routine = $state<Routine>();
  let loaded = $state(false);
  let failed = $state(false);
  const back = { href: resolve("/routines"), label: "Routines" };

  onMount(async () => {
    try {
      routine = await getRoutine(page.params.id ?? "");
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });
</script>

{#if failed}
  <PageHeader title="Edit routine" {back} />
  <EmptyState icon="alert-triangle" title="Couldn’t load the routine" body="Reload the app and try again." />
{:else if !loaded}
  <PageHeader title="Edit routine" {back} />
{:else if !routine}
  <PageHeader title="Edit routine" {back} />
  <EmptyState icon="list" title="Routine not found" body="It may have been deleted.">
    {#snippet action()}<Button variant="primary" href={resolve("/routines")}>Back to Routines</Button>{/snippet}
  </EmptyState>
{:else}
  <RoutineEditor initial={routine} />
{/if}
