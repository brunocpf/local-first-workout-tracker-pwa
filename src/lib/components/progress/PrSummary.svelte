<script lang="ts">
  import { resolve } from "$app/paths";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import { prSummary, type PrRecord } from "#lib/progress/prSummary";
  import { displayWeight } from "#lib/units";
  import type { ExerciseType, WeightUnit, WorkoutSession } from "#lib/types";

  let {
    sessions,
    exerciseId,
    exerciseType,
    unit,
  }: { sessions: readonly WorkoutSession[]; exerciseId: string; exerciseType: ExerciseType; unit: WeightUnit } = $props();

  const data = $derived(prSummary(sessions, exerciseId, exerciseType));
  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
  const when = (r: PrRecord) => dateFmt.format(new Date(`${r.date}T00:00:00Z`));
  const w = (kg: number) => `${displayWeight(kg, unit).toLocaleString()} ${unit}`;

  type Row = { key: string; title: string; value: string; record: PrRecord };
  const rows = $derived.by(() => {
    const out: Row[] = [];
    const d = data;
    if (d.maxWeight) out.push({ key: "max", title: "Max weight", value: w(d.maxWeight.value), record: d.maxWeight });
    if (d.bestE1RM) out.push({ key: "e1rm", title: "Best estimated 1RM", value: w(d.bestE1RM.value), record: d.bestE1RM });
    if (d.bestSessionVolume)
      out.push({ key: "vol", title: "Best session volume", value: w(d.bestSessionVolume.value), record: d.bestSessionVolume });
    if (d.bestReps) out.push({ key: "reps", title: "Best reps in a set", value: `${d.bestReps.value} reps`, record: d.bestReps });
    for (const { reps, record } of d.repPRs)
      out.push({ key: `r${reps}`, title: `${reps}-rep max`, value: w(record.value), record });
    return out;
  });
</script>

{#if rows.length}
  <ul class="group" aria-label="Personal records">
    {#each rows as r (r.key)}
      <li>
        <ListRow title={r.title} subtitle={when(r.record)} href={resolve(`/history/${r.record.sessionId}` as "/")}>
          {#snippet trailing()}<span class="value">{r.value}</span>{/snippet}
        </ListRow>
      </li>
    {/each}
  </ul>
  {#if data.bestE1RM}<p class="note">Estimated 1RM is a calculation (Epley, 1–12 reps), not a tested max.</p>{/if}
{:else}
  <p class="note">No personal records yet.</p>
{/if}

<style>
  .value {
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-semibold);
  }
  .note {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
