<script lang="ts">
  // Prescription sheet (PRD §7.2): edits one RoutineExercise in place. Knows nothing about routine persistence,
  // so the import preview can reuse it. Weights are stored in kg and shown/typed in the user's unit.
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { setNotes, setRest, setSetCount, updatePrescribedSet } from "#lib/routines/edit";
  import { displayWeight, toKg } from "#lib/units";
  import type { ExerciseType, PrescribedSet, RoutineExercise, SetType, WeightUnit } from "#lib/types";

  let {
    open = $bindable(false),
    exercise,
    name,
    exerciseType = "weighted_reps",
    unit,
  }: {
    open?: boolean;
    exercise: RoutineExercise;
    name: string;
    exerciseType?: ExerciseType;
    unit: WeightUnit;
  } = $props();

  const setTypes: { value: SetType; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "warmup", label: "Warm-up" },
    { value: "drop", label: "Drop set" },
    { value: "failure", label: "To failure" },
  ];

  const usesReps = $derived(exerciseType !== "duration" && exerciseType !== "distance");
  const usesWeight = $derived(exerciseType !== "bodyweight_reps" && exerciseType !== "duration" && exerciseType !== "distance");
  const usesDuration = $derived(exerciseType === "duration" || exerciseType === "distance");
  const usesDistance = $derived(exerciseType === "distance");
  const weightLabel = $derived(
    exerciseType === "assisted_bodyweight" ? "Assistance" : exerciseType === "weighted_bodyweight" ? "Added weight" : "Weight",
  );

  function setReps(s: PrescribedSet, min: number | null, max: number | null) {
    const lo = min ?? max;
    const hi = max ?? min;
    updatePrescribedSet(exercise, s.id, { repRange: lo === null || hi === null ? undefined : [lo, Math.max(lo, hi)] });
  }
</script>

<Sheet bind:open title={`${name} sets`} size="full">
  <div class="body">
    <NumberField
      label="Number of sets"
      mode="integer"
      max={20}
      bind:value={() => exercise.prescribedSets.length, (n) => setSetCount(exercise, n ?? 0)}
    />

    {#each exercise.prescribedSets as s, i (s.id)}
      <fieldset class="set">
        <legend>Set {i + 1}</legend>
        <Select
          label={`Set ${i + 1} type`}
          bind:value={() => s.type, (v) => updatePrescribedSet(exercise, s.id, { type: v as SetType })}
          options={setTypes}
        />
        <div class="grid">
          {#if usesReps}
            <NumberField
              label={`Set ${i + 1} min reps`}
              mode="integer"
              min={1}
              value={s.repRange?.[0] ?? null}
              onchange={(n) => setReps(s, n, s.repRange?.[1] ?? null)}
            />
            <NumberField
              label={`Set ${i + 1} max reps`}
              mode="integer"
              min={1}
              value={s.repRange?.[1] ?? null}
              onchange={(n) => setReps(s, s.repRange?.[0] ?? null, n)}
            />
          {/if}
          {#if usesWeight}
            <NumberField
              label={`Set ${i + 1} ${weightLabel.toLowerCase()}`}
              suffix={unit}
              value={s.targetWeight === undefined ? null : displayWeight(s.targetWeight, unit)}
              onchange={(n) => updatePrescribedSet(exercise, s.id, { targetWeight: n === null || n === 0 ? undefined : toKg(n, unit) })}
            />
          {/if}
          {#if usesDuration}
            <NumberField
              label={`Set ${i + 1} duration`}
              mode="integer"
              suffix="s"
              value={s.targetDurationSeconds ?? null}
              onchange={(n) => updatePrescribedSet(exercise, s.id, { targetDurationSeconds: n || undefined })}
            />
          {/if}
          {#if usesDistance}
            <NumberField
              label={`Set ${i + 1} distance`}
              suffix="m"
              value={s.targetDistance ?? null}
              onchange={(n) => updatePrescribedSet(exercise, s.id, { targetDistance: n || undefined })}
            />
          {/if}
        </div>
      </fieldset>
    {/each}

    <NumberField
      label="Rest"
      mode="integer"
      suffix="s"
      value={exercise.restSeconds ?? null}
      onchange={(n) => setRest(exercise, n || undefined)}
    />
    <TextField
      label="Notes"
      multiline
      bind:value={() => exercise.notes ?? "", (v) => setNotes(exercise, v)}
    />
  </div>
</Sheet>

<style>
  .body {
    display: grid;
    gap: var(--space-3);
  }
  .set {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-3);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    min-inline-size: 0;
  }
  legend {
    padding-inline: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: var(--space-2);
  }
</style>
