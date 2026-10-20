<script lang="ts">
  import { sessionSummary } from "#lib/progress/summary";
  import { displayWeight } from "#lib/units";
  import Button from "#lib/components/ui/Button.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import type { WeightUnit, WorkoutSession } from "#lib/types";

  let { session, unit, ondone }: { session: WorkoutSession; unit: WeightUnit; ondone: () => void } = $props();

  let open = $state(true);
  const summary = $derived(sessionSummary(session));
  const minutes = $derived(Math.round(summary.durationMs / 60000));
  const duration = $derived(minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`);
  const volume = $derived(displayWeight(summary.volumeKg, unit).toLocaleString(undefined, { maximumFractionDigits: 0 }));
  const stats = $derived([
    ["Duration", duration],
    ["Exercises", String(summary.exerciseCount)],
    ["Sets", String(summary.completedSets)],
    ["Volume", `${volume} ${unit}`],
  ]);
</script>

<Sheet bind:open title="Workout complete" description={session.name} dismissible={false}>
  <dl class="stats">
    {#each stats as [label, value] (label)}
      <div class="stat">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    {/each}
  </dl>
  {#snippet actions()}
    <Button variant="primary" block onclick={ondone}>Done</Button>
  {/snippet}
</Sheet>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
    margin: 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  dt {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  dd {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
</style>
