<script lang="ts">
  import type { MessageKey } from "#lib/messages";
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { active } from "#lib/logger/activeSession.svelte";
  import {
    canPromptInstall,
    captureInstallPrompt,
    detectPlatform,
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
  <Banner variant="info" title={t("install.title")} {dismissible} ondismiss={rememberDismissed}>
    <ol>
      {#each [1, 2, 3] as n (n)}
        <li>{t(`install.${platform}.${n}` as MessageKey)}</li>
      {/each}
    </ol>
    {#if platform === "ios"}<p>{t("install.iosNote")}</p>{/if}
    {#if nativePrompt}
      <Button onclick={promptInstall}>{t("common.install")}</Button>
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
