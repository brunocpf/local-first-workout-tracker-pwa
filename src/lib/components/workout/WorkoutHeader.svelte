<script lang="ts">
  import { t } from "#lib/i18n.svelte";
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
    back={{ href: resolve("/"), label: t("header.back") }}
  >
    {#snippet actions()}
      <IconButton icon="edit" label={t("header.rename")} onclick={openRename} />
      <Button variant="primary" size="sm" loading={finishing} onclick={finish}>{t("header.finish")}</Button>
      <IconButton icon="more-vertical" label={t("header.options")} onclick={() => (menuOpen = true)} />
    {/snippet}
  </PageHeader>

  <Sheet bind:open={menuOpen} title={t("header.options")}>
    <Button
      variant="danger"
      block
      onclick={() => {
        menuOpen = false;
        void ondiscard();
      }}>{t("header.discard")}</Button
    >
  </Sheet>

  <Dialog bind:open={renameOpen} title={t("header.renameTitle")}>
    <form id="rename-workout" onsubmit={saveName}>
      <TextField label={t("header.nameLabel")} bind:value={draft} required enterkeyhint="done" />
    </form>
    {#snippet actions()}
      <Button variant="ghost" onclick={() => (renameOpen = false)}>{t("common.cancel")}</Button>
      <Button variant="primary" onclick={() => saveName()}>{t("common.save")}</Button>
    {/snippet}
  </Dialog>
{/if}
