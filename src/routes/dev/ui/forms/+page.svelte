<svelte:head><title>UI forms · Workouts</title></svelte:head>

<script lang="ts">
  import Button from "#lib/components/ui/Button.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";

  const variants = ["primary", "secondary", "ghost", "danger"] as const;
  const sizes = ["sm", "md", "lg"] as const;

  let name = $state("");
  let notes = $state("");
  let weight = $state<number | null>(82.5);
  let reps = $state<number | null>(null);
  let rest = $state<number | null>(90);
  let changes = $state<(number | null)[]>([]);
  let select = $state("90");
  let on = $state(true);
  let unit = $state("kg");
  let theme = $state("system");
  let pressed = $state(false);
  let saving = $state(false);
  let submitted = $state("");

  const restOptions = ["60", "90", "120", "180"].map((v) => ({ value: v, label: `${v} s` }));
</script>

<h1>Buttons and form fields</h1>
<p class="muted">Specified in docs/design.md §6.1–6.8. Development only.</p>

<h2>Button</h2>
{#each variants as v (v)}
  <div class="row">
    {#each sizes as s (s)}<Button variant={v} size={s}>{v} {s}</Button>{/each}
    <Button variant={v} icon="plus">With icon</Button>
    <Button variant={v} iconEnd="chevron-right">Next</Button>
    <Button variant={v} disabled>Disabled</Button>
    <Button variant={v} href="#forms">Link</Button>
  </div>
{/each}
<div class="row">
  <Button variant="primary" loading={saving} onclick={() => { saving = true; setTimeout(() => (saving = false), 1500); }}>Save workout</Button>
  <Button variant="primary" loading>Loading</Button>
</div>
<Button variant="primary" size="lg" block>Block, large</Button>

<h2>IconButton</h2>
<div class="row">
  <IconButton icon="settings" label="Settings" />
  <IconButton icon="plus" label="Add set" variant="primary" />
  <IconButton icon="copy" label="Duplicate" variant="secondary" />
  <IconButton icon="trash" label="Delete" variant="danger" />
  <IconButton icon="star" label="Favorite" size="sm" pressed={pressed} onclick={() => (pressed = !pressed)} />
  <IconButton icon="x" label="Disabled" disabled />
  <IconButton icon="home" label="Home link" href="#forms" />
</div>

<h2>TextField</h2>
<form class="stack" onsubmit={(e) => { e.preventDefault(); submitted = name; }}>
  <TextField label="Routine name" bind:value={name} required placeholder="Push day" hint="Shown in your routine list." />
  <TextField label="With error" value="" error="Name is required." />
  <TextField label="Notes" bind:value={notes} multiline />
  <TextField label="Mono" value={'{"a": 1}'} multiline mono />
  <TextField label="Search" type="search" value="" enterkeyhint="search" />
  <TextField label="Disabled" value="Locked" disabled />
  <Button type="submit" variant="primary">Submit</Button>
  {#if submitted}<p role="status">Submitted “{submitted}”.</p>{/if}
</form>

<h2>NumberField</h2>
<div class="stack">
  <NumberField label="Weight" bind:value={weight} suffix="kg" onchange={(n) => (changes = [...changes, n])} />
  <NumberField label="Reps" bind:value={reps} mode="integer" placeholder="8" enterkeyhint="next" hint="Whole numbers only." />
  <NumberField label="Rest" bind:value={rest} mode="integer" suffix="s" max={600} />
  <NumberField label="Hidden label (set row)" labelVisible={false} value={60} placeholder="60" />
  <NumberField label="With error" value={null} error="Enter a weight." />
  <NumberField label="Disabled" value={40} disabled suffix="kg" />
  <p class="muted tabular">value: {weight ?? "empty"} · changes: {changes.join(", ") || "none"}</p>
</div>

<h2>Select</h2>
<div class="stack">
  <Select label="Default rest" bind:value={select} options={restOptions} hint="Between sets." />
  <Select label="With error" value="60" options={restOptions} error="Pick a valid value." />
  <Select label="Disabled" value="60" options={restOptions} disabled />
</div>

<h2>Switch</h2>
<div class="stack">
  <Switch label="Keep screen awake" bind:checked={on} description="While a workout is active." />
  <Switch label="Reminders" checked={false} />
  <Switch label="Disabled" checked disabled />
  <p class="muted">on: {on}</p>
</div>

<h2>SegmentedControl</h2>
<div class="stack">
  <SegmentedControl legend="Units" legendVisible bind:value={unit} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
  <SegmentedControl legend="Theme" legendVisible bind:value={theme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
  <SegmentedControl legend="Long labels" legendVisible value="a" options={[{ value: "a", label: "A very long label indeed" }, { value: "b", label: "Another long label here" }, { value: "c", label: "Third long label" }]} />
  <p class="muted">unit: {unit} · theme: {theme}</p>
</div>

<style>
  .muted { color: var(--color-text-muted); font-size: var(--text-sm); }
  h2 { margin-block: var(--space-8) var(--space-3); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-block-end: var(--space-3); }
  .stack { display: grid; gap: var(--space-4); max-inline-size: 28rem; }
</style>
