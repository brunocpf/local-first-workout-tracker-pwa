<script lang="ts">
  import { onMount } from "svelte";
  import { version } from "$app/env";
  import { resolve } from "$app/paths";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import {
    detectCapabilities,
    formatBytes,
    formatReport,
    recordProbeLaunch,
    type Capabilities,
    type ProbeRecord,
  } from "#lib/diagnostics";
  import { getPersistenceStatus, requestPersistentStorage, type PersistenceStatus } from "#lib/storage/persistence";

  let capabilities = $state<Capabilities>();
  let persistence = $state<PersistenceStatus>();
  let probe = $state<ProbeRecord | null>(null);
  let copyResult = $state("");

  const yn = (v: boolean) => (v ? "yes" : "no");

  onMount(async () => {
    capabilities = detectCapabilities();
    persistence = await getPersistenceStatus();
    probe = await recordProbeLaunch().catch(() => null);
  });

  async function requestPersistence() {
    persistence = await requestPersistentStorage();
  }

  async function copyReport() {
    if (!capabilities || !persistence) return;
    const text = formatReport({
      appVersion: version,
      capabilities: $state.snapshot(capabilities),
      persistence: $state.snapshot(persistence),
      probe: probe ? $state.snapshot(probe) : null,
      generatedAt: new Date().toISOString(),
    });
    try {
      await navigator.clipboard.writeText(text);
      copyResult = "Report copied.";
    } catch {
      copyResult = "Copy failed; clipboard not available.";
    }
  }
</script>

<PageHeader title="Diagnostics" back={{ href: resolve("/settings" as "/"), label: "Settings" }} />

{#if capabilities && persistence}
  <div class="sections">
    <Card as="section" header={platform}>
      <dl>
        <dt>App version</dt><dd>{version}</dd>
        <dt>Standalone (installed)</dt><dd>{yn(capabilities.standalone)}</dd>
        <dt>Service worker controlling page</dt><dd>{yn(capabilities.serviceWorkerControlled)}</dd>
        <dt>Share files</dt><dd>{yn(capabilities.canShareFiles)}</dd>
        <dt>Screen wake lock</dt><dd>{yn(capabilities.wakeLock)}</dd>
        <dt>Vibration</dt><dd>{yn(capabilities.vibrate)}</dd>
        <dt>Notifications</dt>
        <dd>{yn(capabilities.notifications)}{capabilities.notificationPermission ? ` (${capabilities.notificationPermission})` : ""}</dd>
        <dt>User agent</dt><dd>{capabilities.userAgent}</dd>
      </dl>
    </Card>

    <Card as="section" header={storage}>
      <div class="stack">
        <dl>
          <dt>Storage API</dt><dd>{yn(persistence.supported)}</dd>
          <dt>Persistent storage</dt><dd>{persistence.persisted === null ? "unknown" : yn(persistence.persisted)}</dd>
          <dt>Usage</dt><dd>{formatBytes(persistence.usageBytes)} of {formatBytes(persistence.quotaBytes)}</dd>
          <dt>First seen</dt><dd>{probe?.firstSeenAt ?? "unavailable"}</dd>
          <dt>Last seen</dt><dd>{probe?.lastSeenAt ?? "unavailable"}</dd>
          <dt>Launch count</dt><dd>{probe?.launchCount ?? "unavailable"}</dd>
        </dl>
        <Button onclick={requestPersistence}>Request persistent storage</Button>
      </div>
    </Card>

    <Card as="section" header={report}>
      <div class="stack">
        <div><Button onclick={copyReport}>Copy report</Button></div>
        <p role="status">{copyResult}</p>
      </div>
    </Card>
  </div>
{:else}
  <p>Loading…</p>
{/if}

{#snippet platform()}Platform{/snippet}
{#snippet storage()}Storage{/snippet}
{#snippet report()}Report{/snippet}

<style>
  .sections,
  .stack {
    display: grid;
    gap: var(--space-4);
  }
  p {
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    text-align: end;
    overflow-wrap: anywhere;
  }
</style>
