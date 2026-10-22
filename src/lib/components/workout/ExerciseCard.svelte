<script lang="ts">
  import { equipmentLabel, muscleLabel, setTypeLabel } from "#lib/catalog/labels";
  import { t, tn } from "#lib/i18n.svelte";
  import { exerciseLabel } from "#lib/catalog/localize";
  // Presentational exercise card (design.md §8): the page decides how to persist. Reused for past sessions (T4.06).
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import PlateCalculatorSheet from "#lib/components/tools/PlateCalculatorSheet.svelte";
  import { settings } from "#lib/settings.svelte";
  import { suggestProgression } from "#lib/progress/progression";
  import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";
  import { DEFAULT_WARMUP_SCHEME, warmupSets, workingWeight, type WarmupSet } from "#lib/tools/warmup";
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
    onaddwarmups,
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
    /** Adds the generated warm-up sets before the working sets; omit where it doesn't apply. */
    onaddwarmups?: (sets: WarmupSet[]) => void;
  } = $props();

  const previous = $derived(alignPrevious(exercise.sets, previousSets));

  // Progression (PRD §17): only suggested; "Apply" swaps the prefill of the sets still to do. Not persisted.
  const repRange = $derived((exercise.prescribedSets?.find((p) => p.type === "normal" && p.repRange) ?? exercise.prescribedSets?.find((p) => p.repRange))?.repRange);
  const suggestion = $derived(previousSets.length ? suggestProgression(previousSets, { repRange }, { weightUnit: unit, progressionEnabled: settings.progressionEnabled, progressionIncrement: settings.progressionIncrement }) : null);
  let appliedKey = $state<string>();
  const key = $derived(suggestion ? `${suggestion.weightKg}/${suggestion.reps}` : undefined);
  /** Applying is tied to the suggestion it was for, so a changed suggestion (new data) offers itself again. */
  const applied = $derived(key !== undefined && appliedKey === key);
  function prefillOf(set: LoggedSet, i: number): SetValues {
    const base = prefillFor(set, previous[i], prescribed(set));
    if (!applied || !suggestion || set.completedAt || set.type === "warmup" || set.type === "drop") return base;
    return { weight: suggestion.weightKg, reps: suggestion.reps };
  }
  const setTypes = $derived((["normal", "warmup", "drop", "failure"] as const).map((value) => ({ value, label: setTypeLabel(value) })));
  /** Only normal sets are numbered; the others show W / D / F and are counted per type (design.md §7.2). */
  const labels = $derived.by(() => {
    const count: Record<SetType, number> = { normal: 0, warmup: 0, drop: 0, failure: 0 };
    return exercise.sets.map((s) => {
      const n = ++count[s.type];
      switch (s.type) {
        case "warmup":
          return { label: "W", name: t("set.warmup", { n }) };
        case "drop":
          return { label: "D", name: t("set.drop", { n }) };
        case "failure":
          return { label: "F", name: t("set.failure", { n }) };
        default:
          return { label: String(n), name: t("set.normal", { n }) };
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

  function describe(e: Exercise) {
    return [...e.primaryMuscles.map(muscleLabel), ...e.equipment.map(equipmentLabel)].join(" · ");
  }

  let restOpen = $state(false);
  let restDraft = $state("");
  const restChoices = $derived.by(() => {
    const seconds = [...new Set([30, 45, 60, 90, 120, 150, 180, 240, 300, ...(exercise.restSeconds ? [exercise.restSeconds] : [])])];
    return [
      { value: "", label: t("card.restDefault", { time: fmtRest(defaultRestSeconds) }) },
      ...seconds.sort((a, b) => a - b).map((n) => ({ value: String(n), label: fmtRest(n) })),
    ];
  });

  function fmtRest(n: number) {
    return n % 60 === 0 ? t("card.minutes", { n: n / 60 }) : n < 60 ? t("card.seconds", { n }) : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
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

  /** First working weight: typed, else what the first working set would be prefilled with. */
  const warmups = $derived.by(() => {
    const i = exercise.sets.findIndex((s) => s.type !== "warmup");
    const first = exercise.sets[i];
    const kg = workingWeight(exercise.sets) ?? (first ? prefillFor(first, previous[i], prescribed(first)).weight : undefined);
    if (!kg) return [];
    return warmupSets(kg, settings.warmupScheme ?? DEFAULT_WARMUP_SCHEME, {
      unit,
      barKg: settings.barWeightKg ?? DEFAULT_BAR_KG,
      inventory: settings.plateInventory ?? DEFAULT_PLATE_INVENTORY,
    });
  });

  function act(fn: () => void) {
    menuOpen = false;
    fn();
  }
</script>

<Card as="article" padding="none">
  {#snippet header()}
    <div class="head">
      <h2 class="name">{#if superset}<span class="tag"><Badge variant="accent"><span class="visually-hidden">{t("card.superset")} </span>{superset.letter}{superset.position + 1}</Badge></span>{/if}{exerciseLabel(exercise.exerciseId, exercise.exerciseNameSnapshot)}</h2>
      <IconButton icon="more-vertical" label={t("card.options", { name: exerciseLabel(exercise.exerciseId, exercise.exerciseNameSnapshot) })} onclick={() => (menuOpen = true)} />
    </div>
  {/snippet}

  {#if exercise.notes}<p class="notes">{t("card.notes", { notes: exercise.notes })}</p>{/if}
  {#if suggestion}
    <div class="suggest" role="group" aria-label={t("card.suggestion")}>
      <p class="reason"><Icon name="chevron-up" size="1.1em" /> {applied ? t("card.suggestionApplied") : suggestion.reason}</p>
      {#if !applied}<Button size="sm" onclick={() => (appliedKey = key)}>{t("card.apply")}</Button>{/if}
    </div>
  {/if}
  <div class="setlist">
    <div class="grid">
      <div class="colhead" aria-hidden="true">
        <span class="h-label">{t("card.colSet")}</span>
        <span class="h-prev">{t("card.colPrevious")}</span>
        <span class="h-weight">{unit}</span>
        <span class="h-reps">{t("card.colReps")}</span>
      </div>
      <ol class="sets" aria-label={t("card.sets")}>
        {#each exercise.sets as set, i (set.id)}
          <SetRow
            {set}
            label={labels[i].label}
            name={labels[i].name}
            {unit}
            previous={previous[i]}
            prescribed={prescribed(set)}
            prefill={prefillOf(set, i)}
            pr={prSetIds?.has(set.id) ?? false}
            effort={effortInput}
            oneffort={(v) => onsetchange(set.id, effortInput === "rir" ? { rir: v } : { rpe: v })}
            onweight={(weight) => onsetchange(set.id, { weight })}
            onreps={(reps) => onsetchange(set.id, { reps })}
            ontoggle={() => ontoggleset(set.id, prefillOf(set, i))}
            onmenu={() => {
              setMenu = { id: set.id, name: labels[i].name };
              setMenuOpen = true;
            }}
          />
        {/each}
      </ol>
      <Button variant="ghost" size="sm" block icon="plus" onclick={onaddset}>{t("card.addSet")}</Button>
    </div>
  </div>
</Card>

<Sheet bind:open={setMenuOpen} title="{setMenu?.name ?? t('card.setFallback')} · {exerciseLabel(exercise.exerciseId, exercise.exerciseNameSnapshot)}">
  <div class="menu">
    {#if barbell}<Button block icon="dumbbell" onclick={openPlates}>{t("card.plates")}</Button>{/if}
    <Button block icon="copy" onclick={() => setAct(onduplicateset)}>{t("card.duplicateSet")}</Button>
    {#if menuSet}
      <SegmentedControl
        legend={t("card.setType")}
        legendVisible
        bind:value={() => menuSet.type, (type) => {
          setMenuOpen = false;
          onsetchange(menuSet.id, { type: type as SetType });
        }}
        options={setTypes}
      />
    {/if}
    <Button block variant="danger" icon="trash" onclick={() => setAct(ondeleteset)}>{t("card.deleteSet")}</Button>
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

<Sheet bind:open={menuOpen} title={exerciseLabel(exercise.exerciseId, exercise.exerciseNameSnapshot)}>
  <div class="menu">
    <Button block icon="chevron-up" disabled={index === 0} onclick={() => act(() => onmove(-1))}>{t("card.moveUp")}</Button>
    <Button block icon="chevron-down" disabled={index === count - 1} onclick={() => act(() => onmove(1))}>{t("card.moveDown")}</Button>
    {#if onjoin}
      <Button block icon="link" disabled={!canJoin.previous} onclick={() => act(() => onjoin(-1))}>{t("card.supersetPrev")}</Button>
      <Button block icon="link" disabled={!canJoin.next} onclick={() => act(() => onjoin(1))}>{t("card.supersetNext")}</Button>
    {/if}
    {#if superset && onleave}
      <Button block icon="x" onclick={() => act(onleave)}>{t("card.supersetLeave")}</Button>
    {/if}
    {#if onaddwarmups}
      <Button block icon="plus" disabled={warmups.length === 0} onclick={() => act(() => onaddwarmups(warmups))}>{t("card.addWarmups")}</Button>
      {#if warmups.length === 0}<p class="hint">{t("card.warmupHint")}</p>{/if}
    {/if}
    <Button block icon="timer" onclick={openRest}>{t("card.restTime")}</Button>
    <Button block icon="edit" onclick={openNotes}>{t("card.notesAction")}</Button>
    {#if onreplace}
      <Button block icon="dumbbell" onclick={openReplace}>{t("card.replace")}</Button>
    {/if}
    <Button block variant="danger" icon="trash" onclick={() => act(onremove)}>{t("card.remove")}</Button>
  </div>
</Sheet>

{#if onreplace}
  <Sheet bind:open={replaceOpen} title={t("card.replaceTitle", { name: exerciseLabel(exercise.exerciseId, exercise.exerciseNameSnapshot) })} description={t("card.replaceDescription")}>
    <div class="menu">
      {#if suggestionsState === "loading"}
        <p class="hint" role="status">{t("card.findingAlternatives")}</p>
      {:else if suggestionsState === "failed"}
        <p class="hint" role="alert">{t("card.suggestionsFailed")}</p>
      {:else if suggestions.length === 0}
        <p class="hint">{t("card.noSimilar")}</p>
      {:else}
        <ul class="suggestions" aria-label={t("card.suggested")}>
          {#each suggestions as s (s.id)}
            <li><ListRow title={s.name} subtitle={describe(s)} onclick={() => replaceWith(s)} /></li>
          {/each}
        </ul>
      {/if}
      <Button block icon="search" onclick={browse}>{t("card.browseAll")}</Button>
    </div>
  </Sheet>
  <ExercisePicker bind:open={pickerOpen} title={t("card.replace")} excludeIds={[...excludeIds, exercise.exerciseId]} onpick={([to]) => to && replaceWith(to)} />
{/if}

<Dialog bind:open={restOpen} title={t("card.restDialog")}>
  <Select label={t("card.restAfter")} bind:value={restDraft} options={restChoices} />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (restOpen = false)}>{t("common.cancel")}</Button>
    <Button variant="primary" onclick={saveRest}>{t("common.save")}</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={notesOpen} title={t("card.notesDialog")}>
  <TextField label={t("card.notesLabel")} bind:value={draft} multiline />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (notesOpen = false)}>{t("common.cancel")}</Button>
    <Button variant="primary" onclick={saveNotes}>{t("common.save")}</Button>
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
  .suggest {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0 var(--space-4) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-info-subtle);
    color: var(--color-info-text);
  }
  .reason { flex: 1 1 12rem; margin: 0; min-inline-size: 0; font-size: var(--text-sm); overflow-wrap: anywhere; }
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
