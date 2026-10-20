<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    header,
    padding = "md",
    as = "div",
  }: { children: Snippet; header?: Snippet; padding?: "none" | "md"; as?: "section" | "article" | "div" } = $props();
</script>

<svelte:element this={as} class="card" class:flush={padding === "none"}>
  {#if header}<div class="header">{@render header()}</div>{/if}
  <div class="body">{@render children()}</div>
</svelte:element>

<style>
  .card {
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: clip;
  }
  .header {
    padding: var(--space-4) var(--space-4) var(--space-3);
    font-weight: var(--weight-semibold);
  }
  .body {
    padding: var(--space-4);
  }
  .header + .body {
    padding-block-start: 0;
  }
  .flush .header {
    border-block-end: var(--border-w) solid var(--color-border);
    padding-block-end: var(--space-3);
  }
  .flush .body {
    padding: 0;
  }
  @media (width < 24em) {
    .header,
    .body {
      padding-inline: var(--space-3);
    }
    .flush .body {
      padding: 0;
    }
  }
</style>
