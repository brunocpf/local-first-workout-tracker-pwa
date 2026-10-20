<script module lang="ts">
  import { db as appDb, type DbStatus as Status } from "#lib/storage/db";

  /** Reactive copy of the app database's status; the root layout renders only AppStatus while it is `fullscreen`. */
  export const storage = $state<Status>({ ...appDb.status });
  appDb.onStatus((s) => Object.assign(storage, { ...s, openError: s.openError }));

  /** Nothing works without the database: an open error or a still-running open replaces the whole app. */
  export const fullscreen = (s: Status) => !!s.openError || (s.slow && !s.blocked && !s.versionChanged);
</script>

<script lang="ts">
  import { resolve } from "$app/paths";
  import { db as defaultDb, isQuotaError, type AppDB, type DbStatus, type StorageProblem } from "#lib/storage/db";
  import { active } from "#lib/logger/activeSession.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import Spinner from "#lib/components/ui/Spinner.svelte";

  // `db` is a prop only so tests can pass their own database.
  let { db = defaultDb }: { db?: AppDB } = $props();

  let local = $state<DbStatus>({ versionChanged: false, blocked: false, slow: false });
  const status = $derived(db === defaultDb ? storage : local);
  $effect(() => {
    local = { ...db.status };
    const off = db.onStatus((s) => (local = { ...s }));
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
  <!-- Rendered by the layout instead of the app (not over it), so focus and screen readers can't reach the page behind. -->
  <div class="fullscreen" role="alert">
    <EmptyState icon="alert-triangle" title="Storage unavailable" body={guidance[status.openError.problem]}>
      {#snippet action()}
        <Button variant="primary" onclick={reload}>Reload</Button>
      {/snippet}
    </EmptyState>
    <p class="detail">{status.openError.message}</p>
  </div>
{:else if fullscreen(status)}
  <!-- A slow open may be a long migration: no Reload here, it would abort the upgrade and restart it. -->
  <div class="fullscreen" role="status">
    <Spinner label="Still opening your data…" size="2rem" />
    <p class="detail">This can take a while after an update on older devices. Keep the app open; it continues by itself.</p>
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
        {#if isQuotaError(active.error)}
          Your device is out of storage. Your latest changes are kept on this screen and saved with your next change.
          Free up space on the device, then <a href={settingsHref}>export a backup</a>.
        {:else}
          Your latest changes couldn't be written to storage. They're kept on this screen and saved with your next
          change. Tap Retry; if it keeps failing, <a href={settingsHref}>export a backup</a>.
        {/if}
      </Banner>
    </div>
  {/if}
{/if}

<style>
  .fullscreen {
    min-block-size: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
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
