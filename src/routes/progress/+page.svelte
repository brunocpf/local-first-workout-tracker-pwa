<script lang="ts">
  import { formatDuration, formatLocaleNumber } from "#lib/format";
  import { intlLocale } from "#lib/i18n.svelte";
  import { muscleLabel } from "#lib/catalog/labels";
  import { t } from "#lib/i18n.svelte";
  import { localizeExercises } from "#lib/catalog/localize";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import LineChart from "#lib/components/charts/LineChart.svelte";
  import PrSummary from "#lib/components/progress/PrSummary.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import { monthlyStats } from "#lib/progress/monthly";
  import { weeklySetsByMuscle } from "#lib/progress/muscles";
  import { exerciseSeries, rangeStart, type RangePreset } from "#lib/progress/series";
  import { settings } from "#lib/settings.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { completedSessionsWithExercise, listCompletedSessions } from "#lib/storage/sessions";
  import { currentTimeZone, localDate, localWeekStart } from "#lib/time";
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
  let allSessions = $state<WorkoutSession[]>([]);
  let catalog = $state(new Map<string, Exercise>());
  let weeks = $state("4");
  let monthOffset = $state(0);

  onMount(async () => {
    try {
      allSessions = await listCompletedSessions({ limit: 10_000 });
      const ids: string[] = [];
      for (const s of allSessions.slice(0, 100)) for (const e of s.exercises) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
      recent = localizeExercises(await getExercisesByIds(ids.slice(0, RECENT)));
      const every = new Set(allSessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
      catalog = new Map(localizeExercises(await getExercisesByIds([...every])).map((e) => [e.id, e]));
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
    if (bodyweight) return { name: t("pg2.bestReps"), unit: t("pg2.reps") };
    if (metric === "max") return { name: t("pg2.maxWeight"), unit };
    if (metric === "volume") return { name: t("pg2.sessionVolume"), unit };
    return { name: t("pg2.estimated"), unit };
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

  // Weekly sets per muscle over the last N weeks (current week included), shown as weekly average.
  const WEEK_MS = 7 * 86_400_000;
  const muscleRows = $derived.by(() => {
    const n = Number(weeks);
    const tz = currentTimeZone();
    const startOf = (t: number) => localWeekStart({ startedAt: new Date(t).toISOString(), timeZone: tz }, settings.weekStartsOn);
    const now = Date.now();
    const keys = new Set(Array.from({ length: n }, (_, i) => startOf(now - i * WEEK_MS)));
    const byWeek = weeklySetsByMuscle(allSessions, catalog, settings.weekStartsOn);
    const totals: Record<string, number> = {};
    for (const [week, sets] of Object.entries(byWeek)) {
      if (!keys.has(week)) continue;
      for (const [m, v] of Object.entries(sets)) totals[m] = (totals[m] ?? 0) + (v ?? 0);
    }
    const rows = Object.entries(totals).map(([m, total]) => ({ muscle: m, total, avg: total / n }));
    rows.sort((a, b) => b.total - a.total || a.muscle.localeCompare(b.muscle));
    const max = Math.max(...rows.map((r) => r.avg), 1);
    return rows.map((r) => ({ ...r, pct: (r.avg / max) * 100 }));
  });
  const fmt1 = (v: number) => formatLocaleNumber(Number(v.toFixed(1)));

  // Monthly stats with navigation; month keys are local "YYYY-MM".
  const thisMonth = localDate({ startedAt: new Date().toISOString(), timeZone: currentTimeZone() }).slice(0, 7);
  const monthKey = $derived.by(() => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const monthName = $derived(
    new Intl.DateTimeFormat(intlLocale(), { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00Z`)),
  );
  const monthly = $derived(monthlyStats(allSessions));
  const month = $derived(monthly.find((m) => m.month === monthKey));
  const earliest = $derived(monthly[0]?.month ?? thisMonth);
  const duration = (s: number) => formatDuration(s * 1000);
  const monthTiles = $derived([
    { label: t("pg2.workouts"), value: String(month?.sessions ?? 0) },
    { label: t("pg2.totalTime"), value: duration(month?.durationSeconds ?? 0) },
    { label: t("pg2.volumeUnit", { unit }), value: formatLocaleNumber(displayWeight(month?.volume ?? 0, unit)) },
    { label: t("pg2.sets"), value: String(month?.completedSets ?? 0) },
  ]);
</script>

<PageHeader title={t("pg2.title")} />

<div class="body-link">
  <Card padding="none">
    <ListRow title={t("pg2.body")} subtitle={t("pg2.bodyHint")} href={resolve("/progress/body")} />
  </Card>
</div>

{#if failed}
  <EmptyState icon="alert-triangle" title={t("pg2.loadFailed")} body={t("history.reloadHint")} />
{:else if loaded && !exercise}
  <EmptyState icon="chart" title={t("pg2.noData")} body={t("pg2.noDataBody")} />
{:else if exercise}
  <h2>{t("pg2.weeklySets")}</h2>
  <div class="controls">
    <SegmentedControl
      legend={t("pg2.period")}
      bind:value={weeks}
      options={[
        { value: "4", label: t("pg2.last4") },
        { value: "8", label: t("pg2.last8") },
      ]}
    />
  </div>
  {#if muscleRows.length === 0}
    <p class="muted">{t("pg2.noSets", { weeks })}</p>
  {:else}
    <Card>
      <ul class="bars" aria-label={t("pg2.avgSets")}>
        {#each muscleRows as r (r.muscle)}
          <li>
            <span class="name">{muscleLabel(r.muscle)}</span>
            <span class="track" aria-hidden="true"><span class="fill" style:inline-size="{r.pct}%"></span></span>
            <span class="val tabular">{fmt1(r.avg)}<span class="muted">{t("pg2.perWeek")}</span></span>
          </li>
        {/each}
      </ul>
      <details class="data">
        <summary>{t("pg2.viewTable")}</summary>
        <table>
          <caption>{t("pg2.caption", { weeks })}</caption>
          <thead><tr><th scope="col">{t("pg2.colMuscle")}</th><th scope="col">{t("pg2.colAvg")}</th><th scope="col">{t("pg2.colTotal")}</th></tr></thead>
          <tbody>
            {#each muscleRows as r (r.muscle)}
              <tr><th scope="row">{muscleLabel(r.muscle)}</th><td class="tabular">{fmt1(r.avg)}</td><td class="tabular">{fmt1(r.total)}</td></tr>
            {/each}
          </tbody>
        </table>
      </details>
      <p class="muted small">{t("pg2.estimate")}</p>
    </Card>
  {/if}

  <h2>{t("pg2.monthly")}</h2>
  <div class="months">
    <IconButton icon="chevron-left" label={t("history.prev")} disabled={monthKey <= earliest} onclick={() => monthOffset--} />
    <p class="month-name" aria-live="polite">{monthName}</p>
    <IconButton icon="chevron-right" label={t("history.next")} disabled={monthOffset >= 0} onclick={() => monthOffset++} />
  </div>
  <ul class="tiles" aria-label={t("pg2.statsFor", { month: monthName })}>
    {#each monthTiles as tile (tile.label)}
      <li>
        <Card>
          <p class="tv tabular">{tile.value}</p>
          <p class="muted small">{tile.label}</p>
        </Card>
      </li>
    {/each}
  </ul>

  <h2>{t("pg2.exerciseProgress")}</h2>
  <div class="controls">
    <Select label={t("pg2.exercise")} bind:value={selectedId.value} {options} />
    <Button variant="secondary" onclick={() => (pickerOpen = true)}>{t("pg2.chooseAnother")}</Button>
    {#if weighted}
      <SegmentedControl
        legend={t("pg2.metric")}
        bind:value={metric}
        options={[
          { value: "e1rm", label: t("pg2.e1rm") },
          { value: "max", label: t("pg2.maxWeight") },
          { value: "volume", label: t("pg2.volume") },
        ]}
      />
    {/if}
    <SegmentedControl
      legend={t("pg2.range")}
      bind:value={range}
      options={["1M", "3M", "1Y", "All"].map((v) => ({ value: v, label: v === "All" ? t("pg2.all") : v }))}
    />
  </div>

  {#if !weighted && !bodyweight}
    <EmptyState icon="chart" title={t("pg2.noChart")} body={t("pg2.noChartBody")} />
  {:else}
    <Card>
      {#if latest}
        <p class="headline"><span class="big tabular">{formatLocaleNumber(latest.value)} {metricInfo.unit}</span> <span class="muted">{metricInfo.name}</span></p>
      {/if}
      <LineChart {points} label={t("pg2.chartLabel", { metric: metricInfo.name, name: exercise.name })} unit={metricInfo.unit} />
      {#if !bodyweight && metric !== "max" && metric !== "volume"}
        <p class="muted small">{t("pg2.epley")}</p>
      {/if}
    </Card>
  {/if}

  <h2>{t("pg2.records")}</h2>
  {#if sessions.length === 0}
    <p class="muted">{t("ex.noHistory")}</p>
  {:else}
    <PrSummary {sessions} exerciseId={exercise.id} exerciseType={exercise.exerciseType} {unit} />
  {/if}

  <ExercisePicker
    bind:open={pickerOpen}
    title={t("imp.chooseExercise")}
    allowCreate={false}
    onpick={(list) => list[0] && void choose(list[0]).catch(() => (failed = true))}
  />
{/if}

<style>
  .body-link {
    padding-block-start: var(--space-3);
  }
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
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(5rem, 8rem) 1fr auto;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--tap-min);
    font-size: var(--text-sm);
  }
  .track {
    block-size: 0.75rem;
    background: var(--color-surface-2);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .fill {
    display: block;
    block-size: 100%;
    background: var(--color-accent);
  }
  .val {
    text-align: end;
    font-weight: var(--weight-semibold);
  }
  .data {
    margin-block-start: var(--space-3);
    font-size: var(--text-sm);
  }
  .data summary {
    min-block-size: var(--tap-min);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
  }
  caption {
    text-align: start;
    color: var(--color-text-muted);
    padding-block-end: var(--space-1);
  }
  th,
  td {
    text-align: start;
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    border-block-end: var(--border-w) solid var(--color-border);
    font-weight: var(--weight-regular);
  }
  thead th {
    font-weight: var(--weight-semibold);
  }
  .months {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-3);
  }
  .month-name {
    margin: 0;
    text-align: center;
    font-weight: var(--weight-semibold);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tv {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
  }
</style>
