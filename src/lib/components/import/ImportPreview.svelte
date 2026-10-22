<script lang="ts">
  import { exerciseTypeLabel } from "#lib/catalog/labels";
  import { localizeExercises } from "#lib/catalog/localize";
  import { t, tn } from "#lib/i18n.svelte";
  // Import step 2 (PRD §11.1): preview, settle every exercise, confirm. Nothing is written until Confirm.
  import { onMount } from "svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PrescriptionEditor from "#lib/components/routines/PrescriptionEditor.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { buildProgramDraft, editKey, saveProgramImport, type DraftEdits, type ExerciseResolution } from "#lib/imports/saveProgram";
  import { matchProgram, type MatchResult } from "#lib/imports/matchExercises";
  import type { ExerciseRefV1, ProgramImportV1 } from "#lib/imports/programSchema";
  import { settings } from "#lib/settings.svelte";
  import { listExercises } from "#lib/storage/exercises";
  import { toast } from "#lib/ui/toast.svelte";
  import { displayWeight } from "#lib/units";
  import type { Exercise, ExerciseType, RoutineExercise } from "#lib/types";

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

  const TYPE_OPTIONS = $derived((["weighted_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance"] as const).map((value) => ({ value, label: exerciseTypeLabel(value) })));

  let catalog = $state<Exercise[]>([]);
  let loaded = $state(false);
  let loadError = $state(false);
  // svelte-ignore state_referenced_locally
  let programName = $state(data.program.name);
  let resolutions = $state<Record<string, ExerciseResolution>>({});
  let edits = $state<Required<DraftEdits>>({ routineNames: {}, order: {}, exercises: {} });
  let saving = $state(false);
  let saveError = $state<string>();

  onMount(() => {
    listExercises().then(
      (all) => {
        catalog = localizeExercises(all);
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
  const nameOf = (id: string) => byId.get(id)?.name ?? t("summary.unknown");

  /** Exact matches count as resolved; everything else needs an explicit choice. */
  const effective = $derived.by(() => {
    const out: Record<string, ExerciseResolution> = {};
    for (const [path, m] of matches) if (m.status === "matched") out[path] = { kind: "exercise", exerciseId: m.exerciseId };
    return { ...out, ...resolutions };
  });

  const draft = $derived(buildProgramDraft(data, $state.snapshot(effective), { programName, edits: $state.snapshot(edits) }));
  const canConfirm = $derived(loaded && !loadError && !saving && draft.unresolved.length === 0 && draft.routines.length > 0 && programName.trim() !== "");

  const set = (path: string, r: ExerciseResolution) => (resolutions = { ...resolutions, [path]: r });
  function undo(path: string) {
    const rest = { ...resolutions };
    delete rest[path];
    resolutions = rest;
  }

  /** Source exercise indices of a routine in the order the user arranged them. */
  const orderOf = (ri: number): number[] => edits.order[ri] ?? data.program.routines[ri].exercises.map((_, i) => i);
  function move(ri: number, from: number, to: number) {
    const next = [...orderOf(ri)];
    next.splice(to, 0, ...next.splice(from, 1));
    edits.order[ri] = next;
  }
  const draftExercise = (ri: number, ei: number): RoutineExercise | undefined => {
    const at = draft.sources.findIndex((x) => x.routine === ri);
    const idx = at === -1 ? -1 : draft.sources[at].exercises.indexOf(ei);
    return idx === -1 ? undefined : draft.routines[at].exercises[idx];
  };

  let editTarget = $state<{ ri: number; ei: number }>();
  let editOpen = $state(false);
  const editing = $derived(editTarget ? edits.exercises[editKey(editTarget.ri, editTarget.ei)] : undefined);
  /** Seeds the edit layer from the current draft the first time an exercise is opened; the editor then mutates it in place. */
  function startEdit(ri: number, ei: number) {
    const key = editKey(ri, ei);
    if (!edits.exercises[key]) {
      const base = draftExercise(ri, ei);
      if (!base) return;
      edits.exercises[key] = $state.snapshot(base) as RoutineExercise;
    }
    editTarget = { ri, ei };
    editOpen = true;
  }
  function typeOf(ri: number, ei: number): ExerciseType | undefined {
    const res = effective[`program.routines[${ri}].exercises[${ei}].exercise`];
    if (res?.kind === "create") return res.exerciseType;
    if (res?.kind === "exercise") return byId.get(res.exerciseId)?.exerciseType;
    return undefined;
  }
  function editedSummary(re: RoutineExercise): string {
    const parts = re.prescribedSets.map(
      (s) =>
        [setTarget({ ...s, targetDistanceMeters: s.targetDistance }), s.targetWeight !== undefined ? `@ ${fmtWeight(s.targetWeight)}` : ""]
          .filter(Boolean)
          .join(" ") || t("imp.setWord"),
    );
    return [t("imp.setsOf", { n: re.prescribedSets.length, parts: parts.join(", ") }), re.restSeconds !== undefined ? t("imp.rest", { time: fmtRest(re.restSeconds) }) : ""].filter(Boolean).join(" · ");
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
      parts.push(e.setList.map((s) => [setTarget(s), s.targetWeight !== undefined ? `@ ${fmtWeight(s.targetWeight)}` : ""].filter(Boolean).join(" ") || t("imp.setWord")).join(", "));
    } else {
      const target = setTarget(e);
      parts.push(`${e.sets} × ${target || t("imp.setsX")}${e.targetWeight !== undefined ? ` @ ${fmtWeight(e.targetWeight)}` : ""}`);
    }
    if (e.restSeconds !== undefined) parts.push(t("imp.rest", { time: fmtRest(e.restSeconds) }));
    return parts.join(" · ");
  }

  const nameLabel = (path: string, ref: ExerciseRefV1) => {
    const res = effective[path];
    return res?.kind === "exercise" ? nameOf(res.exerciseId) : res?.kind === "create" ? res.name : refLabel(ref);
  };
  const refLabel = (ref: ExerciseRefV1) => ref.name ?? ref.id ?? t("imp.exerciseFallback");

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
      toast(tn("imp.imported", draft.routines.length));
      onsaved(draft.routines.length);
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
      saving = false;
    }
  }

  const unresolvedCount = $derived(draft.unresolved.length);
</script>

<div class="preview">
  <TextField label={t("imp.programName")} bind:value={programName} required />

  {#if loadError}
    <Banner variant="danger" title={t("imp.catalogFailed")}>{t("imp.reloadRetry")}</Banner>
  {/if}
  {#each [...warnings, ...draft.warnings] as w (w)}
    <Banner variant="warning">{w}</Banner>
  {/each}

  {#each data.program.routines as routine, ri (ri)}
    <Card>
      <TextField
        label={t("imp.routineName")}
        bind:value={() => edits.routineNames[ri] ?? routine.name, (v) => (edits.routineNames[ri] = v)}
      />
      <ol class="exercises">
        {#each orderOf(ri) as ei, pos (ei)}
          {@const e = routine.exercises[ei]}
          {@const edited = edits.exercises[editKey(ri, ei)]}
          {@const path = `program.routines[${ri}].exercises[${ei}].exercise`}
          {@const m = matches.get(path)}
          {@const res = effective[path]}
          <li class="exercise">
            <div class="head">
              <span class="name">
                {#if res?.kind === "exercise"}{nameOf(res.exerciseId)}{:else if res?.kind === "create"}{res.name}{:else}{refLabel(e.exercise)}{/if}
              </span>
              {#if res?.kind === "drop"}
                <Badge variant="neutral" icon="x">{t("imp.removed")}</Badge>
              {:else if res?.kind === "create"}
                <Badge variant="info" icon="plus">{t("imp.newCustom")}</Badge>
              {:else if res}
                <Badge variant="success" icon="check">{t("imp.matched")}</Badge>
              {:else if m?.status === "suggested"}
                <Badge variant="warning" icon="alert-triangle">{t("imp.suggested")}</Badge>
              {:else if loaded}
                <Badge variant="danger" icon="alert-triangle">{t("imp.unresolved")}</Badge>
              {/if}
            </div>
            <p class="meta">{edited ? editedSummary(edited) : setsSummary(e)}</p>
            {#if edited ? edited.notes : e.notes}<p class="meta">{edited ? edited.notes : e.notes}</p>{/if}
            {#if res?.kind === "exercise" && e.exercise.name && nameOf(res.exerciseId) !== e.exercise.name}
              <p class="meta">{t("imp.importedAs", { name: e.exercise.name })}</p>
            {/if}

            <div class="resolve">
              <IconButton icon="chevron-up" label={t("imp.moveUp", { name: nameLabel(path, e.exercise) })} disabled={pos === 0} onclick={() => move(ri, pos, pos - 1)} />
              <IconButton
                icon="chevron-down"
                label={t("imp.moveDown", { name: nameLabel(path, e.exercise) })}
                disabled={pos === routine.exercises.length - 1}
                onclick={() => move(ri, pos, pos + 1)}
              />
              {#if res && res.kind !== "drop"}
                <Button onclick={() => startEdit(ri, ei)}>{t("imp.editSets")}</Button>
              {/if}
            </div>

            {#if loaded && !loadError}
              <div class="resolve">
                {#if !res && m?.status === "suggested"}
                  {#each m.candidates as c (c.exerciseId)}
                    <Button icon="check" onclick={() => set(path, { kind: "exercise", exerciseId: c.exerciseId })}>
                      {t("imp.use", { name: nameOf(c.exerciseId) })}
                    </Button>
                  {/each}
                {/if}
                {#if resolutions[path]}
                  <Button variant="ghost" icon="undo" onclick={() => undo(path)}>{t("imp.change")}</Button>
                {/if}
                {#if !res || res.kind === "create"}
                  <Button onclick={() => startPick(path)}>{t("imp.pick")}</Button>
                  <Button onclick={() => startCreate(path, e.exercise)}>{t("imp.createCustom")}</Button>
                {/if}
                {#if res?.kind !== "drop"}
                  <Button variant="ghost" icon="trash" onclick={() => set(path, { kind: "drop" })}>{t("imp.remove")}</Button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </Card>
  {/each}

  {#if saveError}
    <Banner variant="danger" title={t("imp.saveFailed")}>{saveError} {t("imp.nothingChanged")}</Banner>
  {/if}

  <div class="actions">
    {#if unresolvedCount > 0}
      <p class="meta" role="status">{tn("imp.needs", unresolvedCount)}</p>
    {/if}
    <Button variant="primary" disabled={!canConfirm} loading={saving} onclick={confirm}>{t("imp.confirm")}</Button>
    <Button variant="ghost" disabled={saving} onclick={oncancel}>{t("common.cancel")}</Button>
  </div>
</div>

{#if editing && editTarget}
  <PrescriptionEditor
    bind:open={editOpen}
    exercise={editing}
    name={nameLabel(`program.routines[${editTarget.ri}].exercises[${editTarget.ei}].exercise`, data.program.routines[editTarget.ri].exercises[editTarget.ei].exercise)}
    exerciseType={typeOf(editTarget.ri, editTarget.ei)}
    unit={settings.weightUnit}
  />
{/if}

<ExercisePicker
  bind:open={pickerOpen}
  title={t("imp.chooseExercise")}
  allowCreate={false}
  onpick={(picked) => {
    if (pickPath !== undefined && picked[0]) set(pickPath, { kind: "exercise", exerciseId: picked[0].id });
  }}
/>

<Dialog bind:open={createOpen} title={t("imp.createDialog")}>
  <TextField label={t("edit.name")} bind:value={createName} required />
  <Select label={t("imp.type")} bind:value={createType} options={TYPE_OPTIONS} />
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (createOpen = false)}>{t("common.cancel")}</Button>
    <Button variant="primary" disabled={createName.trim() === ""} onclick={confirmCreate}>{t("imp.create")}</Button>
  {/snippet}
</Dialog>

<style>
  .preview { display: flex; flex-direction: column; gap: var(--space-4); }
  p { margin: 0; }
  .exercises { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
  .exercise { display: flex; flex-direction: column; gap: var(--space-2); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
  .name { font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .meta { color: var(--color-text-muted); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .resolve { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .actions { display: flex; flex-direction: column; gap: var(--space-2); }
</style>
