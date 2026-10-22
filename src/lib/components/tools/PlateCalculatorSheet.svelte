<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  // Plate calculator (design.md §7). Shows what to load on each side of the bar for a target weight, in the display
  // unit's plate system. Pure maths lives in `#lib/tools/plates`; this only renders it.
  import { untrack } from "svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import { formatNumber } from "#lib/numberInput";
  import { platesPerSide } from "#lib/tools/plates";
  import { displayWeight, toKg } from "#lib/units";
  import type { PlateInventory, WeightUnit } from "#lib/types";

  let {
    open = $bindable(false),
    targetKg,
    unit,
    barKg,
    inventory,
  }: {
    open?: boolean;
    /** Weight the sheet starts with, in kg (stored units). */
    targetKg?: number;
    unit: WeightUnit;
    /** Empty bar, in kg. */
    barKg: number;
    inventory: PlateInventory;
  } = $props();

  // Display-unit value of the field; seeded each time the sheet opens, then owned by the user.
  let value = $state<number | null>(null);
  $effect(() => {
    if (open) value = untrack(() => (targetKg === undefined ? null : displayWeight(targetKg, unit)));
  });

  const result = $derived(value === null ? undefined : platesPerSide(toKg(value, unit), unit, barKg, inventory));
  const heaviest = $derived(Math.max(1, ...inventory[unit].map((p) => p.weight)));
  const fmt = (n: number) => formatNumber(n);
  const barShown = $derived(displayWeight(barKg, unit));
  /** Plates drawn one by one, heaviest next to the bar. */
  const stack = $derived((result?.perSide ?? []).flatMap((p) => Array.from({ length: p.count }, () => p.weight)));
  const summary = $derived(
    result?.perSide.length ? result.perSide.map((p) => `${p.count} × ${fmt(p.weight)}`).join(", ") : t("pc.noPlates"),
  );
</script>

<Sheet bind:open title={t("pc.title")} description={t("pc.desc")}>
  <div class="calc">
    <NumberField
      label={t("pc.target", { unit })}
      suffix={unit}
      value={value}
      onchange={(n) => (value = n)}
    />
    <p class="bar">{t("pc.barLine", { weight: fmt(barShown), unit })}</p>

    {#if result}
      <div class="stack" role="img" aria-label={t("pc.each", { summary })}>
        <span class="bar-end" aria-hidden="true"></span>
        {#each stack as weight, i (i)}
          <span class="plate" aria-hidden="true" style:block-size="{2 + (weight / heaviest) * 4}rem"></span>
        {/each}
      </div>
      <p class="line" data-testid="plate-summary">{summary} <span class="muted">{t("pc.perSideSuffix")}</span></p>
      <p class="muted">
        {#if result.remainder < 0}
          {t("pc.below", { bar: fmt(barShown), unit })}
        {:else if result.remainder === 0}
          {t("pc.exact", { value: fmt(result.achieved), unit })}
        {:else}
          {t("pc.closest", { value: fmt(result.achieved), short: fmt(result.remainder), unit })}
        {/if}
      </p>
    {:else}
      <p class="muted">{t("pc.enter")}</p>
    {/if}
  </div>
</Sheet>

<style>
  .calc { display: flex; flex-direction: column; gap: var(--space-3); min-inline-size: 0; }
  p { margin: 0; overflow-wrap: anywhere; }
  .bar, .muted { font-size: var(--text-sm); color: var(--color-text-muted); }
  .line { font-size: var(--text-md); font-weight: var(--weight-semibold); }
  .line .muted { font-weight: var(--weight-regular); }
  .stack {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 6rem;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    overflow: hidden;
  }
  .bar-end {
    flex: none;
    inline-size: 1.5rem;
    block-size: 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-border-strong);
  }
  .plate {
    flex: none;
    inline-size: 0.75rem;
    min-inline-size: 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
  }
  @media (forced-colors: active) {
    .plate, .bar-end { background: CanvasText; }
  }
</style>
