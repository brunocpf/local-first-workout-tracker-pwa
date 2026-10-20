<script lang="ts">
  // The single confirm() host, mounted once in +layout.svelte (design.md §6.10).
  import { confirmQueue, settleConfirm } from "#lib/ui/confirm.svelte";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";

  const request = $derived(confirmQueue[0]);
  let open = $state(false);
  let confirmed = false;
  let shownId = 0;
  let secondaryBusy = $state(false);

  // Open once per request; the next queued one opens after the previous dialog has closed and settled.
  $effect(() => {
    if (request && request.id !== shownId && !open) {
      shownId = request.id;
      confirmed = false;
      open = true;
    }
  });

  function focusInitial(dialog: HTMLDialogElement) {
    // Danger → Cancel first, so Enter doesn't destroy data; otherwise the confirm button.
    const buttons = dialog.querySelectorAll<HTMLButtonElement>(".actions button");
    buttons[request?.danger ? buttons.length - 2 : buttons.length - 1]?.focus();
  }

  function close(result: boolean) {
    confirmed = result;
    open = false;
  }

  async function runSecondary() {
    if (!request?.secondaryAction || secondaryBusy) return;
    secondaryBusy = true;
    try {
      await request.secondaryAction.run();
    } finally {
      secondaryBusy = false;
    }
  }
</script>

<Dialog
  bind:open
  title={request?.title ?? ""}
  onopen={focusInitial}
  onclose={() => {
    secondaryBusy = false;
    settleConfirm(confirmed);
  }}
>
  {#if request}<p class="body">{request.body}</p>{/if}
  {#snippet actions()}
    {#if request?.secondaryAction}
      <span class="secondary">
        <Button variant="ghost" loading={secondaryBusy} onclick={runSecondary}>{request.secondaryAction.label}</Button>
      </span>
    {/if}
    <Button onclick={() => close(false)}>{request?.cancelLabel ?? "Cancel"}</Button>
    <Button variant={request?.danger ? "danger" : "primary"} onclick={() => close(true)}>
      {request?.confirmLabel ?? ""}
    </Button>
  {/snippet}
</Dialog>

<style>
  .body {
    margin: 0;
    white-space: pre-line;
  }
  .secondary {
    display: flex;
    margin-inline-end: auto;
  }
  @media (width < 24em) {
    .secondary > :global(*) {
      inline-size: 100%;
    }
  }
</style>
