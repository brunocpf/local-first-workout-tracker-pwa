<script lang="ts">
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
  import { displayMeasurement, MEASUREMENT_LABELS, measurementUnit, toStoredMeasurement } from "#lib/measurements";
  import { settings } from "#lib/settings.svelte";
  import { addMeasurement, deleteMeasurement, listMeasurements } from "#lib/storage/measurements";
  import { localDate } from "#lib/time";
  import { MEASUREMENT_KINDS, MEASUREMENT_MAX, type BodyMeasurement, type MeasurementKind } from "#lib/types";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";

  const OTHER_KINDS = MEASUREMENT_KINDS.filter((k) => k !== "bodyweight");
  const kindOptions = (kinds: readonly MeasurementKind[]) => kinds.map((k) => ({ value: k, label: MEASUREMENT_LABELS[k] }));

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
    if (typed === null || typed <= 0) return "Enter a value above 0.";
    if (typed > maxOf(kind)) return `Enter a value up to ${maxOf(kind)} ${unitOf(kind)}.`;
    saving = true;
    try {
      await addMeasurement({ kind, value: toStoredMeasurement(kind, typed, units) });
      shown = kind;
      toast(`${MEASUREMENT_LABELS[kind]} logged`);
      await load();
    } catch {
      return "Couldn't save that measurement. Storage may be unavailable.";
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
      title: "Delete measurement?",
      body: `${MEASUREMENT_LABELS[m.kind]} ${label} on ${dateText(m)} will be removed.`,
      confirmLabel: "Delete measurement",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteMeasurement(m.id);
      toast("Measurement deleted");
      await load();
    } catch {
      toast("Couldn't delete that measurement");
    }
  }

  const dateFmt = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", dateStyle: "medium" });
  const dayOf = (m: BodyMeasurement) => localDate({ startedAt: m.measuredAt, timeZone: m.timeZone });
  const dateText = (m: BodyMeasurement) => dateFmt.format(new Date(`${dayOf(m)}T00:00:00Z`));

  const kind = $derived(shown as MeasurementKind);
  const ofKind = $derived(items.filter((m) => m.kind === kind));
  const points = $derived(ofKind.map((m) => ({ date: dayOf(m), value: show(m.kind, m.value) })).reverse());
  const latest = $derived(points.at(-1));
</script>

<PageHeader title="Body measurements" back={{ href: resolve("/progress"), label: "Back to progress" }} />

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load measurements" body="Reload the app and try again." />
{:else}
  <div class="sections">
    <Card as="section" header={logWeight}>
      <form onsubmit={submitWeight} novalidate>
        <NumberField
          label="Bodyweight"
          suffix={unitOf("bodyweight")}
          bind:value={weight}
          max={maxOf("bodyweight")}
          error={weightError}
          enterkeyhint="done"
        />
        <Button type="submit" variant="primary" loading={saving}>Log bodyweight</Button>
      </form>
    </Card>

    <Card as="section" header={logOther}>
      <form onsubmit={submitOther} novalidate>
        <Select label="Measurement" bind:value={otherKind} options={kindOptions(OTHER_KINDS)} />
        <NumberField
          label="Value"
          suffix={unitOf(otherKind as MeasurementKind)}
          bind:value={other}
          max={maxOf(otherKind as MeasurementKind)}
          error={otherError}
        />
        <Button type="submit" variant="primary" loading={saving}>Add measurement</Button>
      </form>
    </Card>

    <Card as="section" header={history}>
      <div class="stack">
        <Select label="Show" bind:value={shown} options={kindOptions(MEASUREMENT_KINDS)} />
        {#if loaded && ofKind.length === 0}
          <EmptyState icon="chart" title="No {MEASUREMENT_LABELS[kind].toLowerCase()} yet" body="Log a value above to start a chart." />
        {:else if latest}
          <p class="headline">
            <span class="big tabular">{latest.value.toLocaleString()} {unitOf(kind)}</span>
            <span class="muted">Latest</span>
          </p>
          <LineChart
            {points}
            label={MEASUREMENT_LABELS[kind]}
            unit={unitOf(kind)}
            emptyTitle="No data yet"
            emptyBody="Log a value above to start a chart."
          />
        {/if}
      </div>
    </Card>

    {#if ofKind.length > 0}
      <Card as="section" header={entries} padding="none">
        <ul class="entries" aria-label="{MEASUREMENT_LABELS[kind]} entries">
          {#each ofKind as m (m.id)}
            <li>
              <ListRow title="{show(m.kind, m.value).toLocaleString()} {unitOf(m.kind)}" subtitle={dateText(m)}>
                {#snippet trailing()}
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    label="Delete {MEASUREMENT_LABELS[m.kind].toLowerCase()} {show(m.kind, m.value).toLocaleString()} {unitOf(m.kind)} from {dateText(m)}"
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

{#snippet logWeight()}Log bodyweight{/snippet}
{#snippet logOther()}Other measurements{/snippet}
{#snippet history()}Chart{/snippet}
{#snippet entries()}Entries{/snippet}

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
