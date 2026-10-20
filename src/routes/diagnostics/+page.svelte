<script lang="ts">
  import { onMount } from "svelte";
  import { version } from "$app/env";
  import { resolve } from "$app/paths";
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

<h1>Diagnostics</h1>
<p><a href={resolve("/")}>Back to Home</a></p>

{#if capabilities && persistence}
  <h2>Platform</h2>
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

  <h2>Storage</h2>
  <dl>
    <dt>Storage API</dt><dd>{yn(persistence.supported)}</dd>
    <dt>Persistent storage</dt><dd>{persistence.persisted === null ? "unknown" : yn(persistence.persisted)}</dd>
    <dt>Usage</dt><dd>{formatBytes(persistence.usageBytes)} of {formatBytes(persistence.quotaBytes)}</dd>
    <dt>First seen</dt><dd>{probe?.firstSeenAt ?? "unavailable"}</dd>
    <dt>Last seen</dt><dd>{probe?.lastSeenAt ?? "unavailable"}</dd>
    <dt>Launch count</dt><dd>{probe?.launchCount ?? "unavailable"}</dd>
  </dl>
  <p><button type="button" onclick={requestPersistence}>Request persistent storage</button></p>

  <h2>Report</h2>
  <p><button type="button" onclick={copyReport}>Copy report</button></p>
  <p role="status">{copyResult}</p>
{:else}
  <p>Loading…</p>
{/if}
