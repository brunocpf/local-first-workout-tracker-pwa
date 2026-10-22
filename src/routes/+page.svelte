<script lang="ts">
  import { localizedWorkoutName } from "#lib/workoutName";
  import { intlLocale } from "#lib/i18n.svelte";
  import { t, tn } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { active } from "#lib/logger/activeSession.svelte";
  import { ActiveSessionExistsError } from "#lib/storage/sessions";
  import { formatElapsed } from "#lib/time";
  import { backupReminderLater } from "#lib/backup/reminderState.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import StartRoutineButton from "#lib/components/routines/StartRoutineButton.svelte";
  import { countSessionsThisWeek } from "#lib/progress/summary";
  import { backupReminderDue } from "#lib/backup/reminder";
  import { exportAndRecord } from "#lib/backup/run";
  import { settings } from "#lib/settings.svelte";
  import { todaysRoutines, type ScheduledRoutine } from "#lib/routines/schedule";
  import { listRoutinesGrouped, quickStartRoutines } from "#lib/storage/routines";
  import { listCompletedSessions } from "#lib/storage/sessions";
  import type { Routine, WorkoutSession } from "#lib/types";

  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  // "Later" hides the reminder until the app is launched again (module state, not persisted).
  let remindDue = $state(false);
  let backingUp = $state(false);
  const showReminder = $derived(remindDue && !active.session && !backupReminderLater.hidden);

  onMount(async () => {
    try {
      remindDue = await backupReminderDue(settings);
    } catch {
      // optional
    }
  });

  async function backUpNow() {
    backingUp = true;
    try {
      const r = await exportAndRecord();
      if (r.status !== "cancelled") {
        remindDue = false;
        toast(t("home.backupSaved"));
      }
    } catch {
      toast(t("home.backupFailed"));
    } finally {
      backingUp = false;
    }
  }

  const QUICK_START_MAX = 3;
  const RECENT_MAX = 3;

  // Loaded after first paint so the Start button never waits on them.
  let routines = $state<Routine[]>([]);
  let recent = $state<WorkoutSession[]>([]);
  let today = $state<ScheduledRoutine[]>([]);
  let weekCount = $state<number | null>(null);

  onMount(async () => {
    try {
      // Favorites first, then the rest as the Routines tab lists them.
      const grouped = await listRoutinesGrouped();
      routines = quickStartRoutines(grouped, QUICK_START_MAX);
      today = todaysRoutines(grouped.programs, new Date());
    } catch {
      // optional context: Home still works without it
    }
    try {
      const latest = await listCompletedSessions({ limit: 100 });
      recent = latest.slice(0, RECENT_MAX);
      weekCount = countSessionsThisWeek(latest, new Date(), settings.weekStartsOn);
    } catch {
      // ditto
    }
  });

  const when = (s: WorkoutSession) => {
    try {
      return new Date(s.startedAt).toLocaleDateString(intlLocale(), { weekday: "short", month: "short", day: "numeric", timeZone: s.timeZone });
    } catch {
      return new Date(s.startedAt).toLocaleDateString(intlLocale(), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    }
  };

  let starting = $state(false);

  async function start() {
    if (active.session) return goto(resolve("/workout"));
    starting = true;
    try {
      await active.start({ name: localizedWorkoutName() });
    } catch (e) {
      // Another tab started one first: adopt it instead of creating a second.
      if (e instanceof ActiveSessionExistsError) await active.load();
      if (!active.session) {
        toast(t("home.startFailed"));
        starting = false;
        return;
      }
    }
    starting = false;
    await goto(resolve("/workout"));
  }
</script>

<PageHeader title={t("home.title")} />

{#if active.session}
  <Banner variant="info" title={t("home.inProgress")} action={{ label: t("home.resume"), onclick: () => goto(resolve("/workout")) }}>
    {active.session.name} · {formatElapsed(active.session.startedAt, now)}
  </Banner>
{/if}

{#if showReminder}
  <div class="reminder" data-testid="backup-reminder">
    <Banner variant="info" title={t("home.backupDue")} action={{ label: backingUp ? t("home.backingUp") : t("home.backUpNow"), onclick: backUpNow }}>
      {t("home.dataOnDevice")}
      <Button variant="ghost" size="sm" onclick={() => (backupReminderLater.hidden = true)}>{t("home.later")}</Button>
    </Banner>
  </div>
{/if}

<div class="start">
  <Button variant="primary" size="lg" block icon={active.session ? "play" : "plus"} loading={starting} onclick={start}>
    {active.session ? t("home.resumeWorkout") : t("home.startWorkout")}
  </Button>
</div>

{#if weekCount !== null}
  <p class="week">{tn("home.week", weekCount)}</p>
{/if}

{#if today.length > 0}
  <section aria-label={t("home.scheduledToday")}>
    <ul class="group">
      {#each today as item (item.routine.id)}
        <li>
          <ListRow title={t("home.today", { name: item.routine.name })} subtitle={item.program.name}>
            {#snippet trailing()}<StartRoutineButton routine={item.routine} />{/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if routines.length > 0}
  <section aria-labelledby="quick">
    <h2 id="quick">{t("home.quickStart")}</h2>
    <ul class="group">
      {#each routines as r (r.id)}
        <li>
          <ListRow title={r.name} subtitle={tn("home.exercises", r.exercises.length)}>
            {#snippet trailing()}<StartRoutineButton routine={r} />{/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if recent.length > 0}
  <section aria-labelledby="recent">
    <h2 id="recent">{t("home.recent")}</h2>
    <ul class="group">
      {#each recent as s (s.id)}
        <li><ListRow title={s.name} subtitle={when(s)} href={resolve(`/history/${s.id}` as "/")} /></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .reminder {
    margin-block-start: var(--space-3);
  }
  .start {
    margin-block: var(--space-4);
  }
  .week {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  section {
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }
</style>
