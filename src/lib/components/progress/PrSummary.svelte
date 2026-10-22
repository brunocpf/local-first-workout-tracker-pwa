<script lang="ts">
  import { formatLocaleNumber } from "#lib/format";
  import { intlLocale } from "#lib/i18n.svelte";
  import { t } from "#lib/i18n.svelte";
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
  const when = (r: PrRecord) =>
    new Intl.DateTimeFormat(intlLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${r.date}T00:00:00Z`));
  const w = (kg: number) => `${formatLocaleNumber(displayWeight(kg, unit))} ${unit}`;

  type Row = { key: string; title: string; value: string; record: PrRecord };
  const rows = $derived.by(() => {
    const out: Row[] = [];
    const d = data;
    if (d.maxWeight) out.push({ key: "max", title: t("prs.max"), value: w(d.maxWeight.value), record: d.maxWeight });
    if (d.bestE1RM) out.push({ key: "e1rm", title: t("prs.e1rm"), value: w(d.bestE1RM.value), record: d.bestE1RM });
    if (d.bestSessionVolume)
      out.push({ key: "vol", title: t("prs.vol"), value: w(d.bestSessionVolume.value), record: d.bestSessionVolume });
    if (d.bestReps) out.push({ key: "reps", title: t("prs.reps"), value: t("prs.repsValue", { n: d.bestReps.value }), record: d.bestReps });
    for (const { reps, record } of d.repPRs)
      out.push({ key: `r${reps}`, title: t("prs.repMax", { reps }), value: w(record.value), record });
    return out;
  });
</script>

{#if rows.length}
  <ul class="group" aria-label={t("prs.label")}>
    {#each rows as r (r.key)}
      <li>
        <ListRow title={r.title} subtitle={when(r.record)} href={resolve(`/history/${r.record.sessionId}` as "/")}>
          {#snippet trailing()}<span class="value">{r.value}</span>{/snippet}
        </ListRow>
      </li>
    {/each}
  </ul>
  {#if data.bestE1RM}<p class="note">{t("prs.note")}</p>{/if}
{:else}
  <p class="note">{t("prs.none")}</p>
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
