<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    title,
    subtitle,
    href,
    onclick,
    leading,
    trailing,
    selected = false,
    danger = false,
  }: {
    title: string;
    subtitle?: string;
    href?: string;
    onclick?: (event: MouseEvent) => void;
    leading?: Snippet;
    trailing?: Snippet;
    selected?: boolean;
    danger?: boolean;
  } = $props();
</script>

{#snippet inner()}
  {#if leading}<span class="leading">{@render leading()}</span>{/if}
  <span class="text">
    <span class="title">{title}</span>
    {#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
  </span>
  {#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
  {#if selected}
    <span class="trail-icon accent"><Icon name="check" size={20} /></span>
  {:else if href}
    <span class="trail-icon"><Icon name="chevron-right" size={20} /></span>
  {/if}
{/snippet}

{#if href}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass an already-resolved path -->
  <a class="row" class:selected class:danger {href} aria-current={selected ? "true" : undefined}>{@render inner()}</a>
{:else if onclick}
  <button type="button" class="row" class:selected class:danger aria-pressed={selected} {onclick}>{@render inner()}</button>
{:else}
  <div class="row static" class:selected class:danger>{@render inner()}</div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    box-sizing: border-box;
    min-block-size: var(--tap-min);
    padding: var(--space-3) var(--space-4);
    background: none;
    border: 0;
    color: var(--color-text);
    font: inherit;
    text-align: start;
    text-decoration: none;
  }
  .row:has(.subtitle) {
    min-block-size: max(56px, 3.5rem);
  }
  a.row,
  button.row {
    cursor: pointer;
  }
  a.row,
  button.row {
    transition: background-color var(--duration-fast) var(--ease-standard);
    -webkit-tap-highlight-color: transparent;
  }
  @media (hover: hover) {
    a.row:hover,
    button.row:hover {
      background: var(--color-surface-2);
    }
  }
  a.row:active,
  button.row:active {
    background: var(--color-surface-3);
  }
  .selected {
    background: var(--color-accent-subtle);
  }
  .text {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    overflow-wrap: anywhere;
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
  }
  .danger .title {
    color: var(--color-danger-text);
  }
  .subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .leading,
  .trailing,
  .trail-icon {
    display: flex;
    align-items: center;
    flex: none;
  }
  .trail-icon {
    color: var(--color-text-muted);
  }
  .trail-icon.accent {
    color: var(--color-accent-text);
  }
</style>
