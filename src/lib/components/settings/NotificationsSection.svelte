<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  // Opt-in rest-timer notifications through the optional push relay (ADR 0014). The subscription is stored
  // locally only; the `restNotifications` flag is the one thing that reaches a backup.
  import { onMount } from "svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import {
    disablePush,
    enablePush,
    hasSubscription,
    notificationPermission,
    pushSupport,
    sendTestPush,
    type PushSupport,
  } from "#lib/push";
  import { detectPlatform, type InstallPlatform } from "#lib/pwa/install";
  import { settings, updateSettings } from "#lib/settings.svelte";

  let support = $state<PushSupport>("unsupported");
  let platform = $state<InstallPlatform>("desktop");
  let permission = $state<ReturnType<typeof notificationPermission>>(null);
  let subscribed = $state<boolean>(false);
  let busy = $state(false);
  let message = $state<{ variant: "success" | "warning" | "danger"; text: string }>();

  onMount(refresh);

  function refresh() {
    support = pushSupport();
    platform = detectPlatform();
    permission = notificationPermission();
    subscribed = hasSubscription();
  }

  const on = $derived(settings.restNotifications === true && subscribed);
  // Local mirror of the switch so a refused request visibly flips it back.
  let checked = $derived<boolean>(on);

  async function toggle(next: boolean) {
    checked = next;
    message = undefined;
    busy = true;
    try {
      if (!next) {
        await disablePush();
        await updateSettings({ restNotifications: false });
      } else {
        // Must run straight from the click: browsers (iOS especially) only prompt from a user gesture.
        const result = await enablePush();
        if (result === "enabled") await updateSettings({ restNotifications: true });
        else {
          await updateSettings({ restNotifications: false });
          message =
            result === "denied"
              ? { variant: "warning", text: t("nt.denied") }
              : { variant: "danger", text: t("nt.enableFailed") };
        }
      }
    } finally {
      busy = false;
      refresh();
      checked = settings.restNotifications === true && hasSubscription();
    }
  }

  async function test() {
    message = undefined;
    busy = true;
    const ok = await sendTestPush();
    busy = false;
    message = ok
      ? { variant: "success", text: t("nt.testSent") }
      : { variant: "danger", text: t("nt.testFailed") };
  }

  const status = $derived(
    support === "needs-install"
      ? t("nt.needsInstall")
      : on
        ? t("nt.on")
        : permission === "denied"
          ? t("nt.blocked")
          : t("nt.off"),
  );
</script>

<div class="stack">
  <p class="note">
    {t("nt.intro")} {t(`nt.${platform}`)}
    {t("nt.relay")}
  </p>

  {#if support === "unsupported" || support === "unconfigured"}
    <Banner variant="info">{t("nt.unsupported")}</Banner>
  {:else if support === "needs-install"}
    <Banner variant="warning" title={t("nt.installFirst")}>
      {t("nt.installBody")}
    </Banner>
  {:else}
    <Switch
      label={t("nt.switch")}
      description={t("nt.status", { status })}
      disabled={busy}
      bind:checked={() => checked, toggle}
    />
    {#if on}
      <Button onclick={test} loading={busy}>{t("nt.sendTest")}</Button>
    {/if}
  {/if}

  {#if message}
    <Banner variant={message.variant}>{message.text}</Banner>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: var(--space-4);
  }
  .note {
    margin: 0;
    color: var(--color-text-muted);
  }
</style>
