<script lang="ts">
  import { formatDuration, formatLocaleNumber, formatZoned } from "#lib/format";
  import { setTypeLabel } from "#lib/catalog/labels";
  import { t, tn } from "#lib/i18n.svelte";
  import { exerciseLabel } from "#lib/catalog/localize";
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { formatEffort } from "#lib/logger/effort";
  import { exerciseVolume, isCounted } from "#lib/progress/metrics";
  import { sessionSummary } from "#lib/progress/summary";
  import { loadPriorPrSessions, prSetIds } from "#lib/progress/sessionPrs";
  import { settings } from "#lib/settings.svelte";
  import { deleteCompletedSession, getSession } from "#lib/storage/sessions";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import { displayWeight } from "#lib/units";
  import type { LoggedSet, WorkoutSession } from "#lib/types";

  let session = $state<WorkoutSession>();
  let loaded = $state(false);
  let failed = $state(false);
  let deleting = $state(false);

  onMount(async () => {
    try {
      const s = await getSession(page.params.id ?? "");
      session = s?.status === "completed" ? s : undefined;
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const dayLabel = (s: WorkoutSession) => formatZoned(s.startedAt, s.timeZone, { weekday: "short", day: "numeric", month: "short" });
  const when = (s: WorkoutSession) =>
    `${formatZoned(s.startedAt, s.timeZone, { dateStyle: "medium" })}, ${formatZoned(s.startedAt, s.timeZone, { hour: "numeric", minute: "2-digit" })}`;

  // Sets that were a new PR when logged: computed from sessions before this one, never stored.
  let prIds = $state<ReadonlySet<string>>(new Set());
  $effect(() => {
    const s = session;
    if (!s) return;
    let cancelled = false;
    void (async () => {
      try {
        const ids = new SvelteSet<string>();
        for (const exerciseId of new SvelteSet(s.exercises.filter((e) => e.exerciseTypeSnapshot === "weighted_reps").map((e) => e.exerciseId))) {
          const prior = await loadPriorPrSessions(exerciseId, s);
          const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
          for (const id of prSetIds(prior, { startedAt: s.startedAt, sets })) ids.add(id);
        }
        if (!cancelled) prIds = ids;
      } catch {
        // Badges are optional; the session still renders without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const unit = $derived(settings.weightUnit);
  const weight = (kg: number) => formatLocaleNumber(displayWeight(kg, unit));
  const summary = $derived(session ? sessionSummary(session) : undefined);

  /** Same numbering as the logger: only normal sets are numbered (warm-up, drop and failure sets get badges). */
  function setLabel(sets: LoggedSet[], i: number) {
    return String(sets.slice(0, i + 1).filter((s) => s.type === "normal").length);
  }
  const typeBadge = { warmup: "neutral", drop: "info", failure: "danger" } as const;

  function setText(s: LoggedSet) {
    const parts: string[] = [];
    if (s.weight !== undefined) parts.push(`${weight(s.weight)} ${unit}`);
    if (s.reps !== undefined) parts.push(`× ${s.reps}`);
    if (s.durationSeconds !== undefined) parts.push(`${s.durationSeconds} s`);
    if (s.distance !== undefined) parts.push(`${s.distance} m`);
    const effort = formatEffort(s, settings.effortInput ?? "off");
    if (effort) parts.push(`@ ${effort}`);
    return parts.join(" ") || "—";
  }

  async function remove() {
    if (!session || deleting) return;
    const { id } = session;
    const sets = sessionSummary(session).completedSets;
    const ok = await confirm({
      title: t("history.deleteTitle", { day: dayLabel(session) }),
      body: tn("history.deleteBody", sets),
      confirmLabel: t("history.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    deleting = true;
    try {
      await deleteCompletedSession(id);
      toast(t("history.deleted"));
      await goto(resolve("/history"), { replaceState: true });
    } catch {
      deleting = false;
      toast(t("history.deleteFailed"));
    }
  }
</script>

<svelte:head><title>{session ? session.name : t("history.session")} · Workouts</title></svelte:head>

{#if !loaded}
  <PageHeader title={t("history.session")} back={{ href: resolve("/history"), label: t("history.title") }} />
{:else if failed}
  <PageHeader title={t("history.session")} back={{ href: resolve("/history"), label: t("history.title") }} />
  <EmptyState icon="alert-triangle" title={t("history.sessionLoadFailed")} body={t("history.reloadHint")} />
{:else if !session || !summary}
  <PageHeader title={t("history.session")} back={{ href: resolve("/history"), label: t("history.title") }} />
  <EmptyState icon="history" title={t("history.notFound")} body={t("history.notFoundBody")}>
    {#snippet action()}<Button variant="primary" href={resolve("/history")}>{t("history.backTo")}</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={session.name} subtitle={when(session)} back={{ href: resolve("/history"), label: t("history.title") }}>
    {#snippet actions()}
      <IconButton icon="edit" label={t("history.editSession")} href={resolve(`/history/${page.params.id}/edit` as "/")} />
      <IconButton icon="trash" label={t("history.deleteSession")} variant="danger" disabled={deleting} onclick={remove} />
    {/snippet}
  </PageHeader>

  <div class="stats">
    <Card>
      <div class="stat"><strong>{formatDuration(summary.durationMs)}</strong><span>{t("history.duration")}</span></div>
    </Card>
    <Card>
      <div class="stat"><strong>{summary.completedSets}</strong><span>{summary.completedSets === 1 ? t("history.setsLabel.one") : t("history.setsLabel.other")}</span></div>
    </Card>
    <Card>
      <div class="stat"><strong>{weight(summary.volumeKg)} {unit}</strong><span>{t("history.volume")}</span></div>
    </Card>
  </div>

  {#if session.routineNameSnapshot}<p class="meta">{t("history.routine", { name: session.routineNameSnapshot })}</p>{/if}
  {#if session.notes}<p class="meta">{t("history.notes", { notes: session.notes })}</p>{/if}

  {#each session.exercises as ex (ex.id)}
    {@const vol = exerciseVolume(ex.sets, ex.exerciseTypeSnapshot)}
    <section>
      <h2>{exerciseLabel(ex.exerciseId, ex.exerciseNameSnapshot)}</h2>
      {#if vol > 0}<p class="vol">{t("history.exerciseVolume", { value: weight(vol), unit })}</p>{/if}
      <table>
        <caption class="sr-only">{t("history.setsFor", { name: exerciseLabel(ex.exerciseId, ex.exerciseNameSnapshot) })}</caption>
        <thead><tr><th scope="col">{t("history.colSet")}</th><th scope="col">{t("history.colResult")}</th></tr></thead>
        <tbody>
          {#each ex.sets as s, i (s.id)}
            <tr class:muted={s.completedAt === undefined}>
              <th scope="row">
                {#if s.type !== "normal"}<Badge variant={typeBadge[s.type]}>{setTypeLabel(s.type)}</Badge>{:else}{setLabel(ex.sets, i)}{/if}
              </th>
              <td>
                {setText(s)}
                {#if prIds.has(s.id)}<Badge variant="success" icon="star">{t("setrow.pr")}<span class="sr-only">{t("setrow.prFull")}</span></Badge>{/if}
                {#if s.completedAt === undefined}<span class="note">{t("history.notCompleted")}</span>{:else if !isCounted(s)}<span class="note">{t("history.notCounted")}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if ex.notes}<p class="meta">{t("history.notes", { notes: ex.notes })}</p>{/if}
    </section>
  {/each}
{/if}

<style>
  /* Three columns when the values fit, fewer otherwise: a stat value never breaks inside a number or unit. */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
    gap: var(--space-2);
    margin-block: var(--space-4);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .stat strong {
    font-size: var(--text-2xl);
    line-height: var(--leading-2xl);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
    overflow-wrap: normal;
  }
  .stat span {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
  .meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  section {
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .vol {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: start;
    border-block-end: var(--border-w) solid var(--color-border);
  }
  thead th {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
  tbody th {
    inline-size: 6rem;
    font-weight: var(--weight-semibold);
  }
  tr:last-child > * {
    border-block-end: 0;
  }
  .muted {
    color: var(--color-text-muted);
  }
  .note {
    margin-inline-start: var(--space-2);
    font-size: var(--text-xs);
    font-style: italic;
  }
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
