<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { active } from "#lib/logger/activeSession.svelte";
  import { formatElapsed } from "#lib/time";
  import Button from "#lib/components/ui/Button.svelte";
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";

  let { onfinish, ondiscard }: { onfinish: () => void | Promise<void>; ondiscard: () => void | Promise<void> } = $props();

  // Display-only tick; the elapsed time is always derived from `startedAt`.
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const session = $derived(active.session);
  let menuOpen = $state(false);
  let renameOpen = $state(false);
  let draft = $state("");
  let finishing = $state(false);

  function openRename() {
    draft = session?.name ?? "";
    renameOpen = true;
  }

  function saveName(event?: SubmitEvent) {
    event?.preventDefault();
    const name = draft.trim();
    renameOpen = false;
    if (name && name !== session?.name) void active.mutate((s) => (s.name = name), { persist: "now" });
  }

  async function finish() {
    finishing = true;
    try {
      await onfinish();
    } finally {
      finishing = false;
    }
  }
</script>

{#if session}
  <PageHeader
    title={session.name}
    subtitle={formatElapsed(session.startedAt, now)}
    back={{ href: resolve("/"), label: "Home" }}
  >
    {#snippet actions()}
      <IconButton icon="edit" label="Rename workout" onclick={openRename} />
      <Button variant="primary" size="sm" loading={finishing} onclick={finish}>Finish</Button>
      <IconButton icon="more-vertical" label="Workout options" onclick={() => (menuOpen = true)} />
    {/snippet}
  </PageHeader>

  <Sheet bind:open={menuOpen} title="Workout options">
    <Button
      variant="danger"
      block
      onclick={() => {
        menuOpen = false;
        void ondiscard();
      }}>Discard workout…</Button
    >
  </Sheet>

  <Dialog bind:open={renameOpen} title="Rename workout">
    <form id="rename-workout" onsubmit={saveName}>
      <TextField label="Workout name" bind:value={draft} required enterkeyhint="done" />
    </form>
    {#snippet actions()}
      <Button variant="ghost" onclick={() => (renameOpen = false)}>Cancel</Button>
      <Button variant="primary" onclick={() => saveName()}>Save</Button>
    {/snippet}
  </Dialog>
{/if}
