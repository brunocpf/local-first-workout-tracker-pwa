<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "#lib/icons";

  let { icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: Snippet } = $props();
</script>

<div class="empty">
  <span class="icon"><Icon name={icon} size={32} /></span>
  <p class="title">{title}</p>
  {#if body}<p class="body">{body}</p>{/if}
  {#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-block: var(--space-10);
    padding-inline: var(--gutter);
  }
  .icon {
    color: var(--color-text-muted);
    display: flex;
  }
  .title {
    margin: var(--space-3) 0 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .body {
    margin: var(--space-1) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    max-inline-size: 40ch;
  }
  /* Several actions wrap onto more rows with the same gap both ways, never touching. */
  .action {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-block-start: var(--space-4);
  }
</style>
