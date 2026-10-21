<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    title,
    subtitle,
    back,
    actions,
  }: { title: string; subtitle?: string; back?: { href: string; label: string }; actions?: Snippet } = $props();
</script>

<header>
  {#if back}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass an already-resolved path -->
    <a class="back" href={back.href} aria-label={back.label}><Icon name="chevron-left" size={24} /></a>
  {/if}
  <div class="heading">
    <h1>{title}</h1>
    {#if subtitle}<p>{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  header {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sticky);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    min-block-size: calc(var(--header-h) + var(--safe-top));
    /* Full bleed inside main's gutters, so the title lines up with the content below it. The shell reserves the
       trailing slot for its Settings link on phones. */
    margin-inline: calc(-1 * var(--gutter));
    padding-block: var(--safe-top) var(--space-1);
    padding-inline: var(--gutter) calc(var(--gutter) + var(--header-end-reserve, 0px));
    background: var(--color-bg);
    border-block-end: var(--border-w) solid var(--color-border);
  }
  .back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--tap-min);
    min-block-size: var(--tap-min);
    margin-inline-start: calc(-1 * var(--space-2));
    color: var(--color-text);
    border-radius: var(--radius-md);
  }
  .heading {
    flex: 1 1 6rem;
    min-inline-size: 0;
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    line-height: var(--leading-lg);
    font-weight: var(--weight-semibold);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
    max-inline-size: 100%;
  }
</style>
