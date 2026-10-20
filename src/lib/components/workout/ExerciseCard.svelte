<script lang="ts">
  // Presentational exercise card (design.md §8): the page decides how to persist. Reused for past sessions (T4.06).
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import type { SessionExercise } from "#lib/types";

  let {
    exercise,
    index,
    count,
    onremove,
    onmove,
    onnotes,
  }: {
    exercise: SessionExercise;
    index: number;
    count: number;
    onremove: () => void;
    /** `-1` moves up, `1` moves down. */
    onmove: (direction: -1 | 1) => void;
    onnotes: (notes: string) => void;
  } = $props();

  let menuOpen = $state(false);
  let notesOpen = $state(false);
  let draft = $state("");

  function openNotes() {
    menuOpen = false;
    draft = exercise.notes ?? "";
    notesOpen = true;
  }

  function saveNotes() {
    notesOpen = false;
    const notes = draft.trim();
    if (notes !== (exercise.notes ?? "")) onnotes(notes);
  }

  function act(fn: () => void) {
    menuOpen = false;
    fn();
  }
</script>

<Card as="article">
  {#snippet header()}
    <div class="head">
      <h2 class="name">{exercise.exerciseNameSnapshot}</h2>
      <IconButton icon="more-vertical" label="Exercise options for {exercise.exerciseNameSnapshot}" onclick={() => (menuOpen = true)} />
    </div>
  {/snippet}

  {#if exercise.notes}<p class="notes">Notes: {exercise.notes}</p>{/if}
  <!-- Placeholder until set logging (T2.07). -->
  <ol class="sets" aria-label="Sets">
    {#each exercise.sets as set, i (set.id)}
      <li>Set {i + 1}</li>
    {/each}
  </ol>
</Card>

<Sheet bind:open={menuOpen} title={exercise.exerciseNameSnapshot}>
  <div class="menu">
    <Button block icon="chevron-up" disabled={index === 0} onclick={() => act(() => onmove(-1))}>Move up</Button>
    <Button block icon="chevron-down" disabled={index === count - 1} onclick={() => act(() => onmove(1))}>Move down</Button>
    <Button block icon="edit" onclick={openNotes}>Notes</Button>
    <Button block variant="danger" icon="trash" onclick={() => act(onremove)}>Remove exercise</Button>
  </div>
</Sheet>

<Dialog bind:open={notesOpen} title="Exercise notes">
  <TextField label="Notes" bind:value={draft} multiline />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (notesOpen = false)}>Cancel</Button>
    <Button variant="primary" onclick={saveNotes}>Save</Button>
  {/snippet}
</Dialog>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .name {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .notes {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: pre-wrap;
  }
  .sets {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
