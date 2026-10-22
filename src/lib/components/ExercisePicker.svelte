<script lang="ts">
  import { equipmentLabel, muscleLabel } from "#lib/catalog/labels";
  import { t, tn } from "#lib/i18n.svelte";
  // Sheet for choosing one or more exercises (design.md §7.4). Single mode picks on tap; multiple mode shows an "Add N" footer.
  import type { Snippet } from "svelte";
  import { groupForPicker, recentExerciseIds, searchExercises, type ExerciseFilters } from "#lib/catalog/search";
  import ExerciseFiltersBar from "#lib/components/exercises/ExerciseFilters.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import ExerciseForm, { type ExerciseValues } from "#lib/components/exercises/ExerciseForm.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { createCustomExercise, listExercises } from "#lib/storage/exercises";
  import { localizeExercises } from "#lib/catalog/localize";
  import { listCompletedSessions } from "#lib/storage/sessions";
  import type { Exercise } from "#lib/types";

  let {
    open = $bindable(false),
    multiple = false,
    excludeIds = [],
    title,
    onpick,
    oncancel,
    createRow,
    allowCreate = true,
  }: {
    open?: boolean;
    multiple?: boolean;
    excludeIds?: string[];
    title?: string;
    onpick: (exercises: Exercise[]) => void;
    oncancel?: () => void;
    /** Replaces the built-in "Create “query”" row. Receives the current query. */
    createRow?: Snippet<[string]>;
    /** Show the built-in create row. Turn off where creating must not write straight to the catalog. */
    allowCreate?: boolean;
  } = $props();

  let exercises = $state<Exercise[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let query = $state("");
  let filters = $state<ExerciseFilters>({});
  let recentIds = $state<string[]>([]);
  let selectedIds = $state<string[]>([]);
  let picked = false;
  let announcement = $state("");
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!open) return;
    query = "";
    filters = {};
    selectedIds = [];
    picked = false;
    failed = false;
    // Recents are a nicety: a failure here must not block picking.
    listCompletedSessions({ limit: 5 }).then(
      (sessions) => (recentIds = recentExerciseIds(sessions, 5)),
      () => (recentIds = []),
    );
    listExercises().then(
      (all) => {
        exercises = localizeExercises(all);
        loaded = true;
      },
      () => {
        failed = true;
        loaded = true;
      },
    );
  });

  const subtitle = (e: Exercise) => [...e.primaryMuscles.map(muscleLabel), ...e.equipment.map(equipmentLabel)].join(" · ");

  const available = $derived(exercises.filter((e) => !excludeIds.includes(e.id)));
  const results = $derived(searchExercises(query, available, { filters }));
  // Empty query: Favorites, then Recent (last 5 completed sessions), then all. Typing or filtering by favorites shows one ranked list.
  const grouped = $derived(query.trim() === "" && !filters.favoritesOnly);
  const groups = $derived.by(() => {
    if (!grouped) return [{ label: t("picker.exercises"), items: results }];
    const g = groupForPicker(results, recentIds);
    return [
      { label: t("picker.favorites"), items: g.favorites },
      { label: t("picker.recent"), items: g.recent },
      { label: g.favorites.length + g.recent.length > 0 ? t("picker.all") : t("picker.exercises"), items: g.all },
    ].filter((x) => x.items.length > 0);
  });

  // Polite result count, debounced so it doesn't chatter while typing.
  $effect(() => {
    const n = results.length;
    const q = query.trim();
    clearTimeout(announceTimer);
    if (!q) {
      announcement = "";
      return;
    }
    announceTimer = setTimeout(() => (announcement = tn("picker.results", n)), 500);
    return () => clearTimeout(announceTimer);
  });

  function finish(chosen: Exercise[]) {
    picked = true;
    open = false;
    onpick(chosen);
  }

  function choose(e: Exercise) {
    if (!multiple) return finish([e]);
    selectedIds = selectedIds.includes(e.id) ? selectedIds.filter((id) => id !== e.id) : [...selectedIds, e.id];
  }

  function addSelected() {
    // Keep the order the user selected them in.
    const byId = new Map(exercises.map((e) => [e.id, e]));
    finish(selectedIds.map((id) => byId.get(id)).filter((e): e is Exercise => e !== undefined));
  }

  let creating = $state(false);
  let createName = $state("");
  let createError = $state("");

  function startCreate() {
    createName = query.trim();
    createError = "";
    creating = true;
  }

  // The new exercise is returned like a pick, so the caller adds it to the workout right away.
  async function create(values: ExerciseValues) {
    createError = "";
    try {
      const created = await createCustomExercise(values);
      creating = false;
      finish([created]);
    } catch {
      createError = t("ex.saveFailed");
    }
  }

  function onclose() {
    if (!picked) oncancel?.();
  }

  // Autofocus only with a fine pointer: on touch the keyboard would cover the list.
  function onopen(dialog: HTMLDialogElement) {
    if (globalThis.matchMedia?.("(pointer: fine)").matches) {
      dialog.querySelector<HTMLInputElement>("input[type=search]")?.focus();
    }
  }
</script>

{#snippet content()}
  <div class="search">
    <TextField
      label={t("ex.search")}
      type="search"
      bind:value={query}
      placeholder={t("ex.search")}
      autocomplete="off"
      enterkeyhint="search"
    />
  </div>
  <ExerciseFiltersBar bind:filters />

  {#if failed}
    <EmptyState icon="alert-triangle" title={t("ex.loadFailed")} body={t("picker.closeRetry")} />
  {:else if loaded}
    {#if results.length === 0}
      <EmptyState icon="search" title={query.trim() ? t("ex.noMatchFor", { query: query.trim() }) : t("ex.noMatch")} />
    {:else}
      {#each groups as g (g.label)}
        <h3 class="heading">{g.label}</h3>
        <ul class="group" aria-label={g.label}>
          {#each g.items as e (e.id)}
            <li>
              <ListRow
                title={e.name}
                subtitle={subtitle(e)}
                selected={selectedIds.includes(e.id)}
                onclick={() => choose(e)}
              >
                {#snippet leading()}
                  {#if e.favorite}<span class="fav"><Icon name="star" size={16} /><span class="vh">{t("picker.favorite")}</span></span>{/if}
                {/snippet}
              </ListRow>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
    {#if createRow}
      <div class="create">{@render createRow(query.trim())}</div>
    {:else if allowCreate}
      <div class="create">
        <Button variant="secondary" block icon="plus" onclick={startCreate}>
          {query.trim() ? t("picker.createNamed", { name: query.trim() }) : t("picker.createCustom")}
        </Button>
      </div>
    {/if}
  {/if}

  <p class="vh" role="status" aria-live="polite">{announcement}</p>
{/snippet}

{#if multiple}
  <Sheet bind:open title={title ?? t("picker.add")} size="full" {onopen} {onclose}>
    {@render content()}
    {#snippet actions()}
      <Button variant="primary" block disabled={selectedIds.length === 0} onclick={addSelected}>
        {selectedIds.length === 0 ? t("picker.select") : tn("picker.addCount", selectedIds.length)}
      </Button>
    {/snippet}
  </Sheet>
{:else}
  <Sheet bind:open title={title ?? t("picker.add")} size="full" {onopen} {onclose}>
    {@render content()}
  </Sheet>
{/if}

{#if allowCreate && !createRow}
  <Sheet bind:open={creating} title={t("picker.newTitle")} size="full">
    {#if createError}<p class="error" role="alert">{createError}</p>{/if}
    {#key createName}
      <ExerciseForm
        initial={{ name: createName }}
        submitLabel={t("picker.createAdd")}
        onsubmit={create}
        oncancel={() => (creating = false)}
      />
    {/key}
  </Sheet>
{/if}

<style>
  .error {
    margin: 0 0 var(--space-3);
    color: var(--color-danger-text);
  }
  .search {
    margin-block-end: var(--space-3);
  }
  .heading {
    margin: var(--space-3) 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-weight: 600;
  }
  .fav {
    display: flex;
    color: var(--color-accent-text);
  }
  .create {
    margin-block-start: var(--space-3);
  }
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
