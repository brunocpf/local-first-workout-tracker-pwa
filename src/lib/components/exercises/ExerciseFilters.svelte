<script lang="ts">
  // Muscle / equipment / type selects and a favorites switch; the owner passes the bound values to `searchExercises`.
  import { EQUIPMENT, MUSCLES } from "#lib/catalog/vocab";
  import type { ExerciseFilters } from "#lib/catalog/search";
  import { equipmentLabel, exerciseTypeLabel, muscleLabel } from "#lib/catalog/labels";
  import { t } from "#lib/i18n.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";

  let { filters = $bindable({}) }: { filters?: ExerciseFilters } = $props();

  const withAny = (ids: readonly string[], any: string, label: (id: string) => string) => [
    { value: "", label: any },
    ...ids.map((id) => ({ value: id, label: label(id) })),
  ];
  const TYPES = ["weighted_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance"];

  let muscle = $state(filters.muscle ?? "");
  let equipment = $state(filters.equipment ?? "");
  let exerciseType = $state(filters.exerciseType ?? "");
  let favoritesOnly = $state(filters.favoritesOnly ?? false);

  $effect(() => {
    filters = {
      muscle: muscle || undefined,
      equipment: equipment || undefined,
      exerciseType: exerciseType || undefined,
      favoritesOnly,
    };
  });
</script>

<div class="filters">
  <Select label={t("filter.muscle")} bind:value={muscle} options={withAny(MUSCLES, t("filter.anyMuscle"), muscleLabel)} />
  <Select label={t("filter.equipment")} bind:value={equipment} options={withAny(EQUIPMENT, t("filter.anyEquipment"), equipmentLabel)} />
  <Select label={t("filter.type")} bind:value={exerciseType} options={withAny(TYPES, t("filter.anyType"), exerciseTypeLabel)} />
  <Switch label={t("filter.favorites")} bind:checked={favoritesOnly} />
</div>

<style>
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--space-3);
    align-items: end;
    margin-block-end: var(--space-3);
  }
</style>
