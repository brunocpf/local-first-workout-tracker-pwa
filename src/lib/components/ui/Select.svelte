<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    label,
    value = $bindable(""),
    options,
    hint,
    error,
    disabled = false,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    hint?: string;
    error?: string;
    disabled?: boolean;
  } = $props();

  const uid = $props.id();
  const selectId = `${uid}-select`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy = $derived([hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined);
</script>

<div class="field" class:invalid={!!error}>
  <label for={selectId}>{label}</label>
  {#if hint}<p class="hint" id={hintId}>{hint}</p>{/if}
  <div class="wrap">
    <select id={selectId} bind:value {disabled} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy}>
      {#each options as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
    <span class="chevron" aria-hidden="true"><Icon name="chevron-down" size={20} /></span>
  </div>
  {#if error}
    <p class="error" id={errorId}><Icon name="alert-triangle" size="1.25em" /><span>{error}</span></p>
  {/if}
</div>

<style>
  .field { display: grid; gap: var(--space-1); }
  label { font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); }
  .hint { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-text-muted); }
  .wrap { position: relative; display: grid; }
  select {
    appearance: none;
    inline-size: 100%;
    min-block-size: var(--control-h);
    padding: var(--space-2) calc(var(--space-3) + 1.5rem) var(--space-2) var(--space-3);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    color: var(--color-text);
    font: inherit;
    font-size: max(1rem, 16px);
    cursor: pointer;
  }
  select:focus-visible { border-color: var(--color-accent); }
  select:user-invalid, .invalid select { border-color: var(--color-danger); }
  select:disabled { color: var(--color-text-disabled); border-color: var(--color-border); cursor: not-allowed; }
  .chevron { position: absolute; inset-block: 0; inset-inline-end: var(--space-3); display: flex; align-items: center; pointer-events: none; color: var(--color-text-muted); }
  .error { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-danger-text); }
  @media (forced-colors: active) { select { border-color: ButtonText; } .chevron { color: ButtonText; } }
</style>
