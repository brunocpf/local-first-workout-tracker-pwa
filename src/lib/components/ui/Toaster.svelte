<script lang="ts">
  // The single toast host, mounted once in +layout.svelte (design.md §6.12). The region is always in the DOM so
  // screen readers announce each toast as it is added. It is one `popover="manual"` stack in the top layer (above
  // dialogs, never light-dismissed); without the Popover API it is a `position: fixed` region instead.
  import { dismissToast, pauseToast, resumeToast, runToastAction, toasts } from "#lib/ui/toast.svelte";
  import { tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import Button from "./Button.svelte";
  import IconButton from "./IconButton.svelte";

  let region = $state<HTMLElement>();
  let popover = $state(false);

  $effect(() => {
    if (!region || !("popover" in HTMLElement.prototype)) return;
    popover = true;
    // Show once the `popover` attribute has rendered.
    void tick().then(() => region?.isConnected && !region.matches(":popover-open") && region.showPopover());
  });

  // The top layer stacks in show order: re-show the region when a toast arrives over an open modal dialog.
  let count = 0;
  $effect(() => {
    const n = toasts.length;
    if (n > count && popover && region?.matches(":popover-open") && document.querySelector("dialog:modal")) {
      region.hidePopover();
      region.showPopover();
    }
    count = n;
  });

  // Pause while hovered or while focus is inside (design.md §6.12).
  // Non-reactive bookkeeping: why each toast is held ("hover", "focus").
  const holds: Record<number, string[]> = {};
  function hold(id: number, why: string) {
    const reasons = (holds[id] ??= []);
    if (reasons.includes(why)) return;
    if (reasons.length === 0) pauseToast(id);
    reasons.push(why);
  }
  function release(id: number, why: string) {
    const reasons = holds[id];
    if (!reasons?.includes(why)) return;
    holds[id] = reasons.filter((r) => r !== why);
    if (holds[id].length === 0) {
      delete holds[id];
      resumeToast(id);
    }
  }

  // Exit: fade + scale, fade only for reduced motion (design.md §3.5). Durations come from the tokens.
  function leave(node: HTMLElement) {
    const style = getComputedStyle(node);
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ms = parseFloat(style.getPropertyValue(reduced ? "--duration-fast" : "--duration-base")) || 0;
    return {
      duration: reduced ? ms : ms * 0.75,
      easing: cubicOut,
      css: (t: number) => (reduced ? `opacity: ${t}` : `opacity: ${t}; transform: scale(${0.96 + 0.04 * t})`),
    };
  }
</script>

<section
  bind:this={region}
  class="region"
  class:open={!popover}
  popover={popover ? "manual" : undefined}
  aria-live="polite"
  aria-label="Notifications"
>
  {#each toasts as t (t.id)}
    <div
      class="toast"
      role="group"
      out:leave
      onpointerenter={() => hold(t.id, "hover")}
      onpointerleave={() => release(t.id, "hover")}
      onfocusin={() => hold(t.id, "focus")}
      onfocusout={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) release(t.id, "focus");
      }}
    >
      <p class="message">{t.message}</p>
      {#if t.action}
        <Button variant="ghost" size="sm" onclick={() => runToastAction(t.id)}>{t.action.label}</Button>
      {/if}
      <IconButton icon="x" label="Dismiss" size="sm" onclick={() => dismissToast(t.id)} />
    </div>
  {/each}
</section>

<style>
  .region {
    /* Reset the popover UA box. */
    position: fixed;
    inset: auto 0 calc(var(--shell-bottom) + var(--sticky-bottom-h, 0px) + var(--space-3));
    box-sizing: border-box;
    inline-size: min(100% - 2 * var(--gutter), 28rem);
    block-size: auto;
    margin: 0 auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text);
    overflow: visible;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    pointer-events: none;
  }
  .region:not(:is(:popover-open, .open)) {
    display: none;
  }
  .region.open {
    z-index: var(--z-toast);
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    min-block-size: calc(var(--tap-min) + 2 * var(--space-1));
    background: var(--color-surface-3);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    transition:
      opacity var(--duration-base) var(--ease-enter),
      transform var(--duration-base) var(--ease-enter);

    @starting-style {
      opacity: 0;
      transform: scale(0.96);
    }
  }
  .message {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    padding-block: var(--space-1);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      transition: opacity var(--duration-fast) var(--ease-enter);

      @starting-style {
        transform: none;
      }
    }
  }
  @media (forced-colors: active) {
    .toast {
      border-color: CanvasText;
    }
  }
</style>
