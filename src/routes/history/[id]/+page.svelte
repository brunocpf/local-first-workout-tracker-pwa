<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { exerciseVolume, isCounted } from "#lib/progress/metrics";
  import { sessionSummary } from "#lib/progress/summary";
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

  const zoned = (s: WorkoutSession, opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Date(s.startedAt).toLocaleString(undefined, { ...opts, timeZone: s.timeZone });
    } catch {
      return new Date(s.startedAt).toLocaleString(undefined, { ...opts, timeZone: "UTC" });
    }
  };
  const dayLabel = (s: WorkoutSession) => zoned(s, { weekday: "short", day: "numeric", month: "short" });
  const when = (s: WorkoutSession) => `${zoned(s, { dateStyle: "medium" })}, ${zoned(s, { hour: "numeric", minute: "2-digit" })}`;

  function duration(ms: number) {
    const min = Math.round(ms / 60_000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
  }

  const unit = $derived(settings.weightUnit);
  const weight = (kg: number) => displayWeight(kg, unit).toLocaleString();
  const summary = $derived(session ? sessionSummary(session) : undefined);

  function setLabel(sets: LoggedSet[], i: number) {
    if (sets[i].type === "warmup") return "W";
    return String(sets.slice(0, i + 1).filter((s) => s.type !== "warmup").length);
  }

  function setText(s: LoggedSet) {
    const parts: string[] = [];
    if (s.weight !== undefined) parts.push(`${weight(s.weight)} ${unit}`);
    if (s.reps !== undefined) parts.push(`× ${s.reps}`);
    if (s.durationSeconds !== undefined) parts.push(`${s.durationSeconds} s`);
    if (s.distance !== undefined) parts.push(`${s.distance} m`);
    return parts.join(" ") || "—";
  }

  async function remove() {
    if (!session || deleting) return;
    const { id } = session;
    const sets = sessionSummary(session).completedSets;
    const ok = await confirm({
      title: `Delete session from ${dayLabel(session)}?`,
      body: `${sets} ${sets === 1 ? "set" : "sets"} will be deleted. This can’t be undone.`,
      confirmLabel: "Delete session",
      danger: true,
    });
    if (!ok) return;
    deleting = true;
    try {
      await deleteCompletedSession(id);
      toast("Session deleted");
      await goto(resolve("/history"), { replaceState: true });
    } catch {
      deleting = false;
      toast("Couldn’t delete the session");
    }
  }
</script>

<svelte:head><title>{session ? session.name : "Session"} · Workouts</title></svelte:head>

{#if !loaded}
  <PageHeader title="Session" back={{ href: resolve("/history"), label: "History" }} />
{:else if failed}
  <PageHeader title="Session" back={{ href: resolve("/history"), label: "History" }} />
  <EmptyState icon="alert-triangle" title="Couldn’t load this session" body="Reload the app and try again." />
{:else if !session || !summary}
  <PageHeader title="Session" back={{ href: resolve("/history"), label: "History" }} />
  <EmptyState icon="history" title="Session not found" body="It may have been deleted.">
    {#snippet action()}<Button variant="primary" href={resolve("/history")}>Back to History</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={session.name} subtitle={when(session)} back={{ href: resolve("/history"), label: "History" }}>
    {#snippet actions()}
      <IconButton icon="trash" label="Delete session" variant="danger" disabled={deleting} onclick={remove} />
    {/snippet}
  </PageHeader>

  <div class="stats">
    <Card>
      <div class="stat"><strong>{duration(summary.durationMs)}</strong><span>Duration</span></div>
    </Card>
    <Card>
      <div class="stat"><strong>{summary.completedSets}</strong><span>{summary.completedSets === 1 ? "Set" : "Sets"}</span></div>
    </Card>
    <Card>
      <div class="stat"><strong>{weight(summary.volumeKg)} {unit}</strong><span>Volume</span></div>
    </Card>
  </div>

  {#if session.routineNameSnapshot}<p class="meta">Routine: {session.routineNameSnapshot}</p>{/if}
  {#if session.notes}<p class="meta">Notes: {session.notes}</p>{/if}

  {#each session.exercises as ex (ex.id)}
    {@const vol = exerciseVolume(ex.sets, ex.exerciseTypeSnapshot)}
    <section>
      <h2>{ex.exerciseNameSnapshot}</h2>
      {#if vol > 0}<p class="vol">Volume: {weight(vol)} {unit}</p>{/if}
      <table>
        <caption class="sr-only">Sets for {ex.exerciseNameSnapshot}</caption>
        <thead><tr><th scope="col">Set</th><th scope="col">Result</th></tr></thead>
        <tbody>
          {#each ex.sets as s, i (s.id)}
            <tr class:muted={s.completedAt === undefined}>
              <th scope="row">
                {#if s.type === "warmup"}<Badge>Warm-up</Badge>{:else}{setLabel(ex.sets, i)}{/if}
              </th>
              <td>
                {setText(s)}
                {#if s.completedAt === undefined}<span class="note">not completed</span>{:else if !isCounted(s)}<span class="note">not counted</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if ex.notes}<p class="meta">Notes: {ex.notes}</p>{/if}
    </section>
  {/each}
{/if}

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    margin-block: var(--space-4);
  }
  @media (width < 20em) {
    .stats {
      grid-template-columns: 1fr;
    }
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
