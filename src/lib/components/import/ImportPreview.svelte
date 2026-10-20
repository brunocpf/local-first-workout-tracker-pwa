<script lang="ts">
  // Import step 2 (PRD §11.1): preview, settle every exercise, confirm. Nothing is written until Confirm.
  import { onMount } from "svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { buildProgramDraft, saveProgramImport, type ExerciseResolution } from "#lib/imports/saveProgram";
  import { matchProgram, type MatchResult } from "#lib/imports/matchExercises";
  import type { ExerciseRefV1, ProgramImportV1 } from "#lib/imports/programSchema";
  import { settings } from "#lib/settings.svelte";
  import { listExercises } from "#lib/storage/exercises";
  import { toast } from "#lib/ui/toast.svelte";
  import { displayWeight } from "#lib/units";
  import type { Exercise, ExerciseType } from "#lib/types";

  let {
    data,
    warnings = [],
    oncancel,
    onsaved,
  }: {
    data: ProgramImportV1;
    warnings?: string[];
    oncancel: () => void;
    onsaved: (routineCount: number) => void;
  } = $props();

  const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
    { value: "weighted_reps", label: "Weight × reps" },
    { value: "bodyweight_reps", label: "Bodyweight reps" },
    { value: "weighted_bodyweight", label: "Weighted bodyweight" },
    { value: "assisted_bodyweight", label: "Assisted bodyweight" },
    { value: "duration", label: "Duration" },
    { value: "distance", label: "Distance" },
  ];

  let catalog = $state<Exercise[]>([]);
  let loaded = $state(false);
  let loadError = $state(false);
  // svelte-ignore state_referenced_locally
  let programName = $state(data.program.name);
  let resolutions = $state<Record<string, ExerciseResolution>>({});
  let saving = $state(false);
  let saveError = $state<string>();

  onMount(() => {
    listExercises().then(
      (all) => {
        catalog = all;
        loaded = true;
      },
      () => {
        loadError = true;
        loaded = true;
      },
    );
  });

  const matches = $derived<Map<string, MatchResult>>(matchProgram(data, catalog));
  const byId = $derived(new Map(catalog.map((e) => [e.id, e])));
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown exercise";

  /** Exact matches count as resolved; everything else needs an explicit choice. */
  const effective = $derived.by(() => {
    const out: Record<string, ExerciseResolution> = {};
    for (const [path, m] of matches) if (m.status === "matched") out[path] = { kind: "exercise", exerciseId: m.exerciseId };
    return { ...out, ...resolutions };
  });

  const draft = $derived(buildProgramDraft(data, $state.snapshot(effective), { programName }));
  const canConfirm = $derived(loaded && !loadError && !saving && draft.unresolved.length === 0 && draft.routines.length > 0 && programName.trim() !== "");

  const set = (path: string, r: ExerciseResolution) => (resolutions = { ...resolutions, [path]: r });
  function undo(path: string) {
    const rest = { ...resolutions };
    delete rest[path];
    resolutions = rest;
  }

  const fmtWeight = (kg: number) => `${displayWeight(kg, settings.weightUnit)} ${settings.weightUnit}`;
  const fmtRest = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}` : `${s}s`);
  type SetLike = { repRange?: [number, number]; targetWeight?: number; targetDurationSeconds?: number; targetDistanceMeters?: number };
  const setTarget = (s: SetLike) =>
    [
      s.repRange ? (s.repRange[0] === s.repRange[1] ? `${s.repRange[0]}` : `${s.repRange[0]}–${s.repRange[1]}`) : undefined,
      s.targetDurationSeconds !== undefined ? `${s.targetDurationSeconds}s` : undefined,
      s.targetDistanceMeters !== undefined ? `${s.targetDistanceMeters} m` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  function setsSummary(e: ProgramImportV1["program"]["routines"][number]["exercises"][number]): string {
    const parts: string[] = [];
    if (e.setList) {
      parts.push(e.setList.map((s) => [setTarget(s), s.targetWeight !== undefined ? `@ ${fmtWeight(s.targetWeight)}` : ""].filter(Boolean).join(" ") || "set").join(", "));
    } else {
      const t = setTarget(e);
      parts.push(`${e.sets} × ${t || "sets"}${e.targetWeight !== undefined ? ` @ ${fmtWeight(e.targetWeight)}` : ""}`);
    }
    if (e.restSeconds !== undefined) parts.push(`rest ${fmtRest(e.restSeconds)}`);
    return parts.join(" · ");
  }

  const refLabel = (ref: ExerciseRefV1) => ref.name ?? ref.id ?? "Exercise";

  // Picker / create-custom target.
  let pickPath = $state<string>();
  let pickerOpen = $state(false);
  let createPath = $state<string>();
  let createOpen = $state(false);
  let createName = $state("");
  let createType = $state<string>("weighted_reps");

  function startPick(path: string) {
    pickPath = path;
    pickerOpen = true;
  }
  function startCreate(path: string, ref: ExerciseRefV1) {
    createPath = path;
    createName = ref.name ?? "";
    createType = ref.exerciseType ?? "weighted_reps";
    createOpen = true;
  }
  function confirmCreate() {
    if (createPath === undefined || createName.trim() === "") return;
    const ref = pathRef(createPath);
    set(createPath, {
      kind: "create",
      name: createName,
      exerciseType: createType as ExerciseType,
      ...(ref?.equipment !== undefined && { equipment: ref.equipment }),
    });
    createOpen = false;
  }
  function pathRef(path: string): ExerciseRefV1 | undefined {
    const m = /^program\.routines\[(\d+)\]\.exercises\[(\d+)\]\.exercise$/.exec(path);
    return m ? data.program.routines[+m[1]]?.exercises[+m[2]]?.exercise : undefined;
  }

  async function confirm() {
    if (!canConfirm) return;
    saving = true;
    saveError = undefined;
    try {
      await saveProgramImport(draft);
      toast(`Imported ${draft.routines.length} ${draft.routines.length === 1 ? "routine" : "routines"}`);
      onsaved(draft.routines.length);
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
      saving = false;
    }
  }

  const unresolvedCount = $derived(draft.unresolved.length);
</script>

<div class="preview">
  <TextField label="Program name" bind:value={programName} required />

  {#if loadError}
    <Banner variant="danger" title="Couldn't load the exercise catalog">Try again after reloading the page.</Banner>
  {/if}
  {#each [...warnings, ...draft.warnings] as w (w)}
    <Banner variant="warning">{w}</Banner>
  {/each}

  {#each data.program.routines as routine, ri (ri)}
    <Card>
      <h2>{routine.name}</h2>
      <ol class="exercises">
        {#each routine.exercises as e, ei (ei)}
          {@const path = `program.routines[${ri}].exercises[${ei}].exercise`}
          {@const m = matches.get(path)}
          {@const res = effective[path]}
          <li class="exercise">
            <div class="head">
              <span class="name">
                {#if res?.kind === "exercise"}{nameOf(res.exerciseId)}{:else if res?.kind === "create"}{res.name}{:else}{refLabel(e.exercise)}{/if}
              </span>
              {#if res?.kind === "drop"}
                <Badge variant="neutral" icon="x">Removed</Badge>
              {:else if res?.kind === "create"}
                <Badge variant="info" icon="plus">New custom</Badge>
              {:else if res}
                <Badge variant="success" icon="check">Matched</Badge>
              {:else if m?.status === "suggested"}
                <Badge variant="warning" icon="alert-triangle">Suggested</Badge>
              {:else if loaded}
                <Badge variant="danger" icon="alert-triangle">Unresolved</Badge>
              {/if}
            </div>
            <p class="meta">{setsSummary(e)}</p>
            {#if e.notes}<p class="meta">{e.notes}</p>{/if}
            {#if res?.kind === "exercise" && e.exercise.name && nameOf(res.exerciseId) !== e.exercise.name}
              <p class="meta">Imported as “{e.exercise.name}”</p>
            {/if}

            {#if loaded && !loadError}
              <div class="resolve">
                {#if !res && m?.status === "suggested"}
                  {#each m.candidates as c (c.exerciseId)}
                    <Button icon="check" onclick={() => set(path, { kind: "exercise", exerciseId: c.exerciseId })}>
                      Use {nameOf(c.exerciseId)}
                    </Button>
                  {/each}
                {/if}
                {#if resolutions[path]}
                  <Button variant="ghost" icon="undo" onclick={() => undo(path)}>Change</Button>
                {/if}
                {#if !res || res.kind === "create"}
                  <Button onclick={() => startPick(path)}>Pick from catalog</Button>
                  <Button onclick={() => startCreate(path, e.exercise)}>Create custom</Button>
                {/if}
                {#if res?.kind !== "drop"}
                  <Button variant="ghost" icon="trash" onclick={() => set(path, { kind: "drop" })}>Remove</Button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </Card>
  {/each}

  {#if saveError}
    <Banner variant="danger" title="Couldn't save the import">{saveError} Nothing was changed.</Banner>
  {/if}

  <div class="actions">
    {#if unresolvedCount > 0}
      <p class="meta" role="status">{unresolvedCount} {unresolvedCount === 1 ? "exercise needs" : "exercises need"} a decision.</p>
    {/if}
    <Button variant="primary" disabled={!canConfirm} loading={saving} onclick={confirm}>Confirm import</Button>
    <Button variant="ghost" disabled={saving} onclick={oncancel}>Cancel</Button>
  </div>
</div>

<ExercisePicker
  bind:open={pickerOpen}
  title="Choose exercise"
  allowCreate={false}
  onpick={(picked) => {
    if (pickPath !== undefined && picked[0]) set(pickPath, { kind: "exercise", exerciseId: picked[0].id });
  }}
/>

<Dialog bind:open={createOpen} title="Create custom exercise">
  <TextField label="Name" bind:value={createName} required />
  <Select label="Type" bind:value={createType} options={TYPE_OPTIONS} />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (createOpen = false)}>Cancel</Button>
    <Button variant="primary" disabled={createName.trim() === ""} onclick={confirmCreate}>Create</Button>
  {/snippet}
</Dialog>

<style>
  .preview { display: flex; flex-direction: column; gap: var(--space-4); }
  h2 { margin: 0 0 var(--space-3); font-size: var(--text-lg); }
  p { margin: 0; }
  .exercises { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
  .exercise { display: flex; flex-direction: column; gap: var(--space-2); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
  .name { font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .meta { color: var(--color-text-muted); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .resolve { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .actions { display: flex; flex-direction: column; gap: var(--space-2); }
</style>
