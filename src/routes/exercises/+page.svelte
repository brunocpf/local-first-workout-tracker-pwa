<script lang="ts">
  import { resolve } from "$app/paths";
  import { searchExercises, type ExerciseFilters } from "#lib/catalog/search";
  import ExerciseFiltersBar from "#lib/components/exercises/ExerciseFilters.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { listExercises } from "#lib/storage/exercises";
  import type { Exercise } from "#lib/types";

  let exercises = $state<Exercise[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let query = $state("");

  let showArchived = $state(false);
  let filters = $state<ExerciseFilters>({});

  // Reloads when the toggle changes; a stale response from an earlier toggle is dropped.
  let loadToken = 0;
  async function load() {
    const token = ++loadToken;
    try {
      const all = await listExercises({ includeArchived: showArchived });
      if (token === loadToken) exercises = all;
    } catch {
      if (token === loadToken) failed = true;
    } finally {
      if (token === loadToken) loaded = true;
    }
  }
  // Runs on mount and whenever the toggle changes.
  $effect(() => {
    void showArchived;
    void load();
  });

  // "lower_back" → "lower back"; the first word of the line is capitalized below.
  const words = (ids: string[]) => ids.map((id) => id.replaceAll("_", " "));
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const secondary = (e: Exercise) =>
    capitalize([...words(e.equipment), ...words(e.primaryMuscles)].join(" · "));

  const results = $derived(searchExercises(query, exercises, { includeArchived: showArchived, filters }));
</script>

<PageHeader title="Exercises">
  {#snippet actions()}
    <Button variant="primary" size="sm" icon="plus" href={resolve("/exercises/new")}>New exercise</Button>
  {/snippet}
</PageHeader>

<div class="search">
  <TextField
    label="Search exercises"
    type="search"
    bind:value={query}
    placeholder="Search exercises"
    autocomplete="off"
    enterkeyhint="search"
  />
  <ExerciseFiltersBar bind:filters />
  <Switch label="Show archived" bind:checked={showArchived} />
</div>

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load exercises" body="Reload the app and try again." />
{:else if loaded}
  {#if results.length === 0}
    <EmptyState icon="search" title={query.trim() ? `No exercise matches “${query.trim()}”` : "No exercises match"} />
  {:else}
    <ul class="group" aria-label="Exercises">
      {#each results as e (e.id)}
        <li><ListRow title={e.name} subtitle={secondary(e)} href={resolve(`/exercises/${e.id}` as "/")}>
            {#snippet trailing()}{#if e.archivedAt}<Badge>Archived</Badge>{/if}{/snippet}
          </ListRow></li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .search {
    padding-block: var(--space-3);
    display: grid;
    gap: var(--space-3);
  }
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  li + li {
    border-block-start: var(--border-w) solid var(--color-border);
    margin-inline-start: var(--space-4);
  }
</style>
