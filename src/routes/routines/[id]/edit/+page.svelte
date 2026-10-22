<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import RoutineEditor from "#lib/components/routines/RoutineEditor.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import { getRoutine } from "#lib/storage/routines";
  import type { Routine } from "#lib/types";

  let routine = $state<Routine>();
  let loaded = $state(false);
  let failed = $state(false);
  const back = { href: resolve("/routines"), label: t("rt.title") };

  onMount(async () => {
    try {
      routine = await getRoutine(page.params.id ?? "");
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });
</script>

{#if failed}
  <PageHeader title={t("rt.editTitle")} {back} />
  <EmptyState icon="alert-triangle" title={t("rt.detail.loadFailed")} body={t("history.reloadHint")} />
{:else if !loaded}
  <PageHeader title={t("rt.editTitle")} {back} />
{:else if !routine}
  <PageHeader title={t("rt.editTitle")} {back} />
  <EmptyState icon="list" title={t("rt.detail.notFound")} body={t("rt.detail.notFoundBody")}>
    {#snippet action()}<Button variant="primary" href={resolve("/routines")}>{t("rt.detail.backTo")}</Button>{/snippet}
  </EmptyState>
{:else}
  <RoutineEditor initial={routine} />
{/if}
