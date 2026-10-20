<script lang="ts">
  // Rest-timer bar (design.md §7.3). State is `session.restTimer` (a stored end instant, ADR 0004); this
  // component only re-reads it on a render tick and on `visibilitychange`, and writes changes through `active`.
  import { onMount } from "svelte";
  import { playRestDoneAlert, prepareAlerts } from "#lib/alerts";
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
    const refresh = () => (now = Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
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
    if (late <= ALERT_MAX_LATE_MS && document.visibilityState === "visible") playRestDoneAlert({ sound: settings.timerSound !== false });
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

{#if timer && !noteSeen}
  <div class="note">
    <Banner variant="info" action={{ label: "Got it", onclick: dismissNote }}>
      Rest alerts only work while the app is open. With the screen locked or the app in the background, you'll see the
      result when you come back.
    </Banner>
  </div>
{/if}

<div class="bar" class:done bind:this={bar} data-testid="rest-timer">
  {#if !timer}
    <div class="row idle">
      <Button variant="ghost" size="sm" icon="timer" onclick={start}>Start rest</Button>
    </div>
  {:else if done}
    <div class="row">
      <span class="status" role="status"><Icon name="check" size={20} /> Rest done</span>
      <span class="controls">
        <Button size="sm" onclick={() => adjust(15)}><span class="sr-only">Add 15 seconds</span><span aria-hidden="true">+15</span></Button>
        <IconButton icon="x" label="Dismiss" onclick={clear} />
      </span>
    </div>
  {:else}
    <div
      class="progress"
      role="progressbar"
      aria-label="Rest"
      aria-valuemin="0"
      aria-valuemax={total}
      aria-valuenow={remaining}
    >
      <div class="fill" style:inline-size="{percent}%"></div>
    </div>
    <div class="row">
      <span class="time tabular" role="timer" aria-label="Rest remaining">
        <span class="timer-icon"><Icon name="timer" size={20} /></span>{text}
      </span>
      <span class="controls">
        <Button size="sm" onclick={() => adjust(-15)}><span class="sr-only">Subtract 15 seconds</span><span aria-hidden="true">−15</span></Button>
        <Button size="sm" onclick={() => adjust(15)}><span class="sr-only">Add 15 seconds</span><span aria-hidden="true">+15</span></Button>
        <IconButton icon={paused ? "play" : "pause"} label={paused ? "Resume rest" : "Pause rest"} pressed={paused} onclick={togglePause} />
        <IconButton icon="skip-forward" label="Skip rest" onclick={clear} />
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
  .fill {
    block-size: 100%;
    background: var(--color-accent);
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
