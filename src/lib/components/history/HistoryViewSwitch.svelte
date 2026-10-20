<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";

  let { current }: { current: "list" | "calendar" } = $props();

  const routes = { list: "/history", calendar: "/history/calendar" } as const;
</script>

<div class="switch">
  <SegmentedControl
    legend="History view"
    bind:value={() => current, (v) => goto(resolve(routes[v === "calendar" ? "calendar" : "list"]), { replaceState: true })}
    options={[
      { value: "list", label: "List", icon: "list" },
      { value: "calendar", label: "Calendar", icon: "calendar" },
    ]}
  />
</div>

<style>
  .switch {
    padding-block: var(--space-3);
  }
</style>
