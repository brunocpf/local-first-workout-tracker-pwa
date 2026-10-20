<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
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

  const zoned = (s: WorkoutSession, opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Date(s.startedAt).toLocaleString(undefined, { ...opts, timeZone: s.timeZone });
    } catch {
      return new Date(s.startedAt).toLocaleString(undefined, { ...opts, timeZone: "UTC" });
    }
  };

  function duration(ms: number) {
    const min = Math.round(ms / 60_000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
  }

  const subtitle = (s: WorkoutSession) => {
    const x = sessionSummary(s);
    const parts = [
      `${zoned(s, { weekday: "short", month: "short", day: "numeric" })}, ${zoned(s, { hour: "numeric", minute: "2-digit" })}`,
      duration(x.durationMs),
      `${x.exerciseCount} ${x.exerciseCount === 1 ? "exercise" : "exercises"}`,
      `${x.completedSets} ${x.completedSets === 1 ? "set" : "sets"}`,
    ];
    if (x.volumeKg > 0) parts.push(`${displayWeight(x.volumeKg, settings.weightUnit).toLocaleString()} ${settings.weightUnit}`);
    return parts.join(" · ");
  };

  // Sessions arrive newest first, so same-week sessions are adjacent.
  const weeks = $derived.by(() => {
    const out: { key: string; label: string; sessions: WorkoutSession[] }[] = [];
    for (const s of sessions) {
      const key = localWeekStart(s, settings.weekStartsOn);
      let g = out.at(-1);
      if (g?.key !== key) {
        const [y, m, d] = key.split("-").map(Number);
        const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        out.push((g = { key, label: `Week of ${label}`, sessions: [] }));
      }
      g.sessions.push(s);
    }
    return out;
  });
</script>

<PageHeader title="History" />

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load history" body="Reload the app and try again." />
{:else if loaded && sessions.length === 0}
  <EmptyState icon="history" title="No workouts yet" body="Finished workouts show up here.">
    {#snippet action()}<Button variant="primary" href={resolve("/")}>Start workout</Button>{/snippet}
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
      <Button variant="secondary" {loading} onclick={() => load(sessions.at(-1)?.startedAt)}>Load more</Button>
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
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  li + li {
    border-block-start: var(--border-w) solid var(--color-border);
    margin-inline-start: var(--space-4);
  }
  .more {
    display: flex;
    justify-content: center;
    padding-block: var(--space-4);
  }
</style>
