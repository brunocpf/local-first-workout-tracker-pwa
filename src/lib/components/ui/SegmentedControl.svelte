<script lang="ts">
  import type { IconName } from "#lib/icons";
  import Icon from "./Icon.svelte";

  let {
    legend,
    legendVisible = false,
    value = $bindable(""),
    options,
  }: {
    legend: string;
    legendVisible?: boolean;
    value: string;
    options: { value: string; label: string; icon?: IconName }[];
  } = $props();

  const name = $props.id();
</script>

<fieldset>
  <legend class:visually-hidden={!legendVisible}>{legend}</legend>
  <div class="seg">
    {#each options as o (o.value)}
      <label class:selected={value === o.value}>
        <input type="radio" {name} value={o.value} bind:group={value} />
        {#if o.icon}<Icon name={o.icon} size="1.25em" />{/if}
        <span class="text">{o.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset { margin: 0; padding: 0; border: 0; min-inline-size: 0; }
  legend { padding: 0; margin-block-end: var(--space-1); font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); }
  .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .seg { display: flex; gap: 2px; padding: 2px; border: var(--border-w) solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface-2); }
  label {
    position: relative;
    flex: 1 1 0;
    min-inline-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-block-size: calc(var(--tap-min) - 4px);
    padding-inline: var(--space-2);
    border: var(--border-w) solid transparent;
    border-radius: calc(var(--radius-md) - 2px);
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text);
    cursor: pointer;
  }
  .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  label.selected { background: var(--color-accent-subtle); border-color: var(--color-accent); color: var(--color-accent-text); font-weight: var(--weight-semibold); }
  /* Native radio stays focusable and operable, but invisible. */
  input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: inherit; }
  label:has(input:focus-visible) { outline: var(--focus-w) solid var(--color-focus); outline-offset: var(--focus-offset); }
  label:has(input:disabled) { color: var(--color-text-disabled); }
  @media (forced-colors: active) {
    .seg { border-color: ButtonText; }
    label.selected { background: Highlight; color: HighlightText; border-color: ButtonText; }
  }
</style>
