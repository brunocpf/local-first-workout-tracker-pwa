<script lang="ts">
  // Presentational exercise card (design.md §8): the page decides how to persist. Reused for past sessions (T4.06).
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import SetRow from "#lib/components/workout/SetRow.svelte";
  import { alignPrevious, prefillFor, type SetValues } from "#lib/logger/previousValues";
  import type { SetPatch } from "#lib/logger/workout";
  import type { LoggedSet, SessionExercise, WeightUnit } from "#lib/types";

  let {
    exercise,
    index,
    count,
    onremove,
    onmove,
    onnotes,
    defaultRestSeconds,
    onrest,
    unit,
    previousSets = [],
    prSetIds,
    onaddset,
    onsetchange,
    ontoggleset,
    onduplicateset,
    ontogglewarmup,
    ondeleteset,
  }: {
    exercise: SessionExercise;
    index: number;
    count: number;
    onremove: () => void;
    /** `-1` moves up, `1` moves down. */
    onmove: (direction: -1 | 1) => void;
    onnotes: (notes: string) => void;
    /** From settings; what "Default" means in the Rest time dialog. */
    defaultRestSeconds: number;
    /** `undefined` clears the override (back to the default). */
    onrest: (seconds: number | undefined) => void;
    unit: WeightUnit;
    /** Sets of this exercise from the last completed session (`loadPreviousSets`). */
    previousSets?: LoggedSet[];
    /** Ids of this exercise's sets that are new PRs (`prSetIds`); omit where PRs aren't shown. */
    prSetIds?: ReadonlySet<string>;
    onaddset: () => void;
    /** A typed weight (kg) or reps value; never changes completion. */
    onsetchange: (setId: string, patch: SetPatch) => void;
    /** Completes the set (filling empty fields from `prefill`) or un-completes it. */
    ontoggleset: (setId: string, prefill: SetValues) => void;
    onduplicateset: (setId: string) => void;
    ontogglewarmup: (setId: string) => void;
    ondeleteset: (setId: string) => void;
  } = $props();

  const previous = $derived(alignPrevious(exercise.sets, previousSets));
  /** Warm-ups are numbered apart from working sets: W, 1, 2, 3 (design.md §7.2). */
  const labels = $derived.by(() => {
    let working = 0;
    let warmups = 0;
    return exercise.sets.map((s) =>
      s.type === "warmup" ? { label: "W", name: `Warm-up ${++warmups}` } : { label: String(++working), name: `Set ${working}` },
    );
  });
  const prescribed = (set: LoggedSet) => exercise.prescribedSets?.find((p) => p.id === set.prescribedSetId);

  let setMenu = $state<{ id: string; name: string } | undefined>();
  let setMenuOpen = $state(false);

  function setAct(fn: (id: string) => void) {
    setMenuOpen = false;
    if (setMenu) fn(setMenu.id);
  }

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

  let restOpen = $state(false);
  let restDraft = $state("");
  const restChoices = $derived.by(() => {
    const seconds = [...new Set([30, 45, 60, 90, 120, 150, 180, 240, 300, ...(exercise.restSeconds ? [exercise.restSeconds] : [])])];
    return [
      { value: "", label: `Default (${fmtRest(defaultRestSeconds)})` },
      ...seconds.sort((a, b) => a - b).map((n) => ({ value: String(n), label: fmtRest(n) })),
    ];
  });

  function fmtRest(n: number) {
    return n % 60 === 0 ? `${n / 60} min` : n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  }

  function openRest() {
    menuOpen = false;
    restDraft = exercise.restSeconds === undefined ? "" : String(exercise.restSeconds);
    restOpen = true;
  }

  function saveRest() {
    restOpen = false;
    const next = restDraft === "" ? undefined : Number(restDraft);
    if (next !== exercise.restSeconds) onrest(next);
  }

  function act(fn: () => void) {
    menuOpen = false;
    fn();
  }
</script>

<Card as="article" padding="none">
  {#snippet header()}
    <div class="head">
      <h2 class="name">{exercise.exerciseNameSnapshot}</h2>
      <IconButton icon="more-vertical" label="Exercise options for {exercise.exerciseNameSnapshot}" onclick={() => (menuOpen = true)} />
    </div>
  {/snippet}

  {#if exercise.notes}<p class="notes">Notes: {exercise.notes}</p>{/if}
  <div class="setlist">
    <div class="grid">
      <div class="colhead" aria-hidden="true">
        <span class="h-label">Set</span>
        <span class="h-prev">Previous</span>
        <span class="h-weight">{unit}</span>
        <span class="h-reps">Reps</span>
      </div>
      <ol class="sets" aria-label="Sets">
        {#each exercise.sets as set, i (set.id)}
          <SetRow
            {set}
            label={labels[i].label}
            name={labels[i].name}
            {unit}
            previous={previous[i]}
            prescribed={prescribed(set)}
            prefill={prefillFor(set, previous[i], prescribed(set))}
            pr={prSetIds?.has(set.id) ?? false}
            onweight={(weight) => onsetchange(set.id, { weight })}
            onreps={(reps) => onsetchange(set.id, { reps })}
            ontoggle={() => ontoggleset(set.id, prefillFor(set, previous[i], prescribed(set)))}
            onmenu={() => {
              setMenu = { id: set.id, name: labels[i].name };
              setMenuOpen = true;
            }}
          />
        {/each}
      </ol>
      <Button variant="ghost" size="sm" block icon="plus" onclick={onaddset}>Add set</Button>
    </div>
  </div>
</Card>

<Sheet bind:open={setMenuOpen} title="{setMenu?.name ?? 'Set'} · {exercise.exerciseNameSnapshot}">
  <div class="menu">
    <Button block icon="copy" onclick={() => setAct(onduplicateset)}>Duplicate set</Button>
    <Button block onclick={() => setAct(ontogglewarmup)}>Toggle warm-up</Button>
    <Button block variant="danger" icon="trash" onclick={() => setAct(ondeleteset)}>Delete set</Button>
  </div>
</Sheet>

<Sheet bind:open={menuOpen} title={exercise.exerciseNameSnapshot}>
  <div class="menu">
    <Button block icon="chevron-up" disabled={index === 0} onclick={() => act(() => onmove(-1))}>Move up</Button>
    <Button block icon="chevron-down" disabled={index === count - 1} onclick={() => act(() => onmove(1))}>Move down</Button>
    <Button block icon="timer" onclick={openRest}>Rest time</Button>
    <Button block icon="edit" onclick={openNotes}>Notes</Button>
    <Button block variant="danger" icon="trash" onclick={() => act(onremove)}>Remove exercise</Button>
  </div>
</Sheet>

<Dialog bind:open={restOpen} title="Rest time">
  <Select label="Rest after each set" bind:value={restDraft} options={restChoices} />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (restOpen = false)}>Cancel</Button>
    <Button variant="primary" onclick={saveRest}>Save</Button>
  {/snippet}
</Dialog>

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
    margin: 0 var(--space-4) var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: pre-wrap;
  }
  /* One grid for the column header and every SetRow (design.md §7.2); rows read --set-cols / --set-areas. */
  .setlist {
    container-type: inline-size;
    padding: 0 var(--space-1) var(--space-2);
  }
  .grid {
    --set-cols: var(--tap-min) minmax(3.5rem, 1fr) 4rem 3.25rem var(--tap-min);
    --set-areas: "label prev weight reps done";
    display: grid;
    gap: var(--space-1);
  }
  /* Narrow container or large text: label · previous · complete over weight · reps. */
  @container (inline-size < 17.5em) {
    .grid {
      --set-cols: var(--tap-min) minmax(0, 1fr) minmax(0, 1fr) var(--tap-min);
      --set-areas: "label prev prev done" "weight weight reps reps";
    }
  }
  .colhead {
    display: grid;
    grid-template-columns: var(--set-cols);
    grid-template-areas: var(--set-areas);
    gap: var(--space-1);
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  .h-label { grid-area: label; text-align: center; }
  .h-prev { grid-area: prev; }
  .h-weight { grid-area: weight; text-align: end; padding-inline-end: var(--space-2); }
  .h-reps { grid-area: reps; text-align: end; padding-inline-end: var(--space-2); }
  .sets {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
