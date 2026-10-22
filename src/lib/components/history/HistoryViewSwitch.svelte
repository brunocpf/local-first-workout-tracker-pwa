<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";

  let { current }: { current: "list" | "calendar" } = $props();

  const routes = { list: "/history", calendar: "/history/calendar" } as const;
  // Selected right away, not when the navigation lands: a page transition keeps this page on screen a moment longer.
  let chosen = $derived(current);
</script>

<div class="switch">
  <SegmentedControl
    legend={t("history.view")}
    bind:value={() => chosen, (v) => {
      chosen = v === "calendar" ? "calendar" : "list";
      goto(resolve(routes[chosen]), { replaceState: true });
    }}
    options={[
      { value: "list", label: t("history.list"), icon: "list" },
      { value: "calendar", label: t("history.calendar"), icon: "calendar" },
    ]}
  />
</div>

<style>
  .switch {
    padding-block: var(--space-3);
  }
</style>
