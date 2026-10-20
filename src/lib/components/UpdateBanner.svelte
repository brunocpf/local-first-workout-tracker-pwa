<script lang="ts">
  import { update, applyUpdate } from "#lib/pwa/update.svelte";
</script>

{#if update.available}
  <div class="update" role="status">
    <span>Update available</span>
    <button type="button" onclick={applyUpdate}>Reload</button>
  </div>
{/if}

<style>
  .update { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) var(--space-4); background: var(--color-surface-3); font-size: var(--text-sm); }
  button { min-height: var(--tap-min); padding: 0 var(--space-3); border: var(--border-w) solid var(--color-accent); border-radius: var(--radius-sm); background: none; color: var(--color-accent-text); cursor: pointer; }
</style>
