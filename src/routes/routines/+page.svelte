<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import StartRoutineButton from "#lib/components/routines/StartRoutineButton.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import { deleteRoutine, duplicateRoutine, listRoutinesGrouped, type RoutinesGrouped } from "#lib/storage/routines";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Routine } from "#lib/types";

  let grouped = $state<RoutinesGrouped>({ programs: [], standalone: [] });
  let loaded = $state(false);
  let failed = $state(false);
  let menuFor = $state<Routine>();
  let menuOpen = $state(false);

  async function load() {
    try {
      grouped = await listRoutinesGrouped();
      failed = false;
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  }
  onMount(load);

  const isEmpty = $derived(grouped.standalone.length === 0 && grouped.programs.every((p) => p.routines.length === 0));
  const count = (r: Routine) => `${r.exercises.length} ${r.exercises.length === 1 ? "exercise" : "exercises"}`;
  const importHref = resolve("/routines/import");

  function openMenu(r: Routine) {
    menuFor = r;
    menuOpen = true;
  }

  async function duplicate(r: Routine) {
    menuOpen = false;
    try {
      await duplicateRoutine(r.id);
      await load();
    } catch {
      toast("Couldn't duplicate the routine");
    }
  }

  async function remove(r: Routine) {
    menuOpen = false;
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      body: "The routine is removed. Past workouts that used it are not affected.",
      confirmLabel: "Delete routine",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRoutine(r.id);
      await load();
    } catch {
      toast("Couldn't delete the routine");
    }
  }
</script>

{#snippet group(title: string, routines: Routine[])}
  <section>
    <h2>{title}</h2>
    <ul class="group" aria-label={title}>
      {#each routines as r (r.id)}
        <li>
          <div class="item">
            <div class="link"><ListRow title={r.name} subtitle={count(r)} href={resolve(`/routines/${r.id}` as "/")} /></div>
            <div class="actions">
              <StartRoutineButton routine={r} />
              <IconButton icon="more-vertical" label={`Options for ${r.name}`} onclick={() => openMenu(r)} />
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

<PageHeader title="Routines">
  {#snippet actions()}
    <Button variant="secondary" size="sm" icon="import" href={importHref}>Import</Button>
  {/snippet}
</PageHeader>

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load routines" body="Reload the app and try again." />
{:else if loaded}
  {#if isEmpty}
    <EmptyState icon="list" title="No routines yet" body="Import a plan to start from a routine.">
      {#snippet action()}
        <Button variant="primary" icon="import" href={importHref}>Import routine</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#each grouped.programs.filter((p) => p.routines.length > 0) as { program, routines } (program.id)}
      {@render group(program.name, routines)}
    {/each}
    {#if grouped.standalone.length > 0}
      {@render group(grouped.programs.some((p) => p.routines.length > 0) ? "Other routines" : "Routines", grouped.standalone)}
    {/if}
  {/if}
{/if}

<Sheet bind:open={menuOpen} title={menuFor?.name ?? "Routine"}>
  {#if menuFor}
    <div class="menu">
      <StartRoutineButton routine={menuFor} variant="primary" size="md" block onstart={() => (menuOpen = false)} />
      <Button block icon="copy" onclick={() => duplicate(menuFor!)}>Duplicate</Button>
      <Button block variant="danger" icon="trash" onclick={() => remove(menuFor!)}>Delete…</Button>
    </div>
  {/if}
</Sheet>

<style>
  section {
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  li + li {
    border-block-start: var(--border-w) solid var(--color-border);
    margin-inline-start: var(--space-4);
  }
  .item {
    display: flex;
    align-items: center;
  }
  .link {
    flex: 1;
    min-inline-size: 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline-end: var(--space-2);
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
