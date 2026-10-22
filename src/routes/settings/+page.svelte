<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/i18n.svelte";
  import { version } from "$app/env";
  import { resolve } from "$app/paths";
  import InstallHint from "#lib/components/InstallHint.svelte";
  import BackupSection from "#lib/components/settings/BackupSection.svelte";
  import NotificationsSection from "#lib/components/settings/NotificationsSection.svelte";
  import PlateSettings from "#lib/components/settings/PlateSettings.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import { playTestAlert, vibrationSupported } from "#lib/alerts";
  import { formatBytes } from "#lib/diagnostics";
  import { isPushConfigured } from "#lib/push";
  import { isStandalone } from "#lib/pwa/install";
  import { DEFAULT_PROGRESSION_INCREMENT } from "#lib/progress/progression";
  import { DEFAULT_WARMUP_SCHEME, formatScheme, parseScheme } from "#lib/tools/warmup";
  import { settings, updateSettings } from "#lib/settings.svelte";
  import { getPersistenceStatus, requestPersistentStorage, type PersistenceStatus } from "#lib/storage/persistence";
  import type { EffortInput, LengthUnit, UserSettings } from "#lib/types";

  // Warm-up scheme is edited as text ("bar x 10, 40 x 5") and saved only when it parses.
  const savedScheme = $derived(formatScheme(settings.warmupScheme ?? DEFAULT_WARMUP_SCHEME));
  let schemeEdit = $state<string>();
  const schemeText = $derived(schemeEdit ?? savedScheme);
  const schemeParsed = $derived(parseScheme(schemeText));
  async function saveScheme() {
    if (!schemeParsed) return;
    await save({ warmupScheme: schemeParsed });
    schemeEdit = undefined;
  }

  const pushConfigured = isPushConfigured();
  let standalone = $state(false);
  let persistence = $state<PersistenceStatus>();
  let requesting = $state(false);
  let saveError = $state("");
  let canVibrate = $state(false);

  onMount(async () => {
    standalone = isStandalone();
    canVibrate = vibrationSupported();
    persistence = await getPersistenceStatus();
  });

  async function save(patch: Partial<UserSettings>) {
    saveError = "";
    try {
      await updateSettings(patch);
    } catch {
      saveError = t("st.saveFailed");
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
  const statusLabel = $derived(persisted === true ? t("st.yes") : persisted === false ? t("st.no") : t("st.unknown"));
</script>

<PageHeader title={t("st.title")} />

{#if saveError}
  <Banner variant="danger" urgent>{saveError}</Banner>
{/if}

<div class="sections">
  <Card as="section" header={units}>
    <div class="stack">
      <SegmentedControl
        legend={t("st.weightUnit")}
        legendVisible
        bind:value={() => settings.weightUnit, (v) => save({ weightUnit: v as UserSettings["weightUnit"] })}
        options={[
          { value: "kg", label: "kg" },
          { value: "lb", label: "lb" },
        ]}
      />
      <SegmentedControl
        legend={t("st.lengthUnit")}
        legendVisible
        bind:value={() => settings.lengthUnit ?? "cm", (v) => save({ lengthUnit: v as LengthUnit })}
        options={[
          { value: "cm", label: "cm" },
          { value: "in", label: "in" },
        ]}
      />
    </div>
  </Card>

  <Card as="section" header={workout}>
    <div class="stack">
      <NumberField
        label={t("st.defaultRest")}
        mode="integer"
        suffix={t("st.seconds")}
        min={0}
        max={3600}
        value={settings.defaultRestSeconds}
        onchange={(n) => n !== null && save({ defaultRestSeconds: n })}
      />
      <Switch
        label={t("st.autoRest")}
        description={t("st.autoRestDesc")}
        bind:checked={() => settings.autoStartRestTimer, (v) => save({ autoStartRestTimer: v })}
      />
      <Switch
        label={t("st.restSound")}
        bind:checked={() => settings.timerSound !== false, (v) => save({ timerSound: v })}
      />
      {#if canVibrate}
        <Switch
          label={t("st.restVibration")}
          bind:checked={() => settings.timerVibration !== false, (v) => save({ timerVibration: v })}
        />
      {/if}
      <Switch
        label={t("st.warning10")}
        description={t("st.warning10Desc")}
        bind:checked={() => settings.timerCountdownCue === true, (v) => save({ timerCountdownCue: v })}
      />
      <Button
        onclick={() => playTestAlert({ sound: settings.timerSound !== false, vibrate: settings.timerVibration !== false })}
      >
        {t("st.testAlert")}
      </Button>
      <SegmentedControl
        legend={t("st.effort")}
        legendVisible
        bind:value={() => settings.effortInput ?? "off", (v) => save({ effortInput: v as EffortInput })}
        options={[
          { value: "off", label: t("st.off") },
          { value: "rpe", label: "RPE" },
          { value: "rir", label: "RIR" },
        ]}
      />
      <SegmentedControl
        legend={t("st.previousFrom")}
        legendVisible
        bind:value={() => settings.previousValuesMode, (v) => save({ previousValuesMode: v as UserSettings["previousValuesMode"] })}
        options={[
          { value: "exercise", label: t("st.lastExercise") },
          { value: "routine", label: t("st.sameRoutine") },
        ]}
      />
      <Switch
        label={t("st.progression")}
        description={t("st.progressionDesc")}
        bind:checked={() => settings.progressionEnabled ?? false, (v) => save({ progressionEnabled: v })}
      />
      {#if settings.progressionEnabled}
        <NumberField
          label={t("st.increment")}
          suffix={settings.weightUnit}
          min={0.25}
          max={50}
          value={(settings.progressionIncrement ?? DEFAULT_PROGRESSION_INCREMENT)[settings.weightUnit]}
          onchange={(n) =>
            n !== null &&
            save({ progressionIncrement: { ...DEFAULT_PROGRESSION_INCREMENT, ...settings.progressionIncrement, [settings.weightUnit]: n } })}
        />
      {/if}
      <TextField
        label={t("st.warmups")}
        hint={t("st.warmupsHint")}
        bind:value={() => schemeText, (v) => (schemeEdit = v)}
        error={schemeParsed ? undefined : t("st.warmupsError")}
        enterkeyhint="done"
      />
      <div class="row">
        <Button variant="primary" disabled={!schemeParsed || schemeText === savedScheme} onclick={saveScheme}>{t("st.saveWarmups")}</Button>
        <Button variant="ghost" onclick={() => { schemeEdit = undefined; void save({ warmupScheme: DEFAULT_WARMUP_SCHEME }); }}>{t("st.reset")}</Button>
      </div>
    </div>
  </Card>

  <Card as="section" header={plates}>
    <PlateSettings onerror={() => (saveError = t("st.saveFailed"))} />
  </Card>

  {#if pushConfigured}
    <Card as="section" header={notifications}>
      <NotificationsSection />
    </Card>
  {/if}

  <Card as="section" header={appearance}>
    <SegmentedControl
      legend={t("st.theme")}
      bind:value={() => settings.theme, (v) => save({ theme: v as UserSettings["theme"] })}
      options={[
        { value: "system", label: t("settings.language.system") },
        { value: "light", label: t("st.light") },
        { value: "dark", label: t("st.dark") },
      ]}
    />
    <SegmentedControl
      legend={t("settings.language")}
      bind:value={() => settings.locale ?? "system", (v) => save({ locale: v as UserSettings["locale"] })}
      options={[
        { value: "system", label: t("settings.language.system") },
        { value: "en", label: "English" },
        { value: "pt-BR", label: "Português (Brasil)" },
      ]}
    />
  </Card>

  <Card as="section" header={calendar}>
    <SegmentedControl
      legend={t("st.weekStarts")}
      legendVisible
      bind:value={() => String(settings.weekStartsOn), (v) => save({ weekStartsOn: Number(v) as UserSettings["weekStartsOn"] })}
      options={[
        { value: "1", label: t("st.mon") },
        { value: "0", label: t("st.sun") },
        { value: "6", label: t("st.sat") },
      ]}
    />
  </Card>

  <Card as="section" header={backup}>
    <BackupSection />
  </Card>

  <Card as="section" header={install}>
    {#if standalone}
      <p class="note">{t("st.installed")}</p>
    {:else}
      <InstallHint dismissible={false} />
    {/if}
  </Card>

  <Card as="section" header={importData} padding="none">
    <ListRow title={t("st.importHevy")} subtitle={t("st.importHevyDesc")} href={resolve("/settings/import-hevy")} />
    <ListRow title={t("st.importCsv")} subtitle={t("st.importCsvDesc")} href={resolve("/settings/import-csv")} />
  </Card>

  <!-- Backup reminder goes here (T4.05, #73). -->

  <Card as="section" header={storage}>
    <div class="stack">
      <dl>
        <dt>{t("st.persistent")}</dt>
        <dd data-testid="persisted">{statusLabel}</dd>
        <dt>{t("st.usage")}</dt>
        <dd>{persistence ? t("st.usageOf", { used: formatBytes(persistence.usageBytes), quota: formatBytes(persistence.quotaBytes) }) : "…"}</dd>
      </dl>
      {#if persistence}
        {#if persisted === true}
          <Banner variant="success">{t("st.protected")}</Banner>
        {:else}
          <Banner variant="warning" title={persisted === false ? t("st.notProtected") : t("st.unknownProtection")}>
            {#if !persistence.supported}
              {t("st.unsupported")}
            {:else if persisted === false}
              {t("st.mayDelete")}
            {:else}
              {t("st.didntSay")}
            {/if}
            {t("st.keepBackups")}
          </Banner>
        {/if}
        {#if persisted !== true && persistence.supported}
          <Button onclick={request} loading={requesting}>{t("st.requestPersist")}</Button>
        {/if}
      {/if}
    </div>
  </Card>

  <Card as="section" header={about} padding="none">
    <dl class="about">
      <dt>{t("st.version")}</dt>
      <dd>{version}</dd>
    </dl>
    <ListRow title={t("st.diagnostics")} subtitle={t("st.diagnosticsDesc")} href={resolve("/diagnostics")} />
  </Card>
</div>

{#snippet units()}{t("st.units")}{/snippet}
{#snippet workout()}{t("st.workout")}{/snippet}
{#snippet plates()}{t("st.plates")}{/snippet}
{#snippet notifications()}{t("st.notifications")}{/snippet}
{#snippet appearance()}{t("st.appearance")}{/snippet}
{#snippet calendar()}{t("st.calendar")}{/snippet}
{#snippet backup()}{t("st.backup")}{/snippet}
{#snippet install()}{t("st.install")}{/snippet}
{#snippet importData()}{t("st.import")}{/snippet}
{#snippet storage()}{t("st.storage")}{/snippet}
{#snippet about()}{t("st.about")}{/snippet}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .sections,
  .stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr); /* an implicit auto track grows to the widest child's min-content and overflows at large text sizes */
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
  .note {
    margin: 0;
    color: var(--color-text-muted);
  }
  .about {
    padding: var(--space-4);
  }
</style>
