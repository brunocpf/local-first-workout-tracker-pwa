<script lang="ts">
  import type { IconName } from "#lib/icons";
  import Icon from "./Icon.svelte";

  let {
    icon,
    label,
    variant = "ghost",
    size = "md",
    pressed,
    disabled = false,
    href,
    onclick,
  }: {
    icon: IconName;
    label: string;
    variant?: "ghost" | "secondary" | "primary" | "danger";
    size?: "sm" | "md";
    pressed?: boolean;
    disabled?: boolean;
    href?: string;
    onclick?: (event: MouseEvent) => void;
  } = $props();
</script>

{#if href !== undefined}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass already-resolved hrefs -->
  <a
    class="ib {variant} {size}"
    href={disabled ? undefined : href}
    role={disabled ? "link" : undefined}
    aria-disabled={disabled || undefined}
    aria-label={label}
    {onclick}
  >
    <Icon name={icon} size={24} />
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button class="ib {variant} {size}" type="button" {disabled} aria-label={label} aria-pressed={pressed} {onclick}>
    <Icon name={icon} size={24} />
  </button>
{/if}

<style>
  .ib {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    padding: 0;
    border: var(--border-w) solid transparent;
    border-radius: var(--radius-md);
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .sm { inline-size: 2.25rem; block-size: 2.25rem; }
  .sm::after { content: ""; position: absolute; inset: 50% auto auto 50%; inline-size: var(--tap-min); block-size: var(--tap-min); transform: translate(-50%, -50%); }

  .ghost { background: transparent; color: var(--color-accent-text); }
  .ghost:hover { background: var(--color-surface-2); }
  .ghost:active { background: var(--color-surface-3); }
  .secondary { background: var(--color-surface-2); color: var(--color-text); border-color: var(--color-border-strong); }
  .secondary:hover, .secondary:active { background: var(--color-surface-3); }
  .primary { background: var(--color-accent); color: var(--color-on-accent); }
  .primary:hover { background: var(--color-accent-hover); }
  .primary:active { background: var(--color-accent-active); }
  .danger { background: var(--color-danger); color: var(--color-on-danger); }
  .danger:hover, .danger:active { background: var(--color-danger-hover); }

  /* Pressed state: filled background plus an inset edge, not only a color change. */
  .ib[aria-pressed="true"] { background: var(--color-accent-subtle); color: var(--color-accent-text); border-color: var(--color-accent); }

  .ib:disabled, .ib[aria-disabled="true"] { color: var(--color-text-disabled); background: transparent; border-color: transparent; cursor: not-allowed; }
  @media (forced-colors: active) {
    .ib { border-color: ButtonText; }
    .ib:disabled, .ib[aria-disabled="true"] { border-color: GrayText; color: GrayText; }
  }
</style>
