<script lang="ts">
  import { sessionSummary } from "#lib/progress/summary";
  import { describePr, loadSessionPrs, type ExercisePrs } from "#lib/progress/sessionPrs";
  import { displayWeight } from "#lib/units";
  import Button from "#lib/components/ui/Button.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import { getRoutine, saveRoutine } from "#lib/storage/routines";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import {
    applySessionToRoutine,
    diffSessionAgainstRoutine,
    isDiffEmpty,
    type SessionRoutineDiff,
  } from "#lib/routines/fromSession";
  import type { Routine, WeightUnit, WorkoutSession } from "#lib/types";

  let { session, unit, ondone }: { session: WorkoutSession; unit: WeightUnit; ondone: () => void } = $props();

  let open = $state(true);
  const summary = $derived(sessionSummary(session));
  const minutes = $derived(Math.round(summary.durationMs / 60000));
  const duration = $derived(minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`);
  const volume = $derived(displayWeight(summary.volumeKg, unit).toLocaleString(undefined, { maximumFractionDigits: 0 }));
  const stats = $derived([
    ["Duration", duration],
    ["Exercises", String(summary.exerciseCount)],
    ["Sets", String(summary.completedSets)],
    ["Volume", `${volume} ${unit}`],
  ]);

  // New PRs, computed from earlier sessions. Optional: the summary works without them.
  let records = $state<ExercisePrs[]>([]);
  $effect(() => {
    let cancelled = false;
    loadSessionPrs(session).then(
      (found) => {
        if (!cancelled) records = found;
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  });

  // Offer to save structural changes back, only if the routine still exists. Default is no change.
  let routine = $state<Routine>();
  let diff = $state<SessionRoutineDiff>();
  let names = $state<Record<string, string>>({});
  let saving = $state(false);

  $effect(() => {
    const routineId = session.routineId;
    if (!routineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await getRoutine(routineId);
        if (!found || cancelled) return;
        const d = diffSessionAgainstRoutine(session, found);
        if (isDiffEmpty(d)) return;
        const ids = [...found.exercises.map((e) => e.exerciseId)];
        const loaded = await getExercisesByIds(ids);
        if (cancelled) return;
        names = Object.fromEntries(loaded.map((e) => [e.id, e.name]));
        routine = found;
        diff = d;
      } catch {
        // The offer is optional; the summary still works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const nameOf = (exerciseId: string) => names[exerciseId] ?? "Unknown exercise";
  const changes = $derived.by(() => {
    if (!diff) return [];
    const out: string[] = [];
    for (const a of diff.added) out.push(`Add ${a.name} (${a.sets} sets)`);
    for (const r of diff.removed) out.push(`Remove ${nameOf(r.exerciseId)}`);
    for (const r of diff.replaced) out.push(`Replace ${nameOf(r.fromExerciseId)} with ${r.toName}`);
    for (const c of diff.setCountChanges) out.push(`${c.name}: ${c.from} → ${c.to} sets`);
    if (diff.reordered) out.push("Change exercise order");
    return out;
  });

  async function updateRoutine() {
    if (!routine || !diff || saving) return;
    saving = true;
    try {
      // Re-read so edits made elsewhere in the meantime aren't overwritten.
      const fresh = await getRoutine(routine.id);
      if (!fresh) throw new Error("routine gone");
      await saveRoutine(applySessionToRoutine(fresh, diffSessionAgainstRoutine(session, fresh)));
      toast("Routine updated");
      ondone();
    } catch {
      saving = false;
      toast("Couldn't update the routine");
    }
  }
</script>

<Sheet bind:open title="Workout complete" description={session.name} dismissible={false}>
  <dl class="stats">
    {#each stats as [label, value] (label)}
      <div class="stat">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    {/each}
  </dl>
  {#if records.length > 0}
    <section class="records" aria-labelledby="records-title">
      <h3 id="records-title"><Icon name="star" size="1em" /> New personal records</h3>
      <ul>
        {#each records as r (r.exerciseId)}
          <li>
            <strong>{r.name}</strong>
            {#each r.prs as pr (`${pr.kind}-${pr.reps ?? ""}`)}
              <span class="pr">{describePr(pr, unit)}</span>
            {/each}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if diff && routine}
    <section class="update" aria-labelledby="update-title">
      <h3 id="update-title">Update routine “{routine.name}”?</h3>
      <ul>
        {#each changes as change (change)}
          <li>{change}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#snippet actions()}
    {#if diff && routine}
      <Button block disabled={saving} onclick={updateRoutine}>Update routine</Button>
    {/if}
    <Button variant="primary" block disabled={saving} onclick={ondone}>
      {diff && routine ? "Keep routine as is" : "Done"}
    </Button>
  {/snippet}
</Sheet>

<style>
  .update,
  .records {
    margin-top: var(--space-4);
  }
  .records li {
    display: flex;
    flex-direction: column;
    color: var(--color-text);
  }
  .records ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .pr {
    color: var(--color-text-muted);
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
  }
  ul {
    margin: 0;
    padding-left: var(--space-5);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
    margin: 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  dt {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  dd {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
</style>
