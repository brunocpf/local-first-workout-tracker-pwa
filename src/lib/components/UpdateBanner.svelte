<script lang="ts">
  import { update, applyUpdate } from "#lib/pwa/update.svelte";
  import { t } from "#lib/i18n.svelte";
</script>

{#if update.available}
  <div class="update" role="status">
    <span>{t("update.available")}</span>
    <button type="button" onclick={applyUpdate}>{t("update.reload")}</button>
  </div>
{/if}

<style>
  .update { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.5rem 1rem; background: #27272a; font-size: 0.875rem; }
  button { min-height: 32px; padding: 0 0.75rem; border: 1px solid #4ade80; border-radius: 6px; background: none; color: #4ade80; font: inherit; cursor: pointer; }
</style>
