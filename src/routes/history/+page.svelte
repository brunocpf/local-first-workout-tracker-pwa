<script lang="ts">
  import { formatDuration, formatLocaleNumber, formatPlainDate, formatZoned } from "#lib/format";
  import { t, tn } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import HistoryViewSwitch from "#lib/components/history/HistoryViewSwitch.svelte";
  import PastWorkoutDialog from "#lib/components/history/PastWorkoutDialog.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { sessionSummary } from "#lib/progress/summary";
  import { settings } from "#lib/settings.svelte";
  import { listCompletedSessions } from "#lib/storage/sessions";
  import { localWeekStart } from "#lib/time";
  import { displayWeight } from "#lib/units";
  import type { WorkoutSession } from "#lib/types";

  const PAGE = 20;

  let sessions = $state<WorkoutSession[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let loading = $state(false);
  let more = $state(false);
  let pastOpen = $state(false);

  async function load(before?: string) {
    loading = true;
    try {
      const page = await listCompletedSessions({ before, limit: PAGE });
      sessions = [...sessions, ...page];
      more = page.length === PAGE;
    } catch {
      failed = true;
    } finally {
      loading = false;
      loaded = true;
    }
  }

  onMount(() => load());

  const subtitle = (s: WorkoutSession) => {
    const x = sessionSummary(s);
    const parts = [
      `${formatZoned(s.startedAt, s.timeZone, { weekday: "short", month: "short", day: "numeric" })}, ${formatZoned(s.startedAt, s.timeZone, { hour: "numeric", minute: "2-digit" })}`,
      formatDuration(x.durationMs),
      tn("count.exercises", x.exerciseCount),
      tn("count.sets", x.completedSets),
    ];
    if (x.volumeKg > 0) parts.push(`${formatLocaleNumber(displayWeight(x.volumeKg, settings.weightUnit))} ${settings.weightUnit}`);
    return parts.join(" · ");
  };

  // Sessions arrive newest first, so same-week sessions are adjacent.
  const weeks = $derived.by(() => {
    const out: { key: string; label: string; sessions: WorkoutSession[] }[] = [];
    for (const s of sessions) {
      const key = localWeekStart(s, settings.weekStartsOn);
      let g = out.at(-1);
      if (g?.key !== key) {
        const label = formatPlainDate(key, { month: "short", day: "numeric" });
        out.push((g = { key, label: t("history.weekOf", { date: label }), sessions: [] }));
      }
      g.sessions.push(s);
    }
    return out;
  });
</script>

<PageHeader title={t("history.title")}>
  {#snippet actions()}
    <Button variant="secondary" size="md" icon="plus" onclick={() => (pastOpen = true)}>{t("history.logPast")}</Button>
  {/snippet}
</PageHeader>
<HistoryViewSwitch current="list" />
<PastWorkoutDialog bind:open={pastOpen} />

{#if failed}
  <EmptyState icon="alert-triangle" title={t("history.loadFailed")} body={t("history.reloadHint")} />
{:else if loaded && sessions.length === 0}
  <EmptyState icon="history" title={t("history.empty")} body={t("history.emptyBody")}>
    {#snippet action()}<Button variant="primary" href={resolve("/")}>{t("history.startWorkout")}</Button>{/snippet}
  </EmptyState>
{:else if loaded}
  {#each weeks as week (week.key)}
    <section aria-labelledby="w-{week.key}">
      <h2 id="w-{week.key}">{week.label}</h2>
      <ul class="group">
        {#each week.sessions as s (s.id)}
          <li><ListRow title={s.name} subtitle={subtitle(s)} href={resolve(`/history/${s.id}` as "/")} /></li>
        {/each}
      </ul>
    </section>
  {/each}
  {#if more}
    <div class="more">
      <Button variant="secondary" {loading} onclick={() => load(sessions.at(-1)?.startedAt)}>{t("history.loadMore")}</Button>
    </div>
  {/if}
{/if}

<style>
  section {
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }
  .more {
    display: flex;
    justify-content: center;
    padding-block: var(--space-4);
  }
</style>
