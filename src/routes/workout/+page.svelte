<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { newId } from "#lib/ids";
  import { active } from "#lib/logger/activeSession.svelte";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import WorkoutHeader from "#lib/components/workout/WorkoutHeader.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ExerciseCard from "#lib/components/workout/ExerciseCard.svelte";
  import RestTimerBar from "#lib/components/workout/RestTimerBar.svelte";
  import { prepareAlerts } from "#lib/alerts";
  import { restAfterSet, startRestTimer } from "#lib/restTimer";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import { suggestSubstitutes } from "#lib/catalog/substitutes";
  import { listExercises } from "#lib/storage/exercises";
  import {
    addExercise,
    addSet,
    completeSet,
    createSessionExercise,
    duplicateSet,
    moveExercise,
    removeExercise,
    joinSuperset,
    leaveSuperset,
    removeSet,
    replaceExercise,
    setProgress,
    restoreExercise,
    restoreSet,
    supersetInfo,
    uncompleteSet,
    updateSet,
    type SetPatch,
  } from "#lib/logger/workout";
  import { loadPreviousSets, type SetValues } from "#lib/logger/previousValues";
  import type { PrSession } from "#lib/progress/metrics";
  import { loadPriorPrSessions, prSetIds as prSetIdsOf } from "#lib/progress/sessionPrs";
  import { settings } from "#lib/settings.svelte";
  import { requestPersistentStorage } from "#lib/storage/persistence";
  import WorkoutSummary from "#lib/components/workout/WorkoutSummary.svelte";
  import type { Exercise, LoggedSet, SessionExercise, WorkoutSession } from "#lib/types";

  let pickerOpen = $state(false);

  function addPicked(picked: Exercise[]) {
    void active.mutate(
      (s) => {
        for (const e of picked) {
          const se = createSessionExercise(e);
          se.sets.push({ id: newId(), type: "normal" }); // one empty set
          addExercise(s, se);
        }
      },
      { persist: "now" },
    );
  }

  function move(id: string, direction: -1 | 1) {
    void active.mutate(
      (s) => {
        const i = s.exercises.findIndex((e) => e.id === id);
        if (i >= 0) moveExercise(s, id, i + direction);
      },
      { persist: "now" },
    );
  }

  function remove(id: string) {
    let removed: ReturnType<typeof removeExercise>;
    void active.mutate((s) => (removed = removeExercise(s, id)), { persist: "now" });
    if (!removed) return;
    const undo = removed;
    toast(`Removed ${undo.exercise.exerciseNameSnapshot}`, {
      action: {
        label: "Undo",
        run: () => {
          if (active.session) void active.mutate((s) => restoreExercise(s, undo), { persist: "now" });
        },
      },
    });
  }

  async function loadSuggestions(exercise: SessionExercise): Promise<Exercise[]> {
    const catalog = await listExercises();
    const current = catalog.find((c) => c.id === exercise.exerciseId);
    if (!current) return [];
    const inWorkout = active.session?.exercises.map((e) => e.exerciseId) ?? [];
    return suggestSubstitutes(current, catalog, { excludeIds: inWorkout });
  }

  async function replace(exercise: SessionExercise, to: Exercise) {
    const { completed, remaining } = setProgress(exercise);
    if (completed > 0) {
      const done = `${completed} completed set${completed === 1 ? "" : "s"}`;
      const ok = await confirm({
        title: `Replace ${exercise.exerciseNameSnapshot}?`,
        body:
          remaining > 0
            ? `${done} stay${completed === 1 ? "s" : ""} with ${exercise.exerciseNameSnapshot}. The other ${remaining} set${remaining === 1 ? "" : "s"} move${remaining === 1 ? "s" : ""} to ${to.name}.`
            : `${done} stay${completed === 1 ? "s" : ""} with ${exercise.exerciseNameSnapshot}. ${to.name} starts with one empty set.`,
        confirmLabel: "Replace exercise",
      });
      if (!ok) return;
    }
    void active.mutate((s) => replaceExercise(s, exercise.id, to), { persist: "now" });
    toast(`Replaced with ${to.name}`);
  }

  function setNotes(id: string, notes: string) {
    void active.mutate(
      (s) => {
        const e = s.exercises.find((x) => x.id === id);
        if (!e) return;
        if (notes) e.notes = notes;
        else delete e.notes;
      },
      { persist: "now" },
    );
  }

  // Previous sets per exercise id, loaded once per exercise. Reads only `exerciseId`s, so typing never reruns it.
  let previous = $state<Record<string, LoggedSet[]>>({});
  // Bookkeeping only: nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const requested = new Set<string>();
  $effect(() => {
    const s = active.session;
    if (!s) return;
    for (const e of s.exercises) {
      const id = e.exerciseId;
      if (requested.has(id)) continue;
      requested.add(id);
      loadPreviousSets(id, { excludeSessionId: s.id }).then(
        (sets) => {
          previous[id] = sets;
        },
        () => requested.delete(id), // retried when the exercise list next changes
      );
    }
  });

  // Earlier sessions per weighted exercise id (what a set must beat to be a PR), loaded like `previous`.
  let priors = $state<Record<string, PrSession[]>>({});
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const requestedPriors = new Set<string>();
  $effect(() => {
    const s = active.session;
    if (!s) return;
    for (const e of s.exercises) {
      const id = e.exerciseId;
      if (e.exerciseTypeSnapshot !== "weighted_reps" || requestedPriors.has(id)) continue;
      requestedPriors.add(id);
      loadPriorPrSessions(id, s).then(
        (sessions) => {
          priors[id] = sessions;
        },
        () => requestedPriors.delete(id),
      );
    }
  });

  /** Sets (across the session's cards of the same exercise) that are new PRs, recomputed from the current state. */
  const prIds = $derived.by(() => {
    const s = active.session;
    const out: Record<string, ReadonlySet<string>> = {};
    if (!s) return out;
    for (const id of Object.keys(priors)) {
      const sets = s.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets);
      out[id] = prSetIdsOf(priors[id], { startedAt: s.startedAt, sets });
    }
    return out;
  });

  const supersets = $derived(supersetInfo(active.session?.exercises ?? []));
  const sameGroup = (a: number, b: number) => supersets.get(a) !== undefined && supersets.get(a)?.letter === supersets.get(b)?.letter;

  const join = (id: string, direction: -1 | 1) => void active.mutate((s) => joinSuperset(s, id, direction), { persist: "now" });
  const leave = (id: string) => void active.mutate((s) => leaveSuperset(s, id), { persist: "now" });

  /** Runs `fn` on the exercise (if it still exists) inside one write-through mutation. */
  function withExercise(id: string, persist: "now" | "deferred", fn: (e: SessionExercise) => void) {
    void active.mutate(
      (s) => {
        const e = s.exercises.find((x) => x.id === id);
        if (e) fn(e);
      },
      { persist },
    );
  }

  // Typed values are 'deferred' (coalesced); completion and structural changes are written now.
  const changeSet = (id: string, setId: string, patch: SetPatch) =>
    withExercise(id, "type" in patch ? "now" : "deferred", (e) => updateSet(e, setId, patch));

  function toggleSet(id: string, setId: string, prefill: SetValues) {
    let prName: string | undefined;
    void active.mutate(
      (s) => {
        const e = s.exercises.find((x) => x.id === id);
        const set = e?.sets.find((x) => x.id === setId);
        if (!e || !set) return;
        if (set.completedAt) return uncompleteSet(set);
        completeSet(set, prefill, new Date().toISOString());
        const history = priors[e.exerciseId];
        if (history) {
          const sets = s.exercises.filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => x.sets);
          if (prSetIdsOf(history, { startedAt: s.startedAt, sets }).has(set.id)) prName = e.exerciseNameSnapshot;
        }
        const rest = restAfterSet(s.exercises, s.exercises.indexOf(e), set.id, settings);
        if (settings.autoStartRestTimer && rest > 0) s.restTimer = startRestTimer(rest);
      },
      { persist: "now" },
    );
    if (prName) toast(`New PR: ${prName}`);
    prepareAlerts(); // inside the tap, so the browser lets the done-beep play later
  }

  const setRest = (id: string, seconds: number | undefined) =>
    withExercise(id, "now", (e) => {
      if (seconds === undefined) delete e.restSeconds;
      else e.restSeconds = seconds;
    });

  function deleteSet(id: string, setId: string) {
    let removed: ReturnType<typeof removeSet>;
    withExercise(id, "now", (e) => (removed = removeSet(e, setId)));
    if (!removed) return;
    const undo = removed;
    toast("Set deleted", {
      action: {
        label: "Undo",
        run: () => {
          if (active.session) withExercise(id, "now", (e) => restoreSet(e, undo));
        },
      },
    });
  }

  // No active session (never started, or finished/discarded here or in another tab): back to Home.
  let leaving = false;
  $effect(() => {
    if (!active.session && !leaving) void goto(resolve("/"), { replaceState: true });
  });

  async function discard() {
    const s = active.session;
    if (!s) return;
    const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
    const lost =
      s.exercises.length === 0
        ? `“${s.name}” will be deleted.`
        : `“${s.name}” and its ${s.exercises.length} exercise${s.exercises.length === 1 ? "" : "s"} (${sets} set${sets === 1 ? "" : "s"}) will be deleted.`;
    const ok = await confirm({
      title: "Discard workout?",
      body: `${lost} This can't be undone.`,
      confirmLabel: "Discard workout",
      danger: true,
    });
    if (!ok) return;
    leaving = true;
    try {
      await active.discard();
    } catch {
      leaving = false;
      toast("Couldn't discard the workout");
      return;
    }
    toast("Workout discarded");
    await goto(resolve("/"), { replaceState: true });
  }

  let summary = $state<WorkoutSession>();
  let finishing = false;

  async function finish() {
    const s = active.session;
    if (!s || finishing) return;
    const incomplete = s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.completedAt).length, 0);
    if (incomplete > 0) {
      const ok = await confirm({
        title: "Finish with incomplete sets?",
        body: `${incomplete} set${incomplete === 1 ? " isn't" : "s aren't"} completed. ${incomplete === 1 ? "It" : "They"} will be kept but not counted in your totals or progress.`,
        confirmLabel: "Finish workout",
      });
      if (!ok) return;
    }
    finishing = true;
    leaving = true;
    try {
      summary = await active.finish();
    } catch {
      leaving = false;
      toast("Couldn't finish the workout");
      return;
    } finally {
      finishing = false;
    }
    void requestPersistentStorage(); // once the first workout is saved; the browser remembers a grant
  }

  async function done() {
    summary = undefined;
    await goto(resolve("/history"), { replaceState: true });
  }
</script>

{#if active.session}
  <WorkoutHeader onfinish={finish} ondiscard={discard} />
  {#if active.error}
    <Banner variant="danger" title="Changes may not be saved">Your latest edits couldn't be written to this device.</Banner>
  {/if}

  <div class="exercises">
    {#if active.session.exercises.length === 0}
      <EmptyState icon="dumbbell" title="No exercises yet" body="Add your first exercise to start logging.">
        {#snippet action()}
          <Button variant="primary" icon="plus" onclick={() => (pickerOpen = true)}>Add exercise</Button>
        {/snippet}
      </EmptyState>
    {:else}
      {#each active.session.exercises as exercise, i (exercise.id)}
        {@const group = supersets.get(i)}
        <div class="member" class:grouped={group} class:first={group?.position === 0} class:last={group && group.position === group.size - 1}>
        <ExerciseCard
          {exercise}
          index={i}
          count={active.session.exercises.length}
          onremove={() => remove(exercise.id)}
          onmove={(d) => move(exercise.id, d)}
          onnotes={(n) => setNotes(exercise.id, n)}
          defaultRestSeconds={settings.defaultRestSeconds}
          onrest={(seconds) => setRest(exercise.id, seconds)}
          unit={settings.weightUnit}
          previousSets={previous[exercise.exerciseId]}
          prSetIds={prIds[exercise.exerciseId]}
          onaddset={() => withExercise(exercise.id, "now", (e) => addSet(e))}
          onsetchange={(setId, patch) => changeSet(exercise.id, setId, patch)}
          ontoggleset={(setId, prefill) => toggleSet(exercise.id, setId, prefill)}
          onduplicateset={(setId) => withExercise(exercise.id, "now", (e) => duplicateSet(e, setId))}
          ondeleteset={(setId) => deleteSet(exercise.id, setId)}
          superset={group}
          canJoin={{
            previous: i > 0 && !sameGroup(i, i - 1),
            next: i < active.session.exercises.length - 1 && !sameGroup(i, i + 1),
          }}
          onjoin={(d) => join(exercise.id, d)}
          onleave={() => leave(exercise.id)}
          onreplace={(to) => replace(exercise, to)}
          loadSuggestions={() => loadSuggestions(exercise)}
          excludeIds={active.session.exercises.map((e) => e.exerciseId)}
        />
        </div>
      {/each}
      <Button block icon="plus" onclick={() => (pickerOpen = true)}>Add exercise</Button>
    {/if}
  </div>
  <RestTimerBar />
  <ExercisePicker bind:open={pickerOpen} multiple onpick={addPicked} />
{/if}
{#if summary}
  <WorkoutSummary session={summary} unit={settings.weightUnit} ondone={done} />
{/if}

<style>
  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block: var(--space-4); /* main already applies the gutter */
  }
  /* Superset members: an accent rail down the left edge, joined across the gap between cards. */
  .member.grouped {
    border-inline-start: var(--space-1) solid var(--color-accent);
    padding-inline-start: var(--space-2);
    border-start-start-radius: var(--radius-sm);
    border-end-start-radius: var(--radius-sm);
  }
  .member.grouped:not(.last) {
    margin-block-end: calc(var(--space-3) * -1); /* cancel the flex gap so the rail is continuous */
    padding-block-end: var(--space-3);
  }
</style>
