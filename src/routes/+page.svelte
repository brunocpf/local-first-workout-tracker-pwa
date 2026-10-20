<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { active } from "#lib/logger/activeSession.svelte";
  import { ActiveSessionExistsError } from "#lib/storage/sessions";
  import { defaultWorkoutName, formatElapsed } from "#lib/time";
  import { toast } from "#lib/ui/toast.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Button from "#lib/components/ui/Button.svelte";

  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  let starting = $state(false);

  async function start() {
    if (active.session) return goto(resolve("/workout"));
    starting = true;
    try {
      await active.start({ name: defaultWorkoutName() });
    } catch (e) {
      // Another tab started one first: adopt it instead of creating a second.
      if (e instanceof ActiveSessionExistsError) await active.load();
      if (!active.session) {
        toast("Couldn't start the workout");
        starting = false;
        return;
      }
    }
    starting = false;
    await goto(resolve("/workout"));
  }
</script>

<PageHeader title="Home" />

{#if active.session}
  <Banner variant="info" title="Workout in progress" action={{ label: "Resume", onclick: () => goto(resolve("/workout")) }}>
    {active.session.name} · {formatElapsed(active.session.startedAt, now)}
  </Banner>
{/if}

<div class="start">
  <Button variant="primary" size="lg" block icon="plus" loading={starting} onclick={start}>
    {active.session ? "Resume workout" : "Start workout"}
  </Button>
</div>

<style>
  .start {
    margin-block: var(--space-4);
  }
</style>
