<script lang="ts">
  import { equipmentLabel, muscleLabel } from "#lib/catalog/labels";
  import { t } from "#lib/i18n.svelte";
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
  import { localizeExercises } from "#lib/catalog/localize";
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
      if (token === loadToken) exercises = localizeExercises(all);
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

  const secondary = (e: Exercise) => [...e.equipment.map(equipmentLabel), ...e.primaryMuscles.map(muscleLabel)].join(" · ");

  const results = $derived(searchExercises(query, exercises, { includeArchived: showArchived, filters }));
</script>

<PageHeader title={t("ex.title")}>
  {#snippet actions()}
    <Button variant="primary" size="sm" icon="plus" href={resolve("/exercises/new")}>{t("ex.new")}</Button>
  {/snippet}
</PageHeader>

<div class="search">
  <TextField
    label={t("ex.search")}
    type="search"
    bind:value={query}
    placeholder={t("ex.search")}
    autocomplete="off"
    enterkeyhint="search"
  />
  <ExerciseFiltersBar bind:filters />
  <Switch label={t("ex.showArchived")} bind:checked={showArchived} />
</div>

{#if failed}
  <EmptyState icon="alert-triangle" title={t("ex.loadFailed")} body={t("history.reloadHint")} />
{:else if loaded}
  {#if results.length === 0}
    <EmptyState icon="search" title={query.trim() ? t("ex.noMatchFor", { query: query.trim() }) : t("ex.noMatch")} />
  {:else}
    <ul class="group" aria-label={t("ex.title")}>
      {#each results as e (e.id)}
        <li><ListRow title={e.name} subtitle={secondary(e)} href={resolve(`/exercises/${e.id}` as "/")}>
            {#snippet trailing()}{#if e.archivedAt}<Badge>{t("ex.archived")}</Badge>{/if}{/snippet}
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
</style>
