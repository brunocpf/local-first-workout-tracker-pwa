<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconName } from "#lib/icons";
  import Icon from "./Icon.svelte";

  let {
    variant = "secondary",
    size = "md",
    block = false,
    icon,
    iconEnd,
    loading = false,
    disabled = false,
    href,
    type = "button",
    onclick,
    children,
  }: {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    block?: boolean;
    icon?: IconName;
    iconEnd?: IconName;
    loading?: boolean;
    disabled?: boolean;
    href?: string;
    type?: "button" | "submit";
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const inactive = $derived(disabled || loading);
</script>

{#snippet content()}
  {#if loading}<span class="spinner" aria-hidden="true"></span>{:else if icon}<Icon name={icon} size="1.25em" />{/if}
  <span class="label">{@render children()}</span>
  {#if iconEnd && !loading}<Icon name={iconEnd} size="1.25em" />{/if}
{/snippet}

{#if href !== undefined}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass already-resolved hrefs -->
  <a
    class="btn {variant} {size}"
    class:block
    href={inactive ? undefined : href}
    role={inactive ? "link" : undefined}
    aria-disabled={inactive || undefined}
    aria-busy={loading || undefined}
    {onclick}
  >
    {@render content()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button
    class="btn {variant} {size}"
    class:block
    {type}
    disabled={disabled}
    aria-disabled={loading || undefined}
    aria-busy={loading || undefined}
    onclick={(e) => {
      if (loading) return e.preventDefault();
      onclick?.(e);
    }}
  >
    {@render content()}
  </button>
{/if}

<style>
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-block-size: var(--control-h);
    padding: var(--space-2) var(--space-4);
    border: var(--border-w) solid transparent;
    border-radius: var(--radius-md);
    font: inherit;
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    line-height: var(--leading-md);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    overflow-wrap: normal;
    word-break: normal;
    -webkit-tap-highlight-color: transparent;
  }
  .block { display: flex; inline-size: 100%; }
  .sm { min-block-size: 2.25rem; padding-inline: var(--space-3); padding-block: var(--space-1); font-size: var(--text-sm); line-height: var(--leading-sm); }
  .sm::after { content: ""; position: absolute; inset-inline: 0; inset-block: 50% auto; block-size: var(--tap-min); transform: translateY(-50%); }
  .lg { min-block-size: var(--control-h-lg); padding-inline: var(--space-5); font-weight: var(--weight-semibold); }

  .primary { background: var(--color-accent); color: var(--color-on-accent); }
  .primary:hover { background: var(--color-accent-hover); }
  .primary:active { background: var(--color-accent-active); }
  .secondary { background: var(--color-surface-2); color: var(--color-text); border-color: var(--color-border-strong); }
  .secondary:hover, .secondary:active { background: var(--color-surface-3); }
  .ghost { background: transparent; color: var(--color-accent-text); }
  .ghost:hover { background: var(--color-surface-2); }
  .ghost:active { background: var(--color-surface-3); }
  .danger { background: var(--color-danger); color: var(--color-on-danger); }
  .danger:hover, .danger:active { background: var(--color-danger-hover); }

  .btn:disabled, .btn[aria-disabled="true"]:not([aria-busy]) {
    background: var(--color-surface-2);
    color: var(--color-text-disabled);
    border-color: var(--color-border);
    cursor: not-allowed;
  }
  .btn[aria-busy="true"] { cursor: progress; }

  .spinner {
    inline-size: 1.25em;
    block-size: 1.25em;
    border: 2px solid currentColor;
    border-inline-end-color: transparent;
    border-radius: var(--radius-full);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
  @media (forced-colors: active) {
    .btn { border-color: ButtonText; }
    .btn:disabled, .btn[aria-disabled="true"]:not([aria-busy]) { border-color: GrayText; color: GrayText; }
  }
</style>
