<script module lang="ts">
  import type { ExerciseType } from "#lib/types";

  export type ExerciseValues = {
    name: string;
    aliases: string[];
    exerciseType: ExerciseType;
    equipment: string[];
    primaryMuscles: string[];
    secondaryMuscles: string[];
    isUnilateral: boolean;
  };
</script>

<script lang="ts">
  import { untrack } from "svelte";
  // Create/edit form for custom exercises (PRD §6.4). Emits plain values; the caller persists them.
  import { EQUIPMENT, MUSCLES } from "#lib/catalog/vocab";
  import { equipmentLabel, exerciseTypeLabel, muscleLabel } from "#lib/catalog/labels";
  import { t } from "#lib/i18n.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  const TYPES = $derived((["weighted_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance"] as const).map((value) => ({ value, label: exerciseTypeLabel(value) })));

  let {
    initial,
    submitLabel,
    onsubmit,
    oncancel,
  }: {
    initial?: Partial<ExerciseValues>;
    submitLabel?: string;
    onsubmit: (values: ExerciseValues) => void | Promise<void>;
    oncancel?: () => void;
  } = $props();

  // The form is seeded once; the caller remounts it for a different exercise.
  const seed = untrack(() => initial);
  let name = $state(seed?.name ?? "");
  let aliasText = $state((seed?.aliases ?? []).join(", "));
  let exerciseType = $state<string>(seed?.exerciseType ?? "weighted_reps");
  let equipment = $state<string[]>([...(seed?.equipment ?? [])]);
  let primary = $state<string[]>([...(seed?.primaryMuscles ?? [])]);
  let secondary = $state<string[]>([...(seed?.secondaryMuscles ?? [])]);
  let isUnilateral = $state(seed?.isUnilateral ?? false);
  let saving = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving || name.trim() === "") return;
    saving = true;
    try {
      await onsubmit({
        name: name.trim(),
        aliases: aliasText.split(",").map((a) => a.trim()).filter(Boolean),
        exerciseType: exerciseType as ExerciseType,
        equipment: [...equipment],
        primaryMuscles: [...primary],
        // A muscle is either primary or secondary.
        secondaryMuscles: secondary.filter((m) => !primary.includes(m)),
        isUnilateral,
      });
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={submit}>
  <TextField label={t("form.name")} bind:value={name} required autocomplete="off" enterkeyhint="next" />
  <TextField label={t("form.aliases")} bind:value={aliasText} hint={t("form.aliasesHint")} autocomplete="off" />
  <Select label={t("form.type")} bind:value={exerciseType} options={TYPES} />

  <fieldset>
    <legend>{t("form.equipment")}</legend>
    <div class="chips">
      {#each EQUIPMENT as id (id)}
        <label class="chip"><input type="checkbox" value={id} bind:group={equipment} /><span>{equipmentLabel(id)}</span></label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>{t("form.primary")}</legend>
    <div class="chips">
      {#each MUSCLES as id (id)}
        <label class="chip"><input type="checkbox" value={id} bind:group={primary} /><span>{muscleLabel(id)}</span></label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>{t("form.secondary")}</legend>
    <div class="chips">
      {#each MUSCLES as id (id)}
        <label class="chip"><input type="checkbox" value={id} bind:group={secondary} /><span>{muscleLabel(id)}</span></label>
      {/each}
    </div>
  </fieldset>

  <Switch label={t("form.unilateral")} description={t("form.unilateralDesc")} bind:checked={isUnilateral} />

  <div class="actions">
    <Button type="submit" variant="primary" block loading={saving} disabled={name.trim() === ""}>{submitLabel ?? t("common.save")}</Button>
    {#if oncancel}<Button variant="ghost" block disabled={saving} onclick={oncancel}>{t("common.cancel")}</Button>{/if}
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
  }
  legend {
    padding: 0;
    margin-block-end: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chip {
    position: relative;
    display: inline-flex;
  }
  .chip input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .chip span {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    padding-inline: var(--space-4);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-full);
    background: var(--color-surface-1);
    font-size: var(--text-sm);
  }
  .chip input:checked + span {
    background: var(--color-accent-subtle);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
    font-weight: var(--weight-semibold);
  }
  .chip input:checked + span::before {
    content: "✓";
    margin-inline-end: var(--space-1);
  }
  .chip input:focus-visible + span {
    outline: var(--focus-w) solid var(--color-focus);
    outline-offset: var(--focus-offset);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
