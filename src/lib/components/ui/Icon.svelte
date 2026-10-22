<script lang="ts">
  import { icons, type IconName } from "#lib/icons";

  let { name, size = "1em", label }: { name: IconName; size?: string | number; label?: string } = $props();

  const dimension = $derived(typeof size === "number" ? `${size}px` : size);
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  width={dimension}
  height={dimension}
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
  focusable="false"
>
  {#each icons[name] as { tag, ...attrs }, i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>

<style>
  svg {
    flex: none;
    vertical-align: -0.125em;
  }
</style>
