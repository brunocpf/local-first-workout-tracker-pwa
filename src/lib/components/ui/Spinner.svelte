<script lang="ts">
  import Icon from "./Icon.svelte";

  let { label = "Loading", size = "1em" }: { label?: string; size?: string } = $props();
</script>

<span class="spinner">
  <span class="ring" style:inline-size={size} style:block-size={size} aria-hidden="true"></span>
  <span class="still" aria-hidden="true"><Icon name="timer" {size} /></span>
  <span class="label">{label}</span>
</span>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ring {
    display: inline-block;
    box-sizing: border-box;
    border: 2px solid var(--color-border-strong);
    border-block-start-color: var(--color-accent);
    border-radius: var(--radius-full);
    animation: spin 800ms linear infinite;
  }
  .still {
    display: none;
    color: var(--color-text-muted);
  }
  .label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      display: none;
    }
    .still {
      display: inline-flex;
    }
    .label {
      position: static;
      inline-size: auto;
      block-size: auto;
      overflow: visible;
      clip-path: none;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
  }
</style>
