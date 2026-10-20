<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import StartRoutineButton from "#lib/components/routines/StartRoutineButton.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { settings } from "#lib/settings.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { getProgram, getRoutine } from "#lib/storage/routines";
  import { displayWeight } from "#lib/units";
  import type { PrescribedSet, Program, Routine } from "#lib/types";

  let routine = $state<Routine>();
  let program = $state<Program>();
  let names = $state<Record<string, string>>({});
  let loaded = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      const r = await getRoutine(page.params.id ?? "");
      if (r) {
        const [p, exercises] = await Promise.all([
          r.programId ? getProgram(r.programId) : undefined,
          getExercisesByIds(r.exercises.map((e) => e.exerciseId)),
        ]);
        program = p;
        names = Object.fromEntries(exercises.map((e) => [e.id, e.name]));
        routine = r;
      }
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const unit = $derived(settings.weightUnit);
  const back = { href: resolve("/routines"), label: "Routines" };
  const typeLabel: Record<PrescribedSet["type"], string> = { normal: "Working", warmup: "Warm-up", drop: "Drop", failure: "Failure" };

  function setText(s: PrescribedSet) {
    const parts: string[] = [];
    if (s.repRange) parts.push(s.repRange[0] === s.repRange[1] ? `${s.repRange[0]} reps` : `${s.repRange[0]}–${s.repRange[1]} reps`);
    if (s.targetWeight !== undefined) parts.push(`${displayWeight(s.targetWeight, unit).toLocaleString()} ${unit}`);
    if (s.targetDurationSeconds !== undefined) parts.push(`${s.targetDurationSeconds} s`);
    if (s.targetDistance !== undefined) parts.push(`${s.targetDistance} m`);
    if (s.targetRpe !== undefined) parts.push(`RPE ${s.targetRpe}`);
    if (s.targetRir !== undefined) parts.push(`${s.targetRir} RIR`);
    return parts.join(" · ") || "—";
  }

  const isSuperset = (i: number) => {
    const g = routine?.exercises[i].supersetGroupId;
    return g !== undefined && routine!.exercises.some((e, j) => j !== i && e.supersetGroupId === g);
  };
</script>

{#if failed}
  <PageHeader title="Routine" {back} />
  <EmptyState icon="alert-triangle" title="Couldn’t load the routine" body="Reload the app and try again." />
{:else if !loaded}
  <PageHeader title="Routine" {back} />
{:else if !routine}
  <PageHeader title="Routine" {back} />
  <EmptyState icon="list" title="Routine not found" body="It may have been deleted.">
    {#snippet action()}<Button variant="primary" href={resolve("/routines")}>Back to Routines</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={routine.name} subtitle={program?.name} {back}>
    {#snippet actions()}<StartRoutineButton routine={routine!} variant="primary" size="md">Start workout</StartRoutineButton>{/snippet}
  </PageHeader>
  {#if routine.description}<p class="desc">{routine.description}</p>{/if}
  {#if routine.exercises.length === 0}
    <EmptyState icon="list" title="No exercises" body="This routine has no exercises." />
  {:else}
    <ol class="list">
      {#each routine.exercises as ex, i (ex.id)}
        <li>
          <Card>
            <div class="head">
              <h2>{names[ex.exerciseId] ?? "Unknown exercise"}</h2>
              {#if isSuperset(i)}<Badge variant="info">Superset</Badge>{/if}
            </div>
            {#if ex.restSeconds !== undefined}<p class="meta">Rest {ex.restSeconds} s</p>{/if}
            <ul class="sets" aria-label="Prescribed sets">
              {#each ex.prescribedSets as s, si (s.id)}
                <li><span class="kind">{si + 1}. {typeLabel[s.type]}</span><span>{setText(s)}</span></li>
              {/each}
            </ul>
            {#if ex.notes}<p class="meta">{ex.notes}</p>{/if}
          </Card>
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<style>
  .desc,
  .meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin: var(--space-2) 0 0;
  }
  .list {
    list-style: none;
    margin: var(--space-4) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .sets {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  .sets li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-1);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .kind {
    color: var(--color-text-muted);
  }
</style>
