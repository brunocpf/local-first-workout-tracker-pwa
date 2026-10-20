<svelte:head><title>UI overlays · Workouts</title></svelte:head>

<script lang="ts">
  import Button from "#lib/components/ui/Button.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";

  let dialogOpen = $state(false);
  let formOpen = $state(false);
  let sheetOpen = $state(false);
  let fullSheetOpen = $state(false);
  let name = $state("");
  let lastClose = $state("");
  let confirmResult = $state("");
  let sets = $state(["Set 1", "Set 2", "Set 3"]);
  let undoCount = $state(0);

  async function ask(danger: boolean) {
    const ok = await confirm(
      danger
        ? { title: "Discard workout?", body: "12 completed sets will be deleted.", confirmLabel: "Discard workout", danger: true }
        : { title: "Save changes?", body: "The past session will be updated.", confirmLabel: "Save changes" },
    );
    confirmResult = ok ? "confirmed" : "cancelled";
  }

  async function askWithSecondary() {
    const ok = await confirm({
      title: "Replace all data?",
      body: "Restoring replaces every workout, routine and setting on this device.",
      confirmLabel: "Replace all data",
      danger: true,
      secondaryAction: {
        label: "Export a backup first",
        run: () => new Promise<void>((r) => setTimeout(() => (toast("Backup exported"), r()), 800)),
      },
    });
    confirmResult = ok ? "confirmed" : "cancelled";
  }

  function deleteSet() {
    const i = sets.length - 1;
    if (i < 0) return;
    const [removed] = sets.splice(i, 1);
    toast("Set deleted", {
      action: {
        label: "Undo",
        run: () => {
          undoCount++;
          sets.splice(i, 0, removed);
        },
      },
    });
  }

  let counter = 0;
  const plainToast = () => toast(`Imported ${++counter} routine${counter === 1 ? "" : "s"}`);
</script>

<h1>Overlays</h1>
<p class="muted">Dialog, Sheet, ConfirmDialog and Toast (docs/design.md §6.9–6.12). Development only.</p>

<h2>Dialog</h2>
<div class="row">
  <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
  <Button onclick={() => (formOpen = true)}>Open form dialog</Button>
</div>
<p class="muted" data-testid="last-close">Last closed: {lastClose || "–"}</p>

<Dialog
  bind:open={dialogOpen}
  title="About rest timers"
  description="The timer keeps its end time, so it stays right after the screen locks."
  onclose={() => (lastClose = "dialog")}
>
  <p>Press Esc, tap outside, or use a button to close.</p>
  {#snippet actions()}
    <Button onclick={() => (dialogOpen = false)}>Close</Button>
    <Button variant="primary" onclick={() => (dialogOpen = false)}>Got it</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={formOpen} title="Rename routine" dismissible={false} onclose={() => (lastClose = "form")}>
  <TextField label="Name" bind:value={name} />
  {#snippet actions()}
    <Button onclick={() => (formOpen = false)}>Cancel</Button>
    <Button variant="primary" onclick={() => (formOpen = false)}>Save</Button>
  {/snippet}
</Dialog>

<h2>Sheet</h2>
<div class="row">
  <Button onclick={() => (sheetOpen = true)}>Open action sheet</Button>
  <Button onclick={() => (fullSheetOpen = true)}>Open full sheet</Button>
</div>

<Sheet bind:open={sheetOpen} title="Push day" onclose={() => (lastClose = "sheet")}>
  <ul class="group">
    <li><ListRow title="Edit routine" onclick={() => (sheetOpen = false)} /></li>
    <li><ListRow title="Duplicate" onclick={() => (sheetOpen = false)} /></li>
    <li><ListRow title="Delete routine" danger onclick={() => (sheetOpen = false)} /></li>
  </ul>
</Sheet>

<Sheet bind:open={fullSheetOpen} size="full" title="Add exercise" onclose={() => (lastClose = "full sheet")}>
  <ul class="group">
    {#each Array.from({ length: 30 }, (_, i) => `Exercise ${i + 1}`) as ex (ex)}
      <li><ListRow title={ex} onclick={() => (fullSheetOpen = false)} /></li>
    {/each}
  </ul>
  {#snippet actions()}
    <Button block variant="primary" onclick={() => (fullSheetOpen = false)}>Done</Button>
  {/snippet}
</Sheet>

<h2>Confirm</h2>
<div class="row">
  <Button onclick={() => ask(true)}>Discard workout</Button>
  <Button onclick={() => ask(false)}>Save past session</Button>
  <Button onclick={askWithSecondary}>Restore backup</Button>
</div>
<p class="muted" data-testid="confirm-result">Result: {confirmResult || "–"}</p>

<h2>Toast</h2>
<div class="row">
  <Button onclick={deleteSet}>Delete a set</Button>
  <Button onclick={plainToast}>Show toast</Button>
</div>
<p class="muted" data-testid="sets">Sets: {sets.join(", ") || "none"} · Undo ran {undoCount}×</p>

<h2>Scroll lock</h2>
<p class="muted">This filler makes the page scroll, so you can check it stays put under an open dialog.</p>
{#each Array.from({ length: 40 }, (_, i) => i + 1) as n (n)}
  <p class="filler">Filler line {n}</p>
{/each}

<style>
  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  h2 {
    margin-block: var(--space-8) var(--space-3);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--color-surface-1);
    border: var(--border-w) solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .group li + li {
    border-block-start: var(--border-w) solid var(--color-border);
  }
  .filler {
    color: var(--color-text-muted);
  }
</style>
