<script lang="ts">
  import { measurementLabel } from "#lib/catalog/labels";
  import { formatLocaleNumber } from "#lib/format";
  import { intlLocale } from "#lib/i18n.svelte";
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import LineChart from "#lib/components/charts/LineChart.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import { displayMeasurement, measurementUnit, toStoredMeasurement } from "#lib/measurements";
  import { settings } from "#lib/settings.svelte";
  import { addMeasurement, deleteMeasurement, listMeasurements } from "#lib/storage/measurements";
  import { localDate } from "#lib/time";
  import { MEASUREMENT_KINDS, MEASUREMENT_MAX, type BodyMeasurement, type MeasurementKind } from "#lib/types";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";

  const OTHER_KINDS = MEASUREMENT_KINDS.filter((k) => k !== "bodyweight");
  const kindOptions = (kinds: readonly MeasurementKind[]) => kinds.map((k) => ({ value: k, label: measurementLabel(k) }));

  let items = $state<BodyMeasurement[]>([]);
  let loaded = $state(false);
  let failed = $state(false);

  let weight = $state<number | null>(null);
  let weightError = $state("");
  let otherKind = $state<string>("waist");
  let other = $state<number | null>(null);
  let otherError = $state("");
  let saving = $state(false);
  let shown = $state<string>("bodyweight");

  const units = $derived({ weightUnit: settings.weightUnit, lengthUnit: settings.lengthUnit });
  const unitOf = (kind: MeasurementKind) => measurementUnit(kind, units);
  const show = (kind: MeasurementKind, stored: number) => displayMeasurement(kind, stored, units);
  const maxOf = (kind: MeasurementKind) => show(kind, MEASUREMENT_MAX[kind]);

  async function load() {
    try {
      items = await listMeasurements();
      failed = false;
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  }
  onMount(load);

  async function log(kind: MeasurementKind, typed: number | null): Promise<string | undefined> {
    if (typed === null || typed <= 0) return t("body.errPositive");
    if (typed > maxOf(kind)) return t("body.errMax", { max: maxOf(kind), unit: unitOf(kind) });
    saving = true;
    try {
      await addMeasurement({ kind, value: toStoredMeasurement(kind, typed, units) });
      shown = kind;
      toast(t("body.logged", { kind: measurementLabel(kind) }));
      await load();
    } catch {
      return t("body.saveFailed");
    } finally {
      saving = false;
    }
  }

  async function submitWeight(e: SubmitEvent) {
    e.preventDefault();
    weightError = (await log("bodyweight", weight)) ?? "";
    if (!weightError) weight = null;
  }

  async function submitOther(e: SubmitEvent) {
    e.preventDefault();
    otherError = (await log(otherKind as MeasurementKind, other)) ?? "";
    if (!otherError) other = null;
  }

  async function remove(m: BodyMeasurement) {
    const label = `${show(m.kind, m.value)} ${unitOf(m.kind)}`;
    const ok = await confirm({
      title: t("body.deleteTitle"),
      body: t("body.deleteBody", { kind: measurementLabel(m.kind), value: label, date: dateText(m) }),
      confirmLabel: t("body.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteMeasurement(m.id);
      toast(t("body.deleted"));
      await load();
    } catch {
      toast(t("body.deleteFailed"));
    }
  }

  const dateFmt = $derived(new Intl.DateTimeFormat(intlLocale(), { timeZone: "UTC", dateStyle: "medium" }));
  const dayOf = (m: BodyMeasurement) => localDate({ startedAt: m.measuredAt, timeZone: m.timeZone });
  const dateText = (m: BodyMeasurement) => dateFmt.format(new Date(`${dayOf(m)}T00:00:00Z`));

  const kind = $derived(shown as MeasurementKind);
  const ofKind = $derived(items.filter((m) => m.kind === kind));
  const points = $derived(ofKind.map((m) => ({ date: dayOf(m), value: show(m.kind, m.value) })).reverse());
  const latest = $derived(points.at(-1));
</script>

<PageHeader title={t("body.title")} back={{ href: resolve("/progress"), label: t("body.back") }} />

{#if failed}
  <EmptyState icon="alert-triangle" title={t("body.loadFailed")} body={t("history.reloadHint")} />
{:else}
  <div class="sections">
    <Card as="section" header={logWeight}>
      <form onsubmit={submitWeight} novalidate>
        <NumberField
          label={t("body.bodyweight")}
          suffix={unitOf("bodyweight")}
          bind:value={weight}
          max={maxOf("bodyweight")}
          error={weightError}
          enterkeyhint="done"
        />
        <Button type="submit" variant="primary" loading={saving}>{t("body.logWeight")}</Button>
      </form>
    </Card>

    <Card as="section" header={logOther}>
      <form onsubmit={submitOther} novalidate>
        <Select label={t("body.measurement")} bind:value={otherKind} options={kindOptions(OTHER_KINDS)} />
        <NumberField
          label={t("body.value")}
          suffix={unitOf(otherKind as MeasurementKind)}
          bind:value={other}
          max={maxOf(otherKind as MeasurementKind)}
          error={otherError}
        />
        <Button type="submit" variant="primary" loading={saving}>{t("body.add")}</Button>
      </form>
    </Card>

    <Card as="section" header={history}>
      <div class="stack">
        <Select label={t("body.show")} bind:value={shown} options={kindOptions(MEASUREMENT_KINDS)} />
        {#if loaded && ofKind.length === 0}
          <EmptyState icon="chart" title={t("body.noneYet", { kind: measurementLabel(kind).toLowerCase() })} body={t("body.logAbove")} />
        {:else if latest}
          <p class="headline">
            <span class="big tabular">{formatLocaleNumber(latest.value)} {unitOf(kind)}</span>
            <span class="muted">{t("body.latest")}</span>
          </p>
          <LineChart
            {points}
            label={measurementLabel(kind)}
            unit={unitOf(kind)}
            emptyTitle={t("chart.noDataTitle")}
            emptyBody={t("body.logAbove")}
          />
        {/if}
      </div>
    </Card>

    {#if ofKind.length > 0}
      <Card as="section" header={entries} padding="none">
        <ul class="entries" aria-label={t("body.entriesLabel", { kind: measurementLabel(kind) })}>
          {#each ofKind as m (m.id)}
            <li>
              <ListRow title="{formatLocaleNumber(show(m.kind, m.value))} {unitOf(m.kind)}" subtitle={dateText(m)}>
                {#snippet trailing()}
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    label={t("body.deleteEntry", { kind: measurementLabel(m.kind).toLowerCase(), value: `${formatLocaleNumber(show(m.kind, m.value))} ${unitOf(m.kind)}`, date: dateText(m) })}
                    onclick={() => remove(m)}
                  />
                {/snippet}
              </ListRow>
            </li>
          {/each}
        </ul>
      </Card>
    {/if}
  </div>
{/if}

{#snippet logWeight()}{t("body.logWeight")}{/snippet}
{#snippet logOther()}{t("body.otherKinds")}{/snippet}
{#snippet history()}{t("body.chart")}{/snippet}
{#snippet entries()}{t("body.entries")}{/snippet}

<style>
  .sections,
  .stack,
  form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }
  .sections {
    padding-block-start: var(--space-3);
  }
  .headline {
    margin: 0;
  }
  .big {
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
  }
  .tabular {
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--color-text-muted);
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .entries li + li {
    border-block-start: var(--border-w) solid var(--color-border);
  }
</style>
