<script lang="ts">
  let {
    label,
    checked = $bindable(false),
    description,
    disabled = false,
  }: { label: string; checked: boolean; description?: string; disabled?: boolean } = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
</script>

<label class="row" class:disabled>
  <span class="text">
    <span class="title" id={titleId}>{label}</span>
    {#if description}<span class="desc" id={descId}>{description}</span>{/if}
  </span>
  <!-- `switch` is a progressive enhancement (Safari); role="switch" and our own styles apply everywhere. -->
  <input type="checkbox" role="switch" bind:checked {disabled} aria-labelledby={titleId} aria-describedby={description ? descId : undefined} {...{ switch: true }} />
</label>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-block-size: var(--tap-min); cursor: pointer; }
  .row.disabled { cursor: not-allowed; }
  .text { display: grid; }
  .title { font-size: var(--text-md); line-height: var(--leading-md); }
  .desc { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-text-muted); }
  .disabled .title, .disabled .desc { color: var(--color-text-disabled); }
  input {
    appearance: none;
    flex: none;
    position: relative;
    margin: 0;
    inline-size: 44px;
    block-size: 26px;
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-full);
    background: var(--color-surface-2);
    cursor: inherit;
  }
  input::before {
    content: "";
    position: absolute;
    inset-block: 3px;
    inset-inline-start: 3px;
    inline-size: 18px;
    border-radius: var(--radius-full);
    background: var(--color-text-muted);
    transition: inset-inline-start var(--duration-fast) var(--ease-standard);
  }
  input:checked { background: var(--color-accent); border-color: var(--color-accent); }
  input:checked::before { inset-inline-start: calc(100% - 3px - 18px); background: var(--color-on-accent); }
  input:disabled { border-color: var(--color-border); opacity: 0.6; }
  @media (prefers-reduced-motion: reduce) { input::before { transition: none; } }
  @media (forced-colors: active) {
    input { border-color: ButtonText; }
    input:checked::before { background: Highlight; }
  }
</style>
