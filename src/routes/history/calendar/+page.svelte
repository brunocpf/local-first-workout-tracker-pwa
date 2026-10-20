<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import HistoryViewSwitch from "#lib/components/history/HistoryViewSwitch.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { monthGrid, monthQueryRange, sessionsByLocalDate, shiftMonth } from "#lib/progress/calendar";
  import { sessionSummary } from "#lib/progress/summary";
  import { settings } from "#lib/settings.svelte";
  import { listCompletedSessionsBetween } from "#lib/storage/sessions";
  import { currentTimeZone, localDate } from "#lib/time";
  import type { WorkoutSession } from "#lib/types";

  const today = localDate({ startedAt: new Date().toISOString(), timeZone: currentTimeZone() });
  let year = $state(+today.slice(0, 4));
  let month = $state(+today.slice(5, 7));
  let sessions = $state<WorkoutSession[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let selected = $state<string>();
  let request = 0;

  async function load() {
    const mine = ++request;
    const { from, to } = monthQueryRange(year, month);
    try {
      const rows = await listCompletedSessionsBetween(from, to);
      if (mine !== request) return;
      sessions = rows;
      failed = false;
    } catch {
      if (mine === request) failed = true;
    } finally {
      if (mine === request) loaded = true;
    }
  }

  onMount(load);

  function go(delta: number) {
    ({ year, month } = shiftMonth(year, month, delta));
    selected = undefined;
    load();
  }

  function goToday() {
    year = +today.slice(0, 4);
    month = +today.slice(5, 7);
    selected = undefined;
    load();
  }

  const byDate = $derived(sessionsByLocalDate(sessions));
  const grid = $derived(monthGrid(year, month, settings.weekStartsOn));
  const isCurrentMonth = $derived(year === +today.slice(0, 4) && month === +today.slice(5, 7));
  const inMonthCount = $derived(grid.flat().reduce((n, d) => n + (d.inMonth ? (byDate.get(d.date)?.length ?? 0) : 0), 0));

  // Plain dates ("YYYY-MM-DD") are formatted as UTC so the device zone can never move them.
  const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
  };
  const monthLabel = $derived(fmt(`${year}-${String(month).padStart(2, "0")}-01`, { month: "long", year: "numeric" }));
  const weekdays = $derived(grid[0].map((d) => ({ narrow: fmt(d.date, { weekday: "narrow" }), full: fmt(d.date, { weekday: "long" }) })));
  const countLabel = (n: number) => `${n} ${n === 1 ? "workout" : "workouts"}`;

  const dayLabel = (date: string) => {
    const n = byDate.get(date)?.length ?? 0;
    return `${fmt(date, { weekday: "long", day: "numeric", month: "long" })}${n > 0 ? `, ${countLabel(n)}` : ""}`;
  };

  const selectedSessions = $derived(selected ? (byDate.get(selected) ?? []) : []);

  const subtitle = (s: WorkoutSession) => {
    const x = sessionSummary(s);
    let time: string;
    try {
      time = new Date(s.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: s.timeZone });
    } catch {
      time = new Date(s.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    }
    return [time, `${x.exerciseCount} ${x.exerciseCount === 1 ? "exercise" : "exercises"}`, `${x.completedSets} ${x.completedSets === 1 ? "set" : "sets"}`].join(" · ");
  };
</script>

<svelte:head><title>Calendar · Workouts</title></svelte:head>

<PageHeader title="History" />
<HistoryViewSwitch current="calendar" />

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load history" body="Reload the app and try again." />
{:else}
  <div class="nav">
    <IconButton icon="chevron-left" label="Previous month" onclick={() => go(-1)} />
    <h2 aria-live="polite">{monthLabel}</h2>
    <IconButton icon="chevron-right" label="Next month" onclick={() => go(1)} />
  </div>
  {#if !isCurrentMonth}
    <div class="today"><Button variant="secondary" size="sm" onclick={goToday}>Today</Button></div>
  {/if}

  <table aria-label={monthLabel}>
    <thead>
      <tr>
        {#each weekdays as w (w.full)}
          <th scope="col" abbr={w.full}><span aria-hidden="true">{w.narrow}</span><span class="sr">{w.full}</span></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each grid as week (week[0].date)}
        <tr>
          {#each week as day (day.date)}
            {@const n = day.inMonth ? (byDate.get(day.date)?.length ?? 0) : 0}
            <td class:outside={!day.inMonth}>
              {#if day.inMonth}
                {#if n > 0}
                  <button
                    type="button"
                    class="day has"
                    class:today={day.date === today}
                    aria-pressed={selected === day.date}
                    aria-label={dayLabel(day.date)}
                    onclick={() => (selected = selected === day.date ? undefined : day.date)}
                  >
                    <span class="num">{+day.date.slice(8)}</span>
                    <span class="count" aria-hidden="true">{n}</span>
                  </button>
                {:else}
                  <div class="day" class:today={day.date === today}>
                    <span class="num">{+day.date.slice(8)}</span>
                  </div>
                {/if}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  {#if loaded}
    {#if selected}
      <section aria-labelledby="day-h">
        <h3 id="day-h">{fmt(selected, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</h3>
        <ul class="group">
          {#each selectedSessions as s (s.id)}
            <li><ListRow title={s.name} subtitle={subtitle(s)} href={resolve(`/history/${s.id}` as "/")} /></li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="hint">
        {inMonthCount > 0 ? `${countLabel(inMonthCount)} this month. Select a day to see them.` : "No workouts this month."}
      </p>
    {/if}
  {/if}
{/if}

<style>
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    text-align: center;
  }
  .today {
    display: flex;
    justify-content: center;
    margin-block-start: var(--space-1);
  }
  table {
    inline-size: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-block-start: var(--space-2);
  }
  th {
    padding-block: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }
  td {
    padding: 1px;
    text-align: center;
  }
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .day {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    inline-size: 100%;
    min-block-size: var(--tap-min);
    padding: var(--space-1) 0;
    background: none;
    border: var(--border-w) solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .day.today .num {
    font-weight: var(--weight-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  button.day {
    cursor: pointer;
    background: var(--color-surface-2);
    border-color: var(--color-border-strong);
  }
  button.day:hover {
    background: var(--color-surface-3);
  }
  button.day[aria-pressed="true"] {
    background: var(--color-accent-subtle);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
    font-weight: var(--weight-semibold);
  }
  .count {
    min-inline-size: 1.25em;
    padding-inline: 4px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    font-weight: var(--weight-semibold);
  }
  section {
    margin-block-start: var(--space-4);
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }
  .hint {
    margin-block: var(--space-4);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  @media (forced-colors: active) {
    button.day[aria-pressed="true"] {
      background: Highlight;
      color: HighlightText;
    }
    .count {
      border: var(--border-w) solid ButtonText;
    }
  }
</style>
