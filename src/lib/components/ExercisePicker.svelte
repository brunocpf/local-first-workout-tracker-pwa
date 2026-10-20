<script lang="ts">
  // Sheet for choosing one or more exercises (design.md §7.4). Single mode picks on tap; multiple mode shows an "Add N" footer.
  import type { Snippet } from "svelte";
  import { searchExercises } from "#lib/catalog/search";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { listExercises } from "#lib/storage/exercises";
  import type { Exercise } from "#lib/types";

  let {
    open = $bindable(false),
    multiple = false,
    excludeIds = [],
    title = "Add exercise",
    onpick,
    oncancel,
    createRow,
  }: {
    open?: boolean;
    multiple?: boolean;
    excludeIds?: string[];
    title?: string;
    onpick: (exercises: Exercise[]) => void;
    oncancel?: () => void;
    /** Reserved slot for the "Create custom exercise" row (T6.03). Receives the current query. */
    createRow?: Snippet<[string]>;
  } = $props();

  let exercises = $state<Exercise[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let query = $state("");
  let selectedIds = $state<string[]>([]);
  let picked = false;
  let announcement = $state("");
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!open) return;
    query = "";
    selectedIds = [];
    picked = false;
    failed = false;
    listExercises().then(
      (all) => {
        exercises = all;
        loaded = true;
      },
      () => {
        failed = true;
        loaded = true;
      },
    );
  });

  // "lower_back" → "lower back"; the first word of the line is capitalized.
  const words = (ids: string[]) => ids.map((id) => id.replaceAll("_", " "));
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const subtitle = (e: Exercise) => capitalize([...words(e.primaryMuscles), ...words(e.equipment)].join(" · "));

  const available = $derived(exercises.filter((e) => !excludeIds.includes(e.id)));
  const results = $derived.by(() => {
    const found = searchExercises(query, available);
    if (query.trim() !== "") return found;
    // Empty query: favorites first, then A–Z (stable: search already sorted by name).
    return [...found.filter((e) => e.favorite), ...found.filter((e) => !e.favorite)];
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
    announceTimer = setTimeout(() => (announcement = `${n} ${n === 1 ? "result" : "results"}`), 500);
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
      label="Search exercises"
      type="search"
      bind:value={query}
      placeholder="Search exercises"
      autocomplete="off"
      enterkeyhint="search"
    />
  </div>

  {#if failed}
    <EmptyState icon="alert-triangle" title="Couldn’t load exercises" body="Close this and try again." />
  {:else if loaded}
    {#if results.length === 0}
      <EmptyState icon="search" title={query.trim() ? `No exercise matches “${query.trim()}”` : "No exercises"} />
    {:else}
      <ul class="group" aria-label="Exercises">
        {#each results as e (e.id)}
          <li>
            <ListRow
              title={e.name}
              subtitle={subtitle(e)}
              selected={selectedIds.includes(e.id)}
              onclick={() => choose(e)}
            >
              {#snippet leading()}
                {#if e.favorite}<span class="fav"><Icon name="star" size={16} /><span class="vh">Favorite</span></span>{/if}
              {/snippet}
            </ListRow>
          </li>
        {/each}
      </ul>
    {/if}
    {#if createRow}<div class="create">{@render createRow(query.trim())}</div>{/if}
  {/if}

  <p class="vh" role="status" aria-live="polite">{announcement}</p>
{/snippet}

{#if multiple}
  <Sheet bind:open {title} size="full" {onopen} {onclose}>
    {@render content()}
    {#snippet actions()}
      <Button variant="primary" block disabled={selectedIds.length === 0} onclick={addSelected}>
        {selectedIds.length === 0
          ? "Select exercises"
          : `Add ${selectedIds.length} ${selectedIds.length === 1 ? "exercise" : "exercises"}`}
      </Button>
    {/snippet}
  </Sheet>
{:else}
  <Sheet bind:open {title} size="full" {onopen} {onclose}>
    {@render content()}
  </Sheet>
{/if}

<style>
  .search {
    margin-block-end: var(--space-3);
  }
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .group li + li {
    border-block-start: var(--border-w) solid var(--color-border);
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
