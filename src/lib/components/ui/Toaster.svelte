<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  // The single toast host, mounted once in +layout.svelte (design.md §6.12). The region is always in the DOM so
  // screen readers announce each toast as it is added. It is one `popover="manual"` stack in the top layer (never
  // light-dismissed); without the Popover API it is a `position: fixed` region instead. Toasts wait while a modal
  // dialog is open (see toast.svelte.ts), so the region is never inert under one.
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

  // Before removing the toast that holds focus, move focus to a neighbouring toast, or back to where it was before
  // it entered the region, so keyboard users don't land on <body>.
  let focusBefore: HTMLElement | null = null;
  function trackFocus(e: FocusEvent) {
    const from = e.relatedTarget;
    if (from instanceof HTMLElement && !region?.contains(from)) focusBefore = from;
  }
  function handOffFocus(id: number) {
    const el = region?.querySelector<HTMLElement>(`[data-toast="${id}"]`);
    if (!el?.contains(document.activeElement)) return;
    const others = [...(region?.querySelectorAll<HTMLElement>("[data-toast]") ?? [])].filter((x) => x !== el);
    const i = others.findIndex((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    const next = others[i === -1 ? others.length - 1 : i]?.querySelector<HTMLElement>("button");
    const target = next ?? (focusBefore?.isConnected ? focusBefore : null);
    target?.focus();
    if (!next) focusBefore = null;
  }
  function act(id: number) {
    handOffFocus(id);
    runToastAction(id);
  }
  function dismiss(id: number) {
    handOffFocus(id);
    dismissToast(id);
  }

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
  aria-label={t("common.notifications")}
  onfocusin={trackFocus}
>
  {#each toasts as item (item.id)}
    <div
      class="toast"
      role="group"
      data-toast={item.id}
      out:leave
      onpointerenter={() => hold(item.id, "hover")}
      onpointerleave={() => release(item.id, "hover")}
      onfocusin={() => hold(item.id, "focus")}
      onfocusout={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) release(item.id, "focus");
      }}
    >
      <p class="message">{item.message}</p>
      {#if item.action}
        <Button variant="ghost" size="sm" onclick={() => act(item.id)}>{item.action.label}</Button>
      {/if}
      <IconButton icon="x" label={t("common.dismiss")} size="sm" onclick={() => dismiss(item.id)} />
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
