<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "#lib/icons";

  type Variant = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  let { variant = "neutral", icon, children }: { variant?: Variant; icon?: IconName; children: Snippet } = $props();
</script>

<span class="badge {variant}">
  {#if icon}<Icon name={icon} size="1em" />{/if}
  {@render children()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    border: var(--border-w) solid transparent;
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .neutral {
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    border-color: var(--color-border);
  }
  .accent {
    background: var(--color-accent-subtle);
    color: var(--color-accent-text);
  }
  .success {
    background: var(--color-success-subtle);
    color: var(--color-success-text);
  }
  .warning {
    background: var(--color-warning-subtle);
    color: var(--color-warning-text);
  }
  .danger {
    background: var(--color-danger-subtle);
    color: var(--color-danger-text);
  }
  .info {
    background: var(--color-info-subtle);
    color: var(--color-info-text);
  }
</style>
