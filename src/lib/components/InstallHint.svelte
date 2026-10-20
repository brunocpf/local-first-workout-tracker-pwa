<script lang="ts">
  import { onMount } from "svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { active } from "#lib/logger/activeSession.svelte";
  import {
    canPromptInstall,
    captureInstallPrompt,
    detectPlatform,
    INSTALL_STEPS,
    IOS_STORAGE_NOTE,
    isDismissed,
    isStandalone,
    promptInstall,
    rememberDismissed,
    type InstallPlatform,
  } from "#lib/pwa/install";

  let { dismissible = true }: { dismissible?: boolean } = $props();

  let ready = $state(false);
  let standalone = $state(false);
  let dismissed = $state(false);
  let platform = $state<InstallPlatform>("desktop");
  let nativePrompt = $state(false);

  onMount(() => {
    standalone = isStandalone();
    platform = detectPlatform();
    dismissed = isDismissed();
    captureInstallPrompt();
    window.addEventListener("beforeinstallprompt", () => (nativePrompt = canPromptInstall()));
    ready = true;
  });

  const visible = $derived(ready && !standalone && !(dismissible && dismissed) && !active.isActive);
</script>

{#if visible}
  <Banner variant="info" title="Install the app" {dismissible} ondismiss={rememberDismissed}>
    <ol>
      {#each INSTALL_STEPS[platform] as step (step)}
        <li>{step}</li>
      {/each}
    </ol>
    {#if platform === "ios"}<p>{IOS_STORAGE_NOTE}</p>{/if}
    {#if nativePrompt}
      <Button onclick={promptInstall}>Install</Button>
    {/if}
  </Banner>
{/if}

<style>
  ol {
    margin: 0;
    padding-inline-start: var(--space-5);
  }
  p {
    margin: var(--space-2) 0 0;
  }
</style>
