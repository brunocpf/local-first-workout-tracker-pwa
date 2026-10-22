<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  // Rest-timer bar (design.md §7.3). State is `session.restTimer` (a stored end instant, ADR 0004); this
  // component only re-reads it on a render tick and on `visibilitychange`, and writes changes through `active`.
  import { onDestroy, onMount } from "svelte";
  import { playCountdownCue, playRestDoneAlert, prepareAlerts } from "#lib/alerts";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import { active } from "#lib/logger/activeSession.svelte";
  import {
    adjustRestTimer,
    isPaused,
    pauseRestTimer,
    remainingMs,
    remainingSeconds,
    resumeRestTimer,
    startRestTimer,
  } from "#lib/restTimer";
  import { cancelPush, hasSubscription, pushPlan, pushSupport, schedulePush, FOREGROUND_CANCEL_MS } from "#lib/push";
  import { isStandalone } from "#lib/pwa/install";
  import { settings } from "#lib/settings.svelte";
  import type { RestTimer } from "#lib/types";

  const NOTE_KEY = "workout-tracker:rest-note-seen";
  /** How long "Rest done" stays before the bar goes back to idle. */
  const DONE_VISIBLE_MS = 10_000;
  /** An alert for a timer that ended longer ago than this (backgrounded device) would only confuse. */
  const ALERT_MAX_LATE_MS = 2_000;

  let now = $state(Date.now());
  let noteSeen = $state(true);
  let bar = $state<HTMLElement>();
  let visible = $state(true);
  let standalone = $state(true);

  const timer = $derived(active.session?.restTimer);
  const paused = $derived(timer ? isPaused(timer) : false);
  const remaining = $derived(timer ? remainingSeconds(timer, now) : 0);
  const done = $derived(timer ? remainingMs(timer, now) <= 0 : false);
  const total = $derived(timer ? Math.max(timer.durationSeconds, remaining) : 0);
  const percent = $derived(total > 0 ? Math.round((remaining / total) * 100) : 0);
  const text = $derived(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`);

  onMount(() => {
    try {
      noteSeen = localStorage.getItem(NOTE_KEY) === "1";
    } catch {
      noteSeen = false;
    }
    standalone = isStandalone();
    visible = document.visibilityState === "visible";
    const refresh = () => {
      now = Date.now();
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  });

  // Background notification (ADR 0014): keep the relay's single scheduled push in step with the timer.
  const pushOn = $derived(settings.restNotifications === true && pushSupport() === "ready" && hasSubscription());
  /** iOS delivers notifications only to the Home Screen app: say so beside the timer (not dismissible) until installed. */
  const showInstallHint = $derived(!standalone && pushSupport() === "needs-install");
  let pushed: string | undefined;
  $effect(() => {
    if (!pushOn) return;
    const t = timer ? $state.snapshot(timer) : undefined;
    const plan = pushPlan(t, visible);
    const key = plan === "schedule" ? t!.endsAt : undefined;
    if (key !== pushed) {
      pushed = key;
      if (key) void schedulePush(key);
      else void cancelPush();
    }
    // Re-evaluate shortly before the end, while the page is still visible.
    if (!t || plan !== "schedule" || !visible) return;
    const id = setTimeout(() => cancelIfForeground(t), Math.max(0, Date.parse(t.endsAt) - Date.now() - FOREGROUND_CANCEL_MS));
    return () => clearTimeout(id);
  });

  function cancelIfForeground(t: RestTimer) {
    if (pushed === t.endsAt && pushPlan(t, document.visibilityState === "visible") === "cancel") {
      pushed = undefined;
      void cancelPush();
    }
  }

  // Finished or discarded workout: nothing left to notify about (a timer still stored in the session keeps its push).
  onDestroy(() => {
    if (pushed && !active.session?.restTimer) void cancelPush();
  });

  // Render ticks only while a timer is actually counting down; the value shown is always derived from `endsAt`.
  $effect(() => {
    if (!timer || paused || done) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(id);
  });

  // Alert once per timer, and only for one this page watched running down. A timer that was already over
  // when the page loaded (reload) is armed never, so it just shows "done"; a long-overdue one skips the alert too.
  let armed: string | undefined;
  $effect(() => {
    if (!timer) return void (armed = undefined);
    if (!done) {
      if (!paused) armed = timer.endsAt;
      return;
    }
    if (armed !== timer.endsAt) return;
    armed = undefined;
    const late = now - Date.parse(timer.endsAt);
    if (late <= ALERT_MAX_LATE_MS && document.visibilityState === "visible") playRestDoneAlert({ sound: settings.timerSound !== false, vibrate: settings.timerVibration !== false });
  });

  // Optional cue when 10 seconds remain, once per end instant and only for a timer watched running down.
  const WARNING_MS = 10_000;
  let warned: string | undefined;
  $effect(() => {
    if (!timer || paused || done || settings.timerCountdownCue !== true) return;
    const left = remainingMs(timer, now);
    if (left > WARNING_MS || left < WARNING_MS - ALERT_MAX_LATE_MS || warned === timer.endsAt) return;
    warned = timer.endsAt;
    if (document.visibilityState === "visible")
      playCountdownCue({ sound: settings.timerSound !== false, vibrate: settings.timerVibration !== false });
  });

  // "Rest done" goes away by itself.
  $effect(() => {
    if (!done || !timer) return;
    const id = setTimeout(clear, DONE_VISIBLE_MS);
    return () => clearTimeout(id);
  });

  // Keep focus targets and toasts clear of the sticky bar (design.md §6.4): publish its height.
  $effect(() => {
    const el = bar;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--sticky-bottom-h", `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.removeProperty("--sticky-bottom-h");
    };
  });

  function set(next: RestTimer | undefined) {
    void active.mutate(
      (s) => {
        if (next) s.restTimer = next;
        else delete s.restTimer;
      },
      { persist: "now" },
    );
  }
  const clear = () => set(undefined);

  function start() {
    prepareAlerts();
    set(startRestTimer(settings.defaultRestSeconds));
  }

  function adjust(delta: number) {
    if (timer) set(adjustRestTimer($state.snapshot(timer), delta));
  }

  function togglePause() {
    if (!timer) return;
    const t = $state.snapshot(timer);
    set(isPaused(t) ? resumeRestTimer(t) : pauseRestTimer(t));
  }

  function dismissNote() {
    noteSeen = true;
    try {
      localStorage.setItem(NOTE_KEY, "1");
    } catch {
      // shown again next time
    }
  }
</script>

{#if timer && (!noteSeen || showInstallHint)}
  <div class="note">
    {#if !noteSeen}
      <Banner variant="info" action={{ label: t("rest.gotIt"), onclick: dismissNote }}>
        {#if pushOn}
          {t("rest.noteOn")}
        {:else}
          {t("rest.noteOff")}
        {/if}
      </Banner>
    {/if}
    {#if showInstallHint}
      <p class="install-hint" data-testid="rest-install-hint">
        {t("rest.installHint")}
      </p>
    {/if}
  </div>
{/if}

<div class="bar" class:done bind:this={bar} data-testid="rest-timer">
  {#if !timer}
    <div class="row idle">
      <Button variant="ghost" size="sm" icon="timer" onclick={start}>{t("rest.start")}</Button>
    </div>
  {:else if done}
    <div class="row">
      <span class="status" role="status"><Icon name="check" size={20} /> {t("rest.done")}</span>
      <span class="controls">
        <Button size="sm" onclick={() => adjust(15)}><span class="sr-only">{t("rest.add15")}</span><span aria-hidden="true">+15</span></Button>
        <IconButton icon="x" label={t("common.dismiss")} onclick={clear} />
      </span>
    </div>
  {:else}
    <div
      class="progress"
      role="progressbar"
      aria-label={t("rest.progress")}
      aria-valuemin="0"
      aria-valuemax={total}
      aria-valuenow={remaining}
    >
      <div class="fill" style:transform="scaleX({percent / 100})"></div>
    </div>
    <div class="row">
      <span class="time tabular" role="timer" aria-label={t("rest.remaining")}>
        <span class="timer-icon"><Icon name="timer" size={20} /></span>{text}
      </span>
      <span class="controls">
        <Button size="sm" onclick={() => adjust(-15)}><span class="sr-only">{t("rest.sub15")}</span><span aria-hidden="true">−15</span></Button>
        <Button size="sm" onclick={() => adjust(15)}><span class="sr-only">{t("rest.add15")}</span><span aria-hidden="true">+15</span></Button>
        <IconButton icon={paused ? "play" : "pause"} label={paused ? t("rest.resume") : t("rest.pause")} pressed={paused} onclick={togglePause} />
        <IconButton icon="skip-forward" label={t("rest.skip")} onclick={clear} />
      </span>
    </div>
  {/if}
</div>

<style>
  .note {
    position: sticky;
    inset-block-end: calc(var(--sticky-bottom-h, 0px));
    z-index: var(--z-sticky);
    padding-block-end: var(--space-2);
  }
  .install-hint {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .note > :global(* + *) {
    margin-block-start: var(--space-2);
  }
  .bar {
    position: sticky;
    inset-block-end: 0;
    z-index: var(--z-sticky);
    container-type: inline-size;
    margin-inline: calc(-1 * var(--gutter));
    background: var(--color-surface-1);
    border-block-start: 1px solid var(--color-border);
    padding-block-end: var(--safe-bottom);
  }
  .bar.done {
    background: var(--color-success-subtle);
    color: var(--color-success-text);
  }
  .progress {
    block-size: 4px;
    background: var(--color-surface-3);
  }
  /* Scaled, not resized: the compositor glides between whole-second updates without layout. Under reduced
     motion it steps once a second instead. */
  .fill {
    block-size: 100%;
    background: var(--color-accent);
    transform-origin: left;
    transition: transform 1s linear;
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--gutter);
    min-block-size: var(--tap-min);
  }
  .idle {
    justify-content: center;
  }
  .time {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }
  .timer-icon {
    display: none;
    color: var(--color-text-muted);
  }
  @container (inline-size > 22em) {
    .timer-icon {
      display: inline-flex;
    }
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .controls {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: no-preference) {
    .bar.done {
      animation: flash var(--duration-slow) steps(2, end) 1;
    }
    @keyframes flash {
      from {
        background: var(--color-surface-1);
      }
    }
  }
</style>
