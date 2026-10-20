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
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import {
    addExercise,
    createSessionExercise,
    moveExercise,
    removeExercise,
    restoreExercise,
  } from "#lib/logger/workout";
  import type { Exercise } from "#lib/types";

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

  async function finish() {
    leaving = true;
    try {
      await active.finish();
    } catch {
      leaving = false;
      toast("Couldn't finish the workout");
      return;
    }
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
        <ExerciseCard
          {exercise}
          index={i}
          count={active.session.exercises.length}
          onremove={() => remove(exercise.id)}
          onmove={(d) => move(exercise.id, d)}
          onnotes={(n) => setNotes(exercise.id, n)}
        />
      {/each}
      <Button block icon="plus" onclick={() => (pickerOpen = true)}>Add exercise</Button>
    {/if}
  </div>
  <ExercisePicker bind:open={pickerOpen} multiple onpick={addPicked} />
{/if}

<style>
  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--gutter);
  }
</style>
