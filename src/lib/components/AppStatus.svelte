<script module lang="ts">
  import { db as appDb, type DbStatus as Status } from "#lib/storage/db";

  /** Reactive copy of the app database's status; the root layout renders only AppStatus while it is `fullscreen`. */
  export const storage = $state<Status>({ ...appDb.status });
  appDb.onStatus((s) => Object.assign(storage, { ...s, openError: s.openError }));

  /** Nothing works without the database: an open error or a still-running open replaces the whole app. */
  export const fullscreen = (s: Status) => !!s.openError || (s.slow && !s.blocked && !s.versionChanged);
</script>

<script lang="ts">
  import { t } from "#lib/i18n.svelte";
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

  const guidance = (problem: StorageProblem) => t(`status.${problem}`);

  const reload = () => location.reload();
  const settingsHref = resolve("/settings" as "/");
</script>

{#if status.openError}
  <!-- Rendered by the layout instead of the app (not over it), so focus and screen readers can't reach the page behind. -->
  <div class="fullscreen" role="alert">
    <EmptyState icon="alert-triangle" title={t("status.title")} body={guidance(status.openError.problem)}>
      {#snippet action()}
        <Button variant="primary" onclick={reload}>{t("common.reload")}</Button>
      {/snippet}
    </EmptyState>
    <p class="detail">{status.openError.message}</p>
  </div>
{:else if fullscreen(status)}
  <!-- A slow open may be a long migration: no Reload here, it would abort the upgrade and restart it. -->
  <div class="fullscreen" role="status">
    <Spinner label={t("status.slow")} size="2rem" />
    <p class="detail">{t("status.slowDetail")}</p>
  </div>
{:else if status.versionChanged}
  <div class="banner">
    <Banner variant="warning" title={t("status.updatedTab")} action={{ label: t("common.reload"), onclick: reload }}>
      {#if active.writeFailed}
        {t("status.updatedTab.failed")}
      {:else}
        {t("status.updatedTab.ok")}
      {/if}
    </Banner>
  </div>
{:else}
  {#if status.blocked}
    <div class="banner">
      <Banner variant="info" title={t("status.waiting")}>{t("status.waitingBody")}</Banner>
    </div>
  {/if}
  {#if active.writeFailed}
    <div class="banner">
      <Banner variant="danger" urgent title={t("status.notSaved")} action={{ label: t("common.retry"), onclick: () => void active.flush() }}>
        {#if isQuotaError(active.error)}
          {t("status.notSaved.quota")} <a href={settingsHref}>{t("status.exportBackup")}</a>.
        {:else}
          {t("status.notSaved.other")} <a href={settingsHref}>{t("status.exportBackup")}</a>.
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
