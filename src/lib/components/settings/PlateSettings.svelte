<script lang="ts">
  // Bar weight and plate inventory for the plate calculator. The inventory is kept per plate system (kg / lb) and
  // edited for the current display unit; a count of 0 means the plate isn't owned.
  import Button from "#lib/components/ui/Button.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import { settings, updateSettings } from "#lib/settings.svelte";
  import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";
  import { displayWeight, toKg } from "#lib/units";
  import type { PlateInventory, PlateStock } from "#lib/types";

  let { onerror }: { onerror?: () => void } = $props();

  const unit = $derived(settings.weightUnit);
  const inventory = $derived<PlateInventory>(settings.plateInventory ?? DEFAULT_PLATE_INVENTORY);
  const stock = $derived([...inventory[unit]].sort((a, b) => b.weight - a.weight));
  let newPlate = $state<number | null>(null);

  async function save(patch: Parameters<typeof updateSettings>[0]) {
    try {
      await updateSettings(patch);
    } catch {
      onerror?.();
    }
  }
  const saveStock = (next: PlateStock[]) => save({ plateInventory: { ...inventory, [unit]: next } });

  const setCount = (weight: number, count: number) =>
    saveStock(inventory[unit].map((p) => (p.weight === weight ? { ...p, count } : p)));

  function addPlate() {
    if (newPlate === null || newPlate <= 0) return;
    const weight = newPlate;
    newPlate = null;
    const exists = inventory[unit].some((p) => p.weight === weight);
    return saveStock(exists ? inventory[unit] : [...inventory[unit], { weight, count: 2 }]);
  }
</script>

<div class="stack">
  <NumberField
    label="Bar weight"
    suffix={unit}
    min={0}
    max={100}
    value={displayWeight(settings.barWeightKg ?? DEFAULT_BAR_KG, unit)}
    onchange={(n) => n !== null && save({ barWeightKg: toKg(n, unit) })}
  />
  <fieldset>
    <legend>Plates per side ({unit})</legend>
    <ul>
      {#each stock as p (p.weight)}
        <li>
          <NumberField
            label="{p.weight} {unit} plates per side"
            mode="integer"
            min={0}
            max={100}
            value={p.count}
            onchange={(n) => n !== null && setCount(p.weight, n)}
          />
        </li>
      {/each}
    </ul>
  </fieldset>
  <div class="add">
    <NumberField label="Add a plate size, {unit}" suffix={unit} min={0} max={1000} bind:value={newPlate} />
    <Button onclick={addPlate} disabled={newPlate === null || newPlate <= 0}>Add plate</Button>
  </div>
  <Button
    variant="ghost"
    onclick={() => save({ barWeightKg: DEFAULT_BAR_KG, plateInventory: DEFAULT_PLATE_INVENTORY })}
  >Reset to defaults</Button>
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: var(--space-4); min-inline-size: 0; }
  fieldset { margin: 0; padding: 0; border: 0; min-inline-size: 0; }
  legend { padding: 0; margin-block-end: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-3); }
  .add { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2); }
  .add :global(.field) { flex: 1 1 10rem; min-inline-size: 0; }
</style>
