<script lang="ts">
  // Presentational exercise card (design.md §8): the page decides how to persist. Reused for past sessions (T4.06).
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import PlateCalculatorSheet from "#lib/components/tools/PlateCalculatorSheet.svelte";
  import { settings } from "#lib/settings.svelte";
  import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";
  import TextField from "#lib/components/ui/TextField.svelte";
  import SetRow from "#lib/components/workout/SetRow.svelte";
  import { alignPrevious, prefillFor, type SetValues } from "#lib/logger/previousValues";
  import type { SetPatch, SupersetInfo } from "#lib/logger/workout";
  import type { EffortInput, Exercise, LoggedSet, SessionExercise, SetType, WeightUnit } from "#lib/types";

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
    effortInput = "off",
    previousSets = [],
    prSetIds,
    onaddset,
    onsetchange,
    ontoggleset,
    onduplicateset,
    ondeleteset,
    superset,
    canJoin = { previous: false, next: false },
    onjoin,
    onleave,
    onreplace,
    loadSuggestions,
    excludeIds = [],
    barbell = false,
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
    /** Settings `effortInput`: shows an RPE or RIR selector on every set row; `off` hides it. */
    effortInput?: EffortInput;
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
    ondeleteset: (setId: string) => void;
    /** Set when this exercise is part of a superset; shows the A1/A2 label. */
    superset?: SupersetInfo;
    /** Whether "Superset with previous/next" applies (a neighbour exists and isn't already in this group). */
    canJoin?: { previous: boolean; next: boolean };
    onjoin?: (direction: -1 | 1) => void;
    onleave?: () => void;
    /** Shows "Replace exercise"; the page confirms if sets are completed and applies the swap. */
    onreplace?: (to: Exercise) => void;
    /** Substitutes for this exercise (`suggestSubstitutes` over the catalog); the sheet still offers the full picker if this fails. */
    loadSuggestions?: () => Promise<Exercise[]>;
    /** Exercises the picker hides (the exercise itself and the others in the workout). */
    excludeIds?: string[];
    /** Barbell exercise: the set menu offers the plate calculator. */
    barbell?: boolean;
  } = $props();

  const previous = $derived(alignPrevious(exercise.sets, previousSets));
  const setTypes: { value: SetType; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "warmup", label: "Warm-up" },
    { value: "drop", label: "Drop" },
    { value: "failure", label: "Failure" },
  ];
  /** Only normal sets are numbered; the others show W / D / F and are counted per type (design.md §7.2). */
  const labels = $derived.by(() => {
    const count: Record<SetType, number> = { normal: 0, warmup: 0, drop: 0, failure: 0 };
    return exercise.sets.map((s) => {
      const n = ++count[s.type];
      switch (s.type) {
        case "warmup":
          return { label: "W", name: `Warm-up ${n}` };
        case "drop":
          return { label: "D", name: `Drop set ${n}` };
        case "failure":
          return { label: "F", name: `Failure set ${n}` };
        default:
          return { label: String(n), name: `Set ${n}` };
      }
    });
  });
  const prescribed = (set: LoggedSet) => exercise.prescribedSets?.find((p) => p.id === set.prescribedSetId);

  let setMenu = $state<{ id: string; name: string } | undefined>();
  let setMenuOpen = $state(false);

  const menuSet = $derived(exercise.sets.find((x) => x.id === setMenu?.id));

  function setAct(fn: (id: string) => void) {
    setMenuOpen = false;
    if (setMenu) fn(setMenu.id);
  }

  let platesOpen = $state(false);
  let plateTargetKg = $state<number | undefined>();
  function openPlates() {
    setMenuOpen = false;
    plateTargetKg = menuSet?.weight ?? (menuSet ? prefillFor(menuSet, previous[exercise.sets.indexOf(menuSet)], prescribed(menuSet)).weight : undefined);
    platesOpen = true;
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

  let replaceOpen = $state(false);
  let pickerOpen = $state(false);
  let suggestions = $state<Exercise[]>([]);
  let suggestionsState = $state<"loading" | "ready" | "failed">("loading");

  function openReplace() {
    menuOpen = false;
    replaceOpen = true;
    suggestionsState = "loading";
    (loadSuggestions?.() ?? Promise.resolve([])).then(
      (found) => {
        suggestions = found;
        suggestionsState = "ready";
      },
      () => (suggestionsState = "failed"),
    );
  }

  function replaceWith(to: Exercise) {
    replaceOpen = false;
    onreplace?.(to);
  }

  function browse() {
    replaceOpen = false;
    pickerOpen = true;
  }

  // "lower_back" → "lower back"; the first word of the line is capitalized.
  function describe(e: Exercise) {
    const text = [...e.primaryMuscles, ...e.equipment].map((id) => id.replaceAll("_", " ")).join(" · ");
    return text.charAt(0).toUpperCase() + text.slice(1);
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
      <h2 class="name">{#if superset}<span class="tag"><Badge variant="accent"><span class="visually-hidden">Superset </span>{superset.letter}{superset.position + 1}</Badge></span>{/if}{exercise.exerciseNameSnapshot}</h2>
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
            effort={effortInput}
            oneffort={(v) => onsetchange(set.id, effortInput === "rir" ? { rir: v } : { rpe: v })}
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
    {#if barbell}<Button block icon="dumbbell" onclick={openPlates}>Plate calculator</Button>{/if}
    <Button block icon="copy" onclick={() => setAct(onduplicateset)}>Duplicate set</Button>
    {#if menuSet}
      <SegmentedControl
        legend="Set type"
        legendVisible
        bind:value={() => menuSet.type, (type) => {
          setMenuOpen = false;
          onsetchange(menuSet.id, { type: type as SetType });
        }}
        options={setTypes}
      />
    {/if}
    <Button block variant="danger" icon="trash" onclick={() => setAct(ondeleteset)}>Delete set</Button>
  </div>
</Sheet>

{#if barbell}
  <PlateCalculatorSheet
    bind:open={platesOpen}
    targetKg={plateTargetKg}
    {unit}
    barKg={settings.barWeightKg ?? DEFAULT_BAR_KG}
    inventory={settings.plateInventory ?? DEFAULT_PLATE_INVENTORY}
  />
{/if}

<Sheet bind:open={menuOpen} title={exercise.exerciseNameSnapshot}>
  <div class="menu">
    <Button block icon="chevron-up" disabled={index === 0} onclick={() => act(() => onmove(-1))}>Move up</Button>
    <Button block icon="chevron-down" disabled={index === count - 1} onclick={() => act(() => onmove(1))}>Move down</Button>
    {#if onjoin}
      <Button block icon="link" disabled={!canJoin.previous} onclick={() => act(() => onjoin(-1))}>Superset with previous</Button>
      <Button block icon="link" disabled={!canJoin.next} onclick={() => act(() => onjoin(1))}>Superset with next</Button>
    {/if}
    {#if superset && onleave}
      <Button block icon="x" onclick={() => act(onleave)}>Remove from superset</Button>
    {/if}
    <Button block icon="timer" onclick={openRest}>Rest time</Button>
    <Button block icon="edit" onclick={openNotes}>Notes</Button>
    {#if onreplace}
      <Button block icon="dumbbell" onclick={openReplace}>Replace exercise</Button>
    {/if}
    <Button block variant="danger" icon="trash" onclick={() => act(onremove)}>Remove exercise</Button>
  </div>
</Sheet>

{#if onreplace}
  <Sheet bind:open={replaceOpen} title="Replace {exercise.exerciseNameSnapshot}" description="Your sets and targets carry over.">
    <div class="menu">
      {#if suggestionsState === "loading"}
        <p class="hint" role="status">Finding alternatives…</p>
      {:else if suggestionsState === "failed"}
        <p class="hint" role="alert">Couldn't load suggestions. You can still browse all exercises.</p>
      {:else if suggestions.length === 0}
        <p class="hint">No similar exercises found.</p>
      {:else}
        <ul class="suggestions" aria-label="Suggested alternatives">
          {#each suggestions as s (s.id)}
            <li><ListRow title={s.name} subtitle={describe(s)} onclick={() => replaceWith(s)} /></li>
          {/each}
        </ul>
      {/if}
      <Button block icon="search" onclick={browse}>Browse all exercises</Button>
    </div>
  </Sheet>
  <ExercisePicker bind:open={pickerOpen} title="Replace exercise" excludeIds={[...excludeIds, exercise.exerciseId]} onpick={([to]) => to && replaceWith(to)} />
{/if}

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
  .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .tag { margin-inline-end: var(--space-2); }
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
  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .suggestions {
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
