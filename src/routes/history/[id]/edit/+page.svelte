<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  // Edits a completed session on a local `$state` copy: not the active store, no rest timer, no prefill-on-complete.
  import { onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ExercisePicker from "#lib/components/ExercisePicker.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import ExerciseCard from "#lib/components/workout/ExerciseCard.svelte";
  import { newId } from "#lib/ids";
  import {
    addExercise,
    addSet,
    completeSet,
    createSessionExercise,
    duplicateSet,
    moveExercise,
    removeExercise,
    removeSet,
    uncompleteSet,
    updateSet,
    type SetPatch,
  } from "#lib/logger/workout";
  import { settings } from "#lib/settings.svelte";
  import { deleteCompletedSession, getSession, InvalidSessionEditError, updateCompletedSession } from "#lib/storage/sessions";
  import { isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "#lib/time";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Exercise, SessionExercise, WorkoutSession } from "#lib/types";

  let draft = $state<WorkoutSession>();
  let loaded = $state(false);
  let failed = $state(false);
  let saving = $state(false);
  let pickerOpen = $state(false);
  // `$state` so `dirty` re-derives after a save or a confirmed discard resets it.
  let baseline = $state("");

  // Start/duration are edited as form fields (in the session's zone) and applied to the timestamps on save.
  let startLocal = $state("");
  let minutes = $state<number | null>(null);
  let error = $state("");
  // Opened right after "Log past workout" (`?new=1`). While the stored session has no logged sets, Cancel offers to delete it.
  const justCreated = page.url.searchParams.has("new");
  let storedHasLoggedSets = true;

  const back = $derived({ href: resolve(`/history/${page.params.id}` as "/"), label: t("history.session") });
  const snapshot = () => JSON.stringify([$state.snapshot(draft), startLocal, minutes]);
  const dirty = $derived(loaded && draft !== undefined && snapshot() !== baseline);

  onMount(async () => {
    try {
      const s = await getSession(page.params.id ?? "");
      if (s?.status === "completed" && s.endedAt) {
        draft = s;
        storedHasLoggedSets = s.exercises.some((e) => e.sets.some((x) => x.completedAt));
        startLocal = utcToZonedLocal(s.startedAt, s.timeZone) ?? "";
        minutes = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000);
        baseline = snapshot();
      }
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const unit = $derived(settings.weightUnit);

  function withExercise(id: string, fn: (e: SessionExercise) => void) {
    const e = draft?.exercises.find((x) => x.id === id);
    if (e) fn(e);
  }

  function addPicked(picked: Exercise[]) {
    if (!draft) return;
    for (const e of picked) {
      const se = createSessionExercise(e);
      se.sets.push({ id: newId(), type: "normal" });
      addExercise(draft, se);
    }
  }

  function move(id: string, direction: -1 | 1) {
    if (!draft) return;
    const i = draft.exercises.findIndex((e) => e.id === id);
    if (i >= 0) moveExercise(draft, id, i + direction);
  }

  function toggleSet(id: string, setId: string) {
    withExercise(id, (e) => {
      const set = e.sets.find((x) => x.id === setId);
      if (!set || !draft) return;
      if (set.completedAt) uncompleteSet(set);
      else completeSet(set, {}, draft.endedAt ?? draft.startedAt);
    });
  }

  // An unknown zone (e.g. from an import) can't be converted, so times stay as stored rather than being read as UTC.
  const timesEditable = $derived(draft !== undefined && isValidTimeZone(draft.timeZone));

  async function save() {
    if (!draft || saving) return;
    const startedAt = timesEditable ? zonedLocalToUtc(startLocal, draft.timeZone) : draft.startedAt;
    if (!startedAt || minutes === null) {
      error = t("past.missing");
      return;
    }
    error = "";
    const next = $state.snapshot(draft);
    const [startLocal0, minutes0] = JSON.parse(baseline).slice(1);
    // Leave the stored timestamps (and their seconds) alone unless the user changed the field.
    if (startLocal !== startLocal0) next.startedAt = startedAt;
    if (startLocal !== startLocal0 || minutes !== minutes0) next.endedAt = new Date(Date.parse(next.startedAt) + minutes * 60_000).toISOString();
    next.name = next.name.trim() || draft.name;
    if (!next.notes?.trim()) delete next.notes;
    const ok = await confirm({
      title: t("edit.saveTitle"),
      body: t("edit.saveBody"),
      confirmLabel: t("edit.saveConfirm"),
    });
    if (!ok) return;
    saving = true;
    try {
      await updateCompletedSession(next);
      baseline = snapshot();
      toast(t("edit.updated"));
      await goto(resolve(`/history/${page.params.id}` as "/"), { replaceState: true });
    } catch (e) {
      toast(e instanceof InvalidSessionEditError ? e.message : t("edit.saveFailed"));
    } finally {
      saving = false;
    }
  }

  async function cancel() {
    if (justCreated && !storedHasLoggedSets) {
      const remove = await confirm({
        title: t("edit.deleteTitle"),
        body: t("edit.deleteBody"),
        confirmLabel: t("edit.deleteConfirm"),
        cancelLabel: t("edit.keep"),
        danger: true,
      });
      if (remove) {
        try {
          await deleteCompletedSession(page.params.id ?? "");
        } catch {
          return void toast(t("edit.deleteFailed"));
        }
        baseline = snapshot(); // nothing left to discard
        await goto(resolve("/history"), { replaceState: true });
        return;
      }
    }
    await goto(resolve(`/history/${page.params.id}` as "/"));
  }

  let prompting = false;

  beforeNavigate(async (nav) => {
    if (!dirty || nav.type === "leave") return;
    nav.cancel();
    if (prompting) return; // one "Discard changes?" at a time
    prompting = true;
    const to = nav.to?.url;
    const ok = await confirm({
      title: t("edit.discardTitle"),
      body: t("edit.discardBody"),
      confirmLabel: t("edit.discardConfirm"),
      cancelLabel: t("edit.keepEditing"),
      danger: true,
    });
    prompting = false;
    if (ok && to) {
      baseline = snapshot();
      // `to` is the already-resolved URL the user was heading to.
      // eslint-disable-next-line svelte/no-navigation-without-resolve
      await goto(to);
    }
  });

  // Only asks the browser to show its "leave site?" prompt on reload/close; nothing is saved here (edits are
  // written solely by Save).
  function onbeforeunload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }
</script>

<svelte:window {onbeforeunload} />
<svelte:head><title>{t("edit.title")} · Workouts</title></svelte:head>

{#if !loaded}
  <PageHeader title={t("edit.title")} {back} />
{:else if failed}
  <PageHeader title={t("edit.title")} {back} />
  <EmptyState icon="alert-triangle" title={t("history.sessionLoadFailed")} body={t("history.reloadHint")} />
{:else if !draft}
  <PageHeader title={t("edit.title")} back={{ href: resolve("/history"), label: t("history.title") }} />
  <EmptyState icon="history" title={t("history.notFound")} body={t("history.notFoundBody")}>
    {#snippet action()}<Button variant="primary" href={resolve("/history")}>{t("history.backTo")}</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={t("edit.title")} {back}>
    {#snippet actions()}
      <Button variant="ghost" size="md" disabled={saving} onclick={cancel}>{t("common.cancel")}</Button>
      <Button variant="primary" size="md" disabled={saving} onclick={save}>{t("common.save")}</Button>
    {/snippet}
  </PageHeader>

  <div class="form">
    <TextField label={t("edit.name")} bind:value={draft.name} required />
    {#if timesEditable}
      <TextField
        label={t("edit.start")}
        type="datetime-local"
        bind:value={startLocal}
        required
        hint={t("edit.zoneHint", { zone: draft.timeZone })}
        {error}
      />
      <NumberField label={t("edit.duration")} bind:value={minutes} mode="integer" suffix="min" min={0} />
    {:else}
      <p class="hint">{t("edit.noTimes", { zone: draft.timeZone })}</p>
    {/if}
    <TextField label={t("edit.notes")} multiline bind:value={() => draft?.notes ?? "", (v) => draft && (draft.notes = v)} />
  </div>

  <div class="exercises">
    {#each draft.exercises as exercise, i (exercise.id)}
      <ExerciseCard
        {exercise}
        index={i}
        count={draft.exercises.length}
        onremove={() => draft && removeExercise(draft, exercise.id)}
        onmove={(d) => move(exercise.id, d)}
        onnotes={(n) =>
          withExercise(exercise.id, (e) => {
            if (n) e.notes = n;
            else delete e.notes;
          })}
        defaultRestSeconds={settings.defaultRestSeconds}
        onrest={(seconds) =>
          withExercise(exercise.id, (e) => {
            if (seconds === undefined) delete e.restSeconds;
            else e.restSeconds = seconds;
          })}
        {unit}
        effortInput={settings.effortInput}
        onaddset={() => withExercise(exercise.id, (e) => addSet(e))}
        onsetchange={(setId: string, patch: SetPatch) => withExercise(exercise.id, (e) => updateSet(e, setId, patch))}
        ontoggleset={(setId) => toggleSet(exercise.id, setId)}
        onduplicateset={(setId) => withExercise(exercise.id, (e) => duplicateSet(e, setId))}
        ondeleteset={(setId) => withExercise(exercise.id, (e) => removeSet(e, setId))}
      />
    {/each}
    <Button block icon="plus" onclick={() => (pickerOpen = true)}>{t("workout.addExercise")}</Button>
  </div>
  <ExercisePicker bind:open={pickerOpen} multiple onpick={addPicked} />
{/if}

<style>
  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .form,
  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block: var(--space-4);
  }
</style>
