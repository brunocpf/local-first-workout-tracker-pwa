<script lang="ts">
  // Opt-in rest-timer notifications through the optional push relay (ADR 0014). The subscription is stored
  // locally only; the `restNotifications` flag is the one thing that reaches a backup.
  import { onMount } from "svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Switch from "#lib/components/ui/Switch.svelte";
  import { disablePush, enablePush, hasSubscription, notificationPermission, pushSupport, sendTestPush, type PushSupport } from "#lib/push";
  import { settings, updateSettings } from "#lib/settings.svelte";

  let support = $state<PushSupport>("unsupported");
  let permission = $state<ReturnType<typeof notificationPermission>>(null);
  let subscribed = $state<boolean>(false);
  let busy = $state(false);
  let message = $state<{ variant: "success" | "warning" | "danger"; text: string }>();

  onMount(refresh);

  function refresh() {
    support = pushSupport();
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
              ? { variant: "warning", text: "Notifications are blocked. Allow them for this app in your device or browser settings, then try again." }
              : { variant: "danger", text: "Couldn't turn notifications on. Check your connection and try again." };
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
      ? { variant: "success", text: "Test sent. A notification should arrive in a few seconds; lock the screen to check." }
      : { variant: "danger", text: "The notification service couldn't be reached. Rest alerts still work while the app is open." };
  }

  const status = $derived(
    support === "needs-install"
      ? "Needs the installed app"
      : on
        ? "On"
        : permission === "denied"
          ? "Blocked"
          : "Off",
  );
</script>

<div class="stack">
  <p class="note">
    Get a notification when a rest ends even with the screen locked or the app in the background. This works only for the
    installed app (on iPhone and iPad: Share, then Add to Home Screen, then open it from there and turn this on). It uses
    a small relay that is told only when to ping this device, never your workouts.
  </p>

  {#if support === "unconfigured"}
    <Banner variant="info">This copy of the app isn't connected to a notification relay. Rest alerts work while the app is open.</Banner>
  {:else if support === "unsupported"}
    <Banner variant="info">This browser doesn't support push notifications. Rest alerts work while the app is open.</Banner>
  {:else if support === "needs-install"}
    <Banner variant="warning" title="Install the app first">
      On iPhone and iPad, notifications only work after you add this app to the Home Screen and open it from there.
    </Banner>
  {:else}
    <Switch
      label="Rest timer notifications"
      description="Status: {status}"
      disabled={busy}
      bind:checked={() => checked, toggle}
    />
    {#if on}
      <Button onclick={test} loading={busy}>Send test notification</Button>
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
