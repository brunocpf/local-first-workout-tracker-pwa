<script lang="ts">
  import { onMount } from "svelte";
  import { version } from "$app/env";
  import { resolve } from "$app/paths";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import { formatBytes } from "#lib/diagnostics";
  import { settings, updateSettings } from "#lib/settings.svelte";
  import { getPersistenceStatus, requestPersistentStorage, type PersistenceStatus } from "#lib/storage/persistence";
  import type { UserSettings } from "#lib/types";

  let persistence = $state<PersistenceStatus>();
  let requesting = $state(false);
  let saveError = $state("");

  onMount(async () => {
    persistence = await getPersistenceStatus();
  });

  async function save(patch: Partial<UserSettings>) {
    saveError = "";
    try {
      await updateSettings(patch);
    } catch {
      saveError = "Couldn't save that change. Storage may be unavailable.";
    }
  }

  async function request() {
    requesting = true;
    try {
      persistence = await requestPersistentStorage();
    } finally {
      requesting = false;
    }
  }

  const persisted = $derived(persistence?.persisted ?? null);
  const statusLabel = $derived(persisted === true ? "Yes" : persisted === false ? "No" : "Unknown");
</script>

<PageHeader title="Settings" />

{#if saveError}
  <Banner variant="danger" urgent>{saveError}</Banner>
{/if}

<div class="sections">
  <Card as="section" header={units}>
    <SegmentedControl
      legend="Weight unit"
      bind:value={() => settings.weightUnit, (v) => save({ weightUnit: v as UserSettings["weightUnit"] })}
      options={[
        { value: "kg", label: "kg" },
        { value: "lb", label: "lb" },
      ]}
    />
  </Card>

  <Card as="section" header={workout}>
    <div class="stack">
      <NumberField
        label="Default rest"
        mode="integer"
        suffix="seconds"
        min={0}
        max={3600}
        value={settings.defaultRestSeconds}
        onchange={(n) => n !== null && save({ defaultRestSeconds: n })}
      />
      <Switch
        label="Auto-start rest timer"
        description="Start the timer when you complete a set."
        bind:checked={() => settings.autoStartRestTimer, (v) => save({ autoStartRestTimer: v })}
      />
    </div>
  </Card>

  <Card as="section" header={appearance}>
    <SegmentedControl
      legend="Theme"
      bind:value={() => settings.theme, (v) => save({ theme: v as UserSettings["theme"] })}
      options={[
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  </Card>

  <Card as="section" header={calendar}>
    <SegmentedControl
      legend="Week starts on"
      legendVisible
      bind:value={() => String(settings.weekStartsOn), (v) => save({ weekStartsOn: Number(v) as UserSettings["weekStartsOn"] })}
      options={[
        { value: "1", label: "Mon" },
        { value: "0", label: "Sun" },
        { value: "6", label: "Sat" },
      ]}
    />
  </Card>

  <!-- Backup section goes here (T4.04, #55): export, restore, backup reminder. -->

  <Card as="section" header={storage}>
    <div class="stack">
      <dl>
        <dt>Persistent storage</dt>
        <dd data-testid="persisted">{statusLabel}</dd>
        <dt>Usage</dt>
        <dd>{persistence ? `${formatBytes(persistence.usageBytes)} of ${formatBytes(persistence.quotaBytes)}` : "…"}</dd>
      </dl>
      {#if persistence}
        {#if persisted === true}
          <Banner variant="success">Your data is protected from automatic cleanup by the browser.</Banner>
        {:else}
          <Banner variant="warning" title={persisted === false ? "Storage isn't protected" : "Storage protection unknown"}>
            {#if !persistence.supported}
              This browser doesn't report whether storage is persistent.
            {:else if persisted === false}
              The browser may delete workout data when the device is low on space, or after a period of not using the app.
            {:else}
              The browser didn't say whether your data is protected.
            {/if}
            Keep regular backups so you never lose your history. On iPhone and iPad, installing the app to the Home Screen
            gives the best protection; Chrome and Edge usually grant it to installed apps or after frequent use; Firefox asks
            for permission.
          </Banner>
        {/if}
        {#if persisted !== true && persistence.supported}
          <Button onclick={request} loading={requesting}>Request persistent storage</Button>
        {/if}
      {/if}
    </div>
  </Card>

  <Card as="section" header={about} padding="none">
    <dl class="about">
      <dt>Version</dt>
      <dd>{version}</dd>
    </dl>
    <ListRow title="Diagnostics" subtitle="Platform capabilities and a shareable report" href={resolve("/diagnostics")} />
  </Card>
</div>

{#snippet units()}Units{/snippet}
{#snippet workout()}Workout{/snippet}
{#snippet appearance()}Appearance{/snippet}
{#snippet calendar()}Calendar{/snippet}
{#snippet storage()}Storage{/snippet}
{#snippet about()}About{/snippet}

<style>
  .sections,
  .stack {
    display: grid;
    gap: var(--space-4);
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
  }
  .about {
    padding: var(--space-4);
  }
</style>
