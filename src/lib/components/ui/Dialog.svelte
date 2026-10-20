<script lang="ts" module>
  // Exit animation (design.md §6.9). Where `overlay` and discrete `display` transitions work (Chromium), close()
  // animates by itself. Elsewhere (Safari, Firefox) set `data-closing`, wait for the exit transition, then close().
  let displayTransition: boolean | undefined;
  function canTransitionDisplay() {
    if (displayTransition !== undefined) return displayTransition;
    if (!globalThis.CSS?.supports?.("transition-behavior", "allow-discrete") || !document.body) return false;
    const probe = document.createElement("div");
    probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
    document.body.appendChild(probe);
    void getComputedStyle(probe).display;
    probe.style.display = "none";
    displayTransition = getComputedStyle(probe).display === "block";
    probe.remove();
    return displayTransition;
  }
  const supportsTopLayerExit = () => !!globalThis.CSS?.supports?.("overlay", "auto") && canTransitionDisplay();

  async function closeAnimated(dialog: HTMLDialogElement) {
    if (!supportsTopLayerExit()) {
      dialog.setAttribute("data-closing", "");
      const animations = dialog.getAnimations?.({ subtree: true }) ?? [];
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      }
      // Reopened while the exit ran: stay open.
      if (!dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
    }
    dialog.close();
  }

  // Scroll lock fallback (design.md §6.9). The CSS (`overscroll-behavior: contain` on the dialog and its backdrop)
  // is enough where browsers honor it on non-scrollable boxes; WebKit doesn't, so while a modal is open, wheel and
  // touch scrolls are cancelled unless they would scroll something inside the dialog. html/body are never touched.
  let locks = 0;
  let touchY = 0;

  /** Whether a vertical scroll by `dy` from `target` can be consumed inside its dialog. */
  function scrollsInside(target: EventTarget | null, dy: number) {
    let node = target instanceof Element ? target : null;
    const dialog = node?.closest("dialog:modal");
    if (!dialog) return false;
    for (; node && node !== dialog.parentElement; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        if (dy < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
      }
    }
    return false;
  }
  function onWheel(e: WheelEvent) {
    if (e.deltaY !== 0 && !e.ctrlKey && !scrollsInside(e.target, e.deltaY)) e.preventDefault();
  }
  function onTouchStart(e: TouchEvent) {
    touchY = e.touches[0]?.clientY ?? 0;
  }
  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) return; // pinch zoom stays available
    const y = e.touches[0].clientY;
    const dy = touchY - y;
    touchY = y;
    if (dy !== 0 && !scrollsInside(e.target, dy)) e.preventDefault();
  }
  function lockScroll() {
    if (locks++ === 0) {
      document.addEventListener("wheel", onWheel, { passive: false, capture: true });
      document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--locks === 0) {
        document.removeEventListener("wheel", onWheel, { capture: true });
        document.removeEventListener("touchstart", onTouchStart, { capture: true });
        document.removeEventListener("touchmove", onTouchMove, { capture: true });
      }
    };
  }

  const supportsClosedBy = () => typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import IconButton from "./IconButton.svelte";

  let {
    open = $bindable(false),
    title,
    description,
    dismissible = true,
    variant = "dialog",
    size = "auto",
    children,
    actions,
    onopen,
    onclose,
  }: {
    open?: boolean;
    title: string;
    description?: string;
    dismissible?: boolean;
    /** Internal: Sheet renders through Dialog with `variant="sheet"`. */
    variant?: "dialog" | "sheet";
    size?: "auto" | "full";
    children?: Snippet;
    actions?: Snippet;
    /** Called right after showModal(), e.g. to move focus somewhere other than the first focusable element. */
    onopen?: (dialog: HTMLDialogElement) => void;
    onclose?: (returnValue: string) => void;
  } = $props();

  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;
  let unlock: (() => void) | undefined;

  $effect(() => {
    if (!dialog) return;
    if (open) {
      if (dialog.hasAttribute("data-closing")) dialog.removeAttribute("data-closing");
      if (!dialog.open) {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
        unlock = lockScroll();
        const el = dialog;
        untrack(() => onopen?.(el));
      }
    } else if (dialog.open && !dialog.hasAttribute("data-closing")) {
      void closeAnimated(dialog);
    }
  });

  function restoreFocus() {
    const target = opener;
    opener = null;
    // Browsers usually do this themselves; make it explicit (older Safari) unless focus already moved elsewhere.
    const active = document.activeElement;
    if (target?.isConnected && (!active || active === document.body || dialog?.contains(active))) {
      target.focus({ preventScroll: true });
    }
  }

  function handleClose() {
    unlock?.();
    open = false;
    restoreFocus();
    onclose?.(dialog?.returnValue ?? "");
  }

  // Esc and native light dismiss (closedby="any") fire `cancel`: run them through the animated close.
  function handleCancel(event: Event) {
    event.preventDefault();
    open = false;
  }

  // Light-dismiss fallback where `closedby` is unsupported (Safari): a click on the backdrop targets the dialog
  // itself, outside its box.
  function handleClick(event: MouseEvent) {
    if (!dismissible || supportsClosedBy() || event.target !== dialog || !dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right;
    if (!inside) open = false;
  }

  $effect(() => {
    const el = dialog;
    if (!el) return;
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("click", handleClick);
      // Unmounted while open: the browser drops the dialog without a close event.
      unlock?.();
      if (el.open) restoreFocus();
    };
  });
</script>

<dialog
  bind:this={dialog}
  class="overlay {variant} {size}"
  aria-labelledby="{uid}-title"
  aria-describedby={description ? `${uid}-desc` : undefined}
  closedby={dismissible ? "any" : "closerequest"}
  oncancel={handleCancel}
  onclose={handleClose}
>
  {#if variant === "sheet"}<div class="grab" aria-hidden="true"></div>{/if}
  <header class="head">
    <h2 id="{uid}-title">{title}</h2>
    {#if variant === "sheet"}
      <IconButton icon="x" label="Close" onclick={() => (open = false)} />
    {/if}
  </header>
  <div class="body">
    {#if description}<p class="desc" id="{uid}-desc">{description}</p>{/if}
    {@render children?.()}
  </div>
  {#if actions}
    <footer class="actions">{@render actions()}</footer>
  {/if}
</dialog>

<style>
  .overlay {
    --pad: var(--space-6);
    box-sizing: border-box;
    inline-size: min(100% - 2 * var(--gutter), 28rem);
    max-inline-size: none;
    max-block-size: calc(100dvh - 2 * var(--gutter));
    margin: auto;
    padding: 0;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: contain;
    background: var(--color-surface-1);
    color: var(--color-text);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);

    /* Closed / exit state. The open state below wins while open and not closing. */
    opacity: 0;
    transform: scale(0.96);
    transition-property: opacity, transform, display, overlay;
    transition-duration: calc(var(--duration-base) * 0.75);
    transition-timing-function: var(--ease-exit);
    transition-behavior: allow-discrete;
  }
  .overlay[open] {
    display: flex;
  }
  .overlay:modal {
    overscroll-behavior: contain;
  }
  .overlay:is([open]):where(:not([data-closing])) {
    opacity: 1;
    transform: none;
    transition-duration: var(--duration-base);
    transition-timing-function: var(--ease-enter);

    @starting-style {
      opacity: 0;
      transform: scale(0.96);
    }
  }

  .overlay::backdrop {
    overflow: hidden;
    overscroll-behavior: contain;
    background: var(--color-backdrop);
    opacity: 0;
    transition-property: opacity, display, overlay;
    transition-duration: calc(var(--duration-base) * 0.75);
    transition-timing-function: var(--ease-exit);
    transition-behavior: allow-discrete;
  }
  .overlay:is([open]):where(:not([data-closing]))::backdrop {
    opacity: 1;
    transition-duration: var(--duration-base);
    transition-timing-function: var(--ease-enter);
  }
  @starting-style {
    .overlay[open]::backdrop {
      opacity: 0;
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--pad) var(--pad) 0;
  }
  h2 {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    font-size: var(--text-lg);
    line-height: var(--leading-lg);
    font-weight: var(--weight-semibold);
    text-wrap: balance;
  }
  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3) var(--pad) var(--pad);
  }
  .desc {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
  }
  .body > :global(:last-child) {
    margin-block-end: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0 var(--pad) var(--pad);
  }

  @media (width < 24em) {
    .overlay {
      --pad: var(--space-4);
    }
    /* Stack full width; the primary action stays last (bottom, nearest the thumb). */
    .actions {
      flex-direction: column;
      align-items: stretch;
    }
    .actions > :global(*) {
      inline-size: 100%;
    }
  }

  /* Sheet (design.md §6.11): bottom sheet on narrow screens, a Dialog from 48em. */
  .sheet .head {
    padding-inline-end: calc(var(--pad) - var(--space-2));
  }
  .grab {
    display: none;
  }
  @media (width < 48em) {
    .sheet {
      --pad: var(--space-4);
      inline-size: 100%;
      margin: auto 0 0;
      max-block-size: calc(100dvh - var(--safe-top) - var(--space-6));
      border-block-end: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      transform: translateY(100%);
      transition-duration: calc(var(--duration-slow) * 0.75);
    }
    .sheet.full {
      block-size: calc(100dvh - var(--safe-top) - var(--space-6));
    }
    .sheet:is([open]):where(:not([data-closing])) {
      transform: none;
      transition-duration: var(--duration-slow);

      @starting-style {
        transform: translateY(100%);
      }
    }
    .sheet .grab {
      display: block;
      flex: none;
      inline-size: 36px;
      block-size: 4px;
      margin: var(--space-2) auto 0;
      border-radius: var(--radius-full);
      background: var(--color-border-strong);
    }
    .sheet .head {
      padding: var(--space-2) var(--space-2) 0 var(--space-4);
    }
    .sheet .body:last-child,
    .sheet .actions {
      padding-block-end: calc(var(--space-4) + var(--safe-bottom));
    }
    .sheet .actions {
      padding-inline: var(--space-4);
    }
    .sheet {
      padding-inline: var(--safe-left) var(--safe-right);
    }
  }
  @media (width >= 48em) {
    .sheet.full {
      inline-size: min(100% - 2 * var(--gutter), 36rem);
      block-size: min(80dvh, 100dvh - 2 * var(--gutter));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .overlay::backdrop,
    .overlay:is([open]):where(:not([data-closing])),
    .overlay:is([open]):where(:not([data-closing]))::backdrop {
      transform: none;
      transition-duration: var(--duration-fast);
    }
    @starting-style {
      .overlay:is([open]):where(:not([data-closing])) {
        transform: none;
      }
    }
  }
  @media (prefers-reduced-motion: reduce) and (width < 48em) {
    .sheet,
    .sheet:is([open]):where(:not([data-closing])) {
      transform: none;
      transition-duration: var(--duration-fast);
    }
    @starting-style {
      .sheet:is([open]):where(:not([data-closing])) {
        transform: none;
      }
    }
  }
</style>
