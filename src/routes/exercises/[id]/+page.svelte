<script lang="ts">
  import { equipmentLabel, exerciseTypeLabel, muscleLabel } from "#lib/catalog/labels";
  import { formatLocaleNumber, formatZoned } from "#lib/format";
  import { t, tn } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PrSummary from "#lib/components/progress/PrSummary.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { bestSet } from "#lib/progress/bestSet";
  import { settings } from "#lib/settings.svelte";
  import { getExercise, setFavorite } from "#lib/storage/exercises";
  import { localizeExercise } from "#lib/catalog/localize";
  import { completedSessionsWithExercise } from "#lib/storage/sessions";
  import { displayWeight } from "#lib/units";
  import type { Exercise, LoggedSet, WorkoutSession } from "#lib/types";

  let exercise = $state<Exercise>();
  let sessions = $state<WorkoutSession[]>([]);
  let allSessions = $state<WorkoutSession[]>([]);
  let loaded = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      const id = page.params.id ?? "";
      exercise = await getExercise(id);
      if (exercise) exercise = localizeExercise(exercise);
      if (exercise) {
        allSessions = await completedSessionsWithExercise(id);
        sessions = allSessions.slice(0, 10);
      }
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const list = (labels: string[]) => labels.join(", ");

  const guideUrl = $derived.by(() => {
    const candidates = [exercise?.source?.sourceUrl, ...(exercise?.media ?? []).filter((m) => m.type === "external_link").map((m) => m.url)];
    return candidates.find((u) => {
      try {
        return /^https?:$/.test(new URL(u ?? "").protocol);
      } catch {
        return false;
      }
    });
  });

  async function toggleFavorite() {
    if (!exercise) return;
    const next = !exercise.favorite;
    exercise.favorite = next;
    try {
      await setFavorite(exercise.id, next);
    } catch {
      exercise.favorite = !next;
    }
  }

  const unit = $derived(settings.weightUnit);
  function setText(s: LoggedSet) {
    const parts: string[] = [];
    if (s.weight !== undefined) parts.push(`${formatLocaleNumber(displayWeight(s.weight, unit))} ${unit}`);
    if (s.reps !== undefined) parts.push(`× ${s.reps}`);
    if (s.durationSeconds !== undefined) parts.push(`${s.durationSeconds} s`);
    if (s.distance !== undefined) parts.push(`${s.distance} m`);
    return parts.join(" ");
  }
  const dayLabel = (s: WorkoutSession) => formatZoned(s.startedAt, s.timeZone, { dateStyle: "medium" });
  function historySubtitle(s: WorkoutSession) {
    const se = s.exercises.find((e) => e.exerciseId === exercise?.id);
    const best = se ? bestSet(se.sets, se.exerciseTypeSnapshot) : undefined;
    return (best && setText(best)) || t("ex.noSets");
  }

  const back = { href: resolve("/exercises"), label: t("ex.back") };
</script>

{#if failed}
  <PageHeader title={t("ex.detail.title")} {back} />
  <EmptyState icon="alert-triangle" title={t("ex.loadOneFailed")} body={t("history.reloadHint")} />
{:else if loaded && !exercise}
  <PageHeader title={t("ex.detail.title")} {back} />
  <EmptyState icon="search" title={t("ex.notFound")} />
{:else if exercise}
  <PageHeader title={exercise.name} {back}>
    {#snippet actions()}
      <IconButton icon="star" label={exercise?.favorite ? t("ex.unfavorite") : t("ex.favorite")} pressed={!!exercise?.favorite} onclick={toggleFavorite} />
      {#if exercise?.isCustom}
        <IconButton icon="edit" label={t("ex.edit")} href={resolve(`/exercises/${exercise.id}/edit` as "/")} />
      {/if}
    {/snippet}
  </PageHeader>

  <dl class="facts">
    <div><dt>{t("ex.type")}</dt><dd>{exerciseTypeLabel(exercise.exerciseType)}</dd></div>
    {#if exercise.equipment.length}<div><dt>{t("ex.equipment")}</dt><dd>{list(exercise.equipment.map(equipmentLabel))}</dd></div>{/if}
    {#if exercise.primaryMuscles.length}<div><dt>{t("ex.primary")}</dt><dd>{list(exercise.primaryMuscles.map(muscleLabel))}</dd></div>{/if}
    {#if exercise.secondaryMuscles.length}<div><dt>{t("ex.secondary")}</dt><dd>{list(exercise.secondaryMuscles.map(muscleLabel))}</dd></div>{/if}
  </dl>

  {#if exercise.instructions}
    <section>
      <h2>{t("ex.instructions")}</h2>
      <p class="prose">{exercise.instructions}</p>
    </section>
  {/if}
  {#if exercise.formCues?.length}
    <section>
      <h2>{t("ex.cues")}</h2>
      <ul class="cues">
        {#each exercise.formCues as cue, i (i)}<li>{cue}</li>{/each}
      </ul>
    </section>
  {/if}
  {#if guideUrl}
    <section>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, validated http(s) -->
      <a class="guide" href={guideUrl} target="_blank" rel="noopener noreferrer">{t("ex.guide")}</a>
    </section>
  {/if}

  {#if allSessions.length}
    <section>
      <h2>{t("ex.records")}</h2>
      <PrSummary sessions={allSessions} exerciseId={exercise.id} exerciseType={exercise.exerciseType} {unit} />
    </section>
  {/if}

  <section>
    <h2>{t("ex.recent")}</h2>
    {#if sessions.length === 0}
      <p class="muted">{t("ex.noHistory")}</p>
    {:else}
      <ul class="group" aria-label={t("ex.recent")}>
        {#each sessions as s (s.id)}
          <li><ListRow title={dayLabel(s)} subtitle={historySubtitle(s)} href={resolve(`/history/${s.id}` as "/")} /></li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .facts {
    margin: 0;
    padding-block: var(--space-3);
    display: grid;
    gap: var(--space-2);
  }
  .facts div {
    display: flex;
    gap: var(--space-3);
  }
  dt {
    flex: none;
    inline-size: 8.5rem;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  dd {
    margin: 0;
  }
  section {
    padding-block: var(--space-3);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .prose {
    margin: 0;
    white-space: pre-line;
  }
  .muted {
    margin: 0;
    color: var(--color-text-muted);
  }
  .cues {
    margin: 0;
    padding-inline-start: var(--space-5);
  }
  .guide {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    color: var(--color-accent-text);
  }
</style>
