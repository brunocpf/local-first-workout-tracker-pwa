<script lang="ts">
  import { onMount } from "svelte";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import LineChart from "#lib/components/charts/LineChart.svelte";
  import PrSummary from "#lib/components/progress/PrSummary.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import { exerciseSeries, rangeStart, type RangePreset } from "#lib/progress/series";
  import { settings } from "#lib/settings.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { completedSessionsWithExercise, listCompletedSessions } from "#lib/storage/sessions";
  import { displayWeight } from "#lib/units";
  import type { Exercise, WorkoutSession } from "#lib/types";

  const RECENT = 8;

  let recent = $state<Exercise[]>([]);
  let exercise = $state<Exercise>();
  let sessions = $state<WorkoutSession[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let pickerOpen = $state(false);
  let metric = $state("e1rm");
  let range = $state<string>("3M");

  onMount(async () => {
    try {
      const latest = await listCompletedSessions({ limit: 100 });
      const ids: string[] = [];
      for (const s of latest) for (const e of s.exercises) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
      recent = await getExercisesByIds(ids.slice(0, RECENT));
      if (recent[0]) await choose(recent[0]);
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  async function choose(e: Exercise) {
    exercise = e;
    sessions = await completedSessionsWithExercise(e.id);
  }

  const options = $derived(
    (exercise && !recent.some((e) => e.id === exercise!.id) ? [exercise, ...recent] : recent).map((e) => ({ value: e.id, label: e.name })),
  );
  const selectedId = {
    get value() {
      return exercise?.id ?? "";
    },
    set value(id: string) {
      const e = recent.find((x) => x.id === id);
      if (e) void choose(e).catch(() => (failed = true));
    },
  };

  const weighted = $derived(exercise?.exerciseType === "weighted_reps");
  const bodyweight = $derived(
    exercise?.exerciseType === "bodyweight_reps" ||
      exercise?.exerciseType === "weighted_bodyweight" ||
      exercise?.exerciseType === "assisted_bodyweight",
  );
  const unit = $derived(settings.weightUnit);
  const metricInfo = $derived.by(() => {
    if (bodyweight) return { name: "Best reps", unit: "reps" };
    if (metric === "max") return { name: "Max weight", unit };
    if (metric === "volume") return { name: "Session volume", unit };
    return { name: "Estimated 1RM", unit };
  });

  const points = $derived.by(() => {
    if (!exercise) return [];
    const from = rangeStart(range as RangePreset);
    const toUnit = (kg: number) => displayWeight(kg, unit);
    const out: { date: string; value: number }[] = [];
    for (const p of exerciseSeries(sessions, exercise.id, { from })) {
      const v = bodyweight
        ? p.bestReps
        : metric === "max"
          ? p.maxWeight !== undefined && toUnit(p.maxWeight)
          : metric === "volume"
            ? p.volume > 0 && toUnit(p.volume)
            : p.e1rm !== undefined && toUnit(p.e1rm);
      if (typeof v === "number") out.push({ date: p.date, value: v });
    }
    return out;
  });
  const latest = $derived(points.at(-1));
</script>

<PageHeader title="Progress" />

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load progress" body="Reload the app and try again." />
{:else if loaded && !exercise}
  <EmptyState icon="chart" title="No data yet" body="Complete a workout to see progress." />
{:else if exercise}
  <div class="controls">
    <Select label="Exercise" bind:value={selectedId.value} {options} />
    <Button variant="secondary" onclick={() => (pickerOpen = true)}>Choose another exercise</Button>
    {#if weighted}
      <SegmentedControl
        legend="Metric"
        bind:value={metric}
        options={[
          { value: "e1rm", label: "e1RM" },
          { value: "max", label: "Max weight" },
          { value: "volume", label: "Volume" },
        ]}
      />
    {/if}
    <SegmentedControl
      legend="Range"
      bind:value={range}
      options={["1M", "3M", "1Y", "All"].map((v) => ({ value: v, label: v }))}
    />
  </div>

  {#if !weighted && !bodyweight}
    <EmptyState icon="chart" title="No chart for this exercise type" body="Charts cover weight and rep based exercises." />
  {:else}
    <Card>
      {#if latest}
        <p class="headline"><span class="big tabular">{latest.value.toLocaleString()} {metricInfo.unit}</span> <span class="muted">{metricInfo.name}</span></p>
      {/if}
      <LineChart {points} label={`${metricInfo.name} for ${exercise.name}`} unit={metricInfo.unit} />
      {#if metricInfo.name === "Estimated 1RM"}
        <p class="muted small">Estimated 1RM is calculated from weight and reps (Epley); it is an estimate, not a tested max.</p>
      {/if}
    </Card>
  {/if}

  <h2>Personal records</h2>
  {#if sessions.length === 0}
    <p class="muted">No completed workouts with this exercise yet.</p>
  {:else}
    <PrSummary {sessions} exerciseId={exercise.id} exerciseType={exercise.exerciseType} {unit} />
  {/if}

  <ExercisePicker
    bind:open={pickerOpen}
    title="Choose exercise"
    allowCreate={false}
    onpick={(list) => list[0] && void choose(list[0]).catch(() => (failed = true))}
  />
{/if}

<style>
  .controls {
    display: grid;
    gap: var(--space-3);
    padding-block: var(--space-3);
  }
  .headline {
    margin: 0 0 var(--space-2);
  }
  .big {
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
  }
  .tabular {
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--color-text-muted);
  }
  .small {
    font-size: var(--text-sm);
    margin: var(--space-2) 0 0;
  }
  h2 {
    margin: var(--space-5) 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
</style>
