<script lang="ts">
  import { errorText } from "#lib/errorText";
  import { localizedWorkoutName } from "#lib/workoutName";
  import { t, tn } from "#lib/i18n.svelte";
  // "Log past workout" (PRD §5.3): creates a completed session at the chosen time, then opens the edit screen to log sets.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import Button from "#lib/components/ui/Button.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { sessionInputFromRoutine } from "#lib/logger/fromRoutine";
  import { listRoutinesGrouped } from "#lib/storage/routines";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { createCompletedSession, InvalidSessionEditError, type NewCompletedSession } from "#lib/storage/sessions";
  import { currentTimeZone, isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "#lib/time";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Routine } from "#lib/types";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const DEFAULT_MINUTES = 60;

  let routines = $state<Routine[]>([]);
  let routineId = $state("");
  let timeZone = $state(currentTimeZone());
  let startLocal = $state("");
  let minutes = $state<number | null>(DEFAULT_MINUTES);
  let error = $state("");
  let saving = $state(false);

  const zones = $derived.by(() => {
    const names = [...(globalThis.Intl?.supportedValuesOf?.("timeZone") ?? []), currentTimeZone(), timeZone];
    return names.filter((z, i) => names.indexOf(z) === i).sort().map((z) => ({ value: z, label: z }));
  });
  const routineOptions = $derived([{ value: "", label: t("past.blank") }, ...routines.map((r) => ({ value: r.id, label: r.name }))]);

  // Fresh defaults each time the dialog opens: an hour ago, in the current zone.
  $effect(() => {
    if (!open) return;
    const zone = currentTimeZone();
    timeZone = zone;
    minutes = DEFAULT_MINUTES;
    startLocal = utcToZonedLocal(new Date(Date.now() - DEFAULT_MINUTES * 60_000).toISOString(), zone) ?? "";
    routineId = "";
    error = "";
    listRoutinesGrouped()
      .then((g) => (routines = [...g.standalone, ...g.programs.flatMap((p) => p.routines)]))
      .catch(() => (routines = []));
  });

  async function create() {
    if (saving) return;
    if (!isValidTimeZone(timeZone)) return void (error = t("past.badZone"));
    const startedAt = zonedLocalToUtc(startLocal, timeZone);
    if (!startedAt || minutes === null) return void (error = t("past.missing"));
    if (Date.parse(startedAt) > Date.now()) return void (error = t("past.future"));
    error = "";
    saving = true;
    try {
      let input: NewCompletedSession = {
        name: localizedWorkoutName(new Date(startedAt)),
        startedAt,
        endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
        timeZone,
      };
      const routine = routines.find((r) => r.id === routineId);
      let skipped = 0;
      if (routine) {
        const exercises = await getExercisesByIds(routine.exercises.map((e) => e.exerciseId));
        const built = sessionInputFromRoutine(routine, new Map(exercises.map((e) => [e.id, e])));
        input = { ...built.session, ...input, name: routine.name };
        skipped = built.skippedExerciseIds.length;
      }
      const session = await createCompletedSession(input);
      if (skipped > 0) toast(tn("past.skipped", skipped));
      open = false;
      await goto(resolve(`/history/${session.id}/edit?new=1` as "/"));
    } catch (e) {
      error = e instanceof InvalidSessionEditError ? errorText(e.message) : t("past.failed");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title={t("past.title")} description={t("past.description")}>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void create();
    }}
  >
    <Select label={t("past.routine")} bind:value={routineId} options={routineOptions} hint={t("past.routineHint")} />
    <TextField label={t("past.start")} type="datetime-local" bind:value={startLocal} required {error} />
    <NumberField label={t("past.duration")} bind:value={minutes} mode="integer" suffix="min" min={0} />
    <Select label={t("past.timeZone")} bind:value={timeZone} options={zones} />
  </form>
  {#snippet actions()}
    <Button variant="ghost" disabled={saving} onclick={() => (open = false)}>{t("common.cancel")}</Button>
    <Button variant="primary" loading={saving} onclick={create}>{t("past.create")}</Button>
  {/snippet}
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
