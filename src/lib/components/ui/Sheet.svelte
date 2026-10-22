<script lang="ts">
  // Bottom sheet below 48em, centered Dialog above (design.md §6.11). Same API as Dialog plus `size`.
  import type { Snippet } from "svelte";
  import Dialog from "./Dialog.svelte";

  let {
    open = $bindable(false),
    size = "auto",
    ...rest
  }: {
    open?: boolean;
    title: string;
    description?: string;
    dismissible?: boolean;
    size?: "auto" | "full";
    children?: Snippet;
    actions?: Snippet;
    onopen?: (dialog: HTMLDialogElement) => void;
    onclose?: (returnValue: string) => void;
  } = $props();
</script>

<Dialog bind:open variant="sheet" {size} {...rest} />
