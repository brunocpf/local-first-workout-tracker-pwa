<script lang="ts">
  // Muscle / equipment / type selects and a favorites switch; the owner passes the bound values to `searchExercises`.
  import { EQUIPMENT, MUSCLES } from "#lib/catalog/vocab";
  import type { ExerciseFilters } from "#lib/catalog/search";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";

  let { filters = $bindable({}) }: { filters?: ExerciseFilters } = $props();

  const pretty = (id: string) => {
    const s = id.replaceAll("_", " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const withAny = (ids: readonly string[], any: string) => [
    { value: "", label: any },
    ...ids.map((id) => ({ value: id, label: pretty(id) })),
  ];
  const TYPES = [
    "weighted_reps",
    "bodyweight_reps",
    "weighted_bodyweight",
    "assisted_bodyweight",
    "duration",
    "distance",
  ];

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
  <Select label="Muscle" bind:value={muscle} options={withAny(MUSCLES, "Any muscle")} />
  <Select label="Equipment" bind:value={equipment} options={withAny(EQUIPMENT, "Any equipment")} />
  <Select label="Type" bind:value={exerciseType} options={withAny(TYPES, "Any type")} />
  <Switch label="Favorites only" bind:checked={favoritesOnly} />
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
