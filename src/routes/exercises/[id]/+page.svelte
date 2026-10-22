<script lang="ts">
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

  const words = (ids: string[]) => ids.map((id) => id.replaceAll("_", " "));
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const typeLabel = (t: string) => capitalize(t.replaceAll("_", " "));
  const list = (ids: string[]) => capitalize(words(ids).join(", "));

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
    if (s.weight !== undefined) parts.push(`${displayWeight(s.weight, unit).toLocaleString()} ${unit}`);
    if (s.reps !== undefined) parts.push(`× ${s.reps}`);
    if (s.durationSeconds !== undefined) parts.push(`${s.durationSeconds} s`);
    if (s.distance !== undefined) parts.push(`${s.distance} m`);
    return parts.join(" ");
  }
  function dayLabel(s: WorkoutSession) {
    let timeZone: string | undefined = s.timeZone;
    try {
      return new Date(s.startedAt).toLocaleDateString(undefined, { dateStyle: "medium", timeZone });
    } catch {
      return new Date(s.startedAt).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
    }
  }
  function historySubtitle(s: WorkoutSession) {
    const se = s.exercises.find((e) => e.exerciseId === exercise?.id);
    const best = se ? bestSet(se.sets, se.exerciseTypeSnapshot) : undefined;
    return (best && setText(best)) || "No completed sets";
  }

  const back = { href: resolve("/exercises"), label: "Back to exercises" };
</script>

{#if failed}
  <PageHeader title="Exercise" {back} />
  <EmptyState icon="alert-triangle" title="Couldn’t load exercise" body="Reload the app and try again." />
{:else if loaded && !exercise}
  <PageHeader title="Exercise" {back} />
  <EmptyState icon="search" title="Exercise not found" />
{:else if exercise}
  <PageHeader title={exercise.name} {back}>
    {#snippet actions()}
      <IconButton icon="star" label={exercise?.favorite ? "Remove from favorites" : "Add to favorites"} pressed={!!exercise?.favorite} onclick={toggleFavorite} />
      {#if exercise?.isCustom}
        <IconButton icon="edit" label="Edit exercise" href={resolve(`/exercises/${exercise.id}/edit` as "/")} />
      {/if}
    {/snippet}
  </PageHeader>

  <dl class="facts">
    <div><dt>Type</dt><dd>{typeLabel(exercise.exerciseType)}</dd></div>
    {#if exercise.equipment.length}<div><dt>Equipment</dt><dd>{list(exercise.equipment)}</dd></div>{/if}
    {#if exercise.primaryMuscles.length}<div><dt>Primary muscles</dt><dd>{list(exercise.primaryMuscles)}</dd></div>{/if}
    {#if exercise.secondaryMuscles.length}<div><dt>Secondary muscles</dt><dd>{list(exercise.secondaryMuscles)}</dd></div>{/if}
  </dl>

  {#if exercise.instructions}
    <section>
      <h2>Instructions</h2>
      <p class="prose">{exercise.instructions}</p>
    </section>
  {/if}
  {#if exercise.formCues?.length}
    <section>
      <h2>Form cues</h2>
      <ul class="cues">
        {#each exercise.formCues as cue, i (i)}<li>{cue}</li>{/each}
      </ul>
    </section>
  {/if}
  {#if guideUrl}
    <section>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, validated http(s) -->
      <a class="guide" href={guideUrl} target="_blank" rel="noopener noreferrer">External guide (opens in browser)</a>
    </section>
  {/if}

  {#if allSessions.length}
    <section>
      <h2>Personal records</h2>
      <PrSummary sessions={allSessions} exerciseId={exercise.id} exerciseType={exercise.exerciseType} {unit} />
    </section>
  {/if}

  <section>
    <h2>Recent history</h2>
    {#if sessions.length === 0}
      <p class="muted">No completed workouts with this exercise yet.</p>
    {:else}
      <ul class="group" aria-label="Recent history">
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
