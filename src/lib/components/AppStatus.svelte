<script lang="ts">
  import { resolve } from "$app/paths";
  import { db as defaultDb, isQuotaError, type AppDB, type DbStatus, type StorageProblem } from "#lib/storage/db";
  import { active } from "#lib/logger/activeSession.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";

  // `db` is a prop only so tests can pass their own database.
  let { db = defaultDb }: { db?: AppDB } = $props();

  let status = $state<DbStatus>({ versionChanged: false, blocked: false });
  $effect(() => {
    status = { ...db.status };
    const off = db.onStatus((s) => (status = { ...s }));
    void db.checkStorage();
    return off;
  });

  const guidance: Record<StorageProblem, string> = {
    unsupported:
      "This browser isn't letting the app store data. Private or incognito windows and some privacy settings block it. Open the app in a normal window or from the installed app.",
    quota: "Your device is out of storage. Free up some space, then reload.",
    unavailable: "The browser couldn't open the app's database. Close other tabs of this app and reload. If that doesn't help, restart the browser.",
  };

  const reload = () => location.reload();
  const settingsHref = resolve("/settings" as "/");
</script>

{#if status.openError}
  <div class="fullscreen" role="alert">
    <EmptyState icon="alert-triangle" title="Storage unavailable" body={guidance[status.openError.problem]}>
      {#snippet action()}
        <Button variant="primary" onclick={reload}>Reload</Button>
      {/snippet}
    </EmptyState>
    <p class="detail">{status.openError.message}</p>
  </div>
{:else if status.versionChanged}
  <div class="banner">
    <Banner variant="warning" title="App updated in another tab" action={{ label: "Reload", onclick: reload }}>
      {#if active.writeFailed}
        Changes made since then can't be saved in this tab. Reload to keep logging.
      {:else}
        Reload this tab to continue. Everything is already saved.
      {/if}
    </Banner>
  </div>
{:else}
  {#if status.blocked}
    <div class="banner">
      <Banner variant="info" title="Waiting for other tabs">Close other tabs of this app to finish updating its database.</Banner>
    </div>
  {/if}
  {#if active.writeFailed}
    <div class="banner">
      <Banner variant="danger" urgent title="Workout not saved" action={{ label: "Retry", onclick: () => void active.flush() }}>
        {#if isQuotaError(active.error)}Your device is out of storage.{:else}The latest changes couldn't be written to storage.{/if}
        They're kept on this screen and saved with your next change. Free up space on the device and
        <a href={settingsHref}>export a backup</a>.
      </Banner>
    </div>
  {/if}
{/if}

<style>
  .fullscreen {
    position: fixed;
    inset: 0;
    z-index: var(--z-banner);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: var(--color-bg);
    overflow-y: auto;
  }
  .detail {
    margin: 0;
    padding-inline: var(--gutter);
    max-inline-size: 40ch;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: center;
  }
  /* Sticky so the warning stays in view while scrolling a long workout. */
  .banner {
    position: sticky;
    inset-block-start: var(--safe-top);
    z-index: var(--z-banner);
    margin-block-end: var(--space-3);
  }
</style>
