<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  type Variant = "info" | "success" | "warning" | "danger";
  let {
    variant,
    title,
    children,
    action,
    dismissible = false,
    ondismiss,
    urgent = false,
  }: {
    variant: Variant;
    title?: string;
    children: Snippet;
    action?: { label: string; onclick: () => void };
    dismissible?: boolean;
    ondismiss?: () => void;
    /** Danger banner appearing as the direct result of a user action: uses role="alert". */
    urgent?: boolean;
  } = $props();

  const iconName = $derived(variant === "info" ? "info" : variant === "success" ? "check" : "alert-triangle");
  const role = $derived(variant === "danger" && urgent ? "alert" : "status");
  let dismissed = $state(false);

  function dismiss() {
    dismissed = true;
    ondismiss?.();
  }
</script>

{#if !dismissed}
  <div class="banner {variant}" {role}>
    <span class="icon"><Icon name={iconName} size={20} /></span>
    <div class="content">
      {#if title}<p class="title">{title}</p>{/if}
      <div class="text">{@render children()}</div>
    </div>
    {#if action}
      <button type="button" class="action" onclick={action.onclick}>{action.label}</button>
    {/if}
    {#if dismissible}
      <button type="button" class="dismiss" aria-label={t("common.dismiss")} onclick={dismiss}><Icon name="x" size={20} /></button>
    {/if}
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border-inline-start: 4px solid var(--edge);
    background: var(--fill);
    color: var(--color-text);
  }
  .info {
    --edge: var(--color-info);
    --fill: var(--color-info-subtle);
    --tone: var(--color-info-text);
  }
  .success {
    --edge: var(--color-success);
    --fill: var(--color-success-subtle);
    --tone: var(--color-success-text);
  }
  .warning {
    --edge: var(--color-warning);
    --fill: var(--color-warning-subtle);
    --tone: var(--color-warning-text);
  }
  .danger {
    --edge: var(--color-danger);
    --fill: var(--color-danger-subtle);
    --tone: var(--color-danger-text);
  }
  .icon {
    color: var(--edge);
    display: flex;
    padding-block: 2px;
  }
  .content {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }
  .title {
    margin: 0;
    font-weight: var(--weight-semibold);
    color: var(--tone);
  }
  .text {
    font-size: var(--text-sm);
  }
  button {
    min-block-size: var(--tap-min);
    min-inline-size: var(--tap-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
    border-radius: var(--radius-md);
  }
  .action {
    padding-inline: var(--space-4);
    background: var(--color-surface-2);
    border: var(--border-w) solid var(--color-border-strong);
    font-weight: var(--weight-medium);
  }
  .dismiss {
    background: none;
    border: 0;
    order: 1;
    margin-inline-start: auto;
  }
  .content + .dismiss {
    order: 0;
  }
</style>
