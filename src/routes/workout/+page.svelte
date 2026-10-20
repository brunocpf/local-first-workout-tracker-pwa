<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { active } from "#lib/logger/activeSession.svelte";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import WorkoutHeader from "#lib/components/workout/WorkoutHeader.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";

  // No active session (never started, or finished/discarded here or in another tab): back to Home.
  let leaving = false;
  $effect(() => {
    if (!active.session && !leaving) void goto(resolve("/"), { replaceState: true });
  });

  async function discard() {
    const s = active.session;
    if (!s) return;
    const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
    const lost =
      s.exercises.length === 0
        ? `“${s.name}” will be deleted.`
        : `“${s.name}” and its ${s.exercises.length} exercise${s.exercises.length === 1 ? "" : "s"} (${sets} set${sets === 1 ? "" : "s"}) will be deleted.`;
    const ok = await confirm({
      title: "Discard workout?",
      body: `${lost} This can't be undone.`,
      confirmLabel: "Discard workout",
      danger: true,
    });
    if (!ok) return;
    leaving = true;
    try {
      await active.discard();
    } catch {
      leaving = false;
      toast("Couldn't discard the workout");
      return;
    }
    toast("Workout discarded");
    await goto(resolve("/"), { replaceState: true });
  }

  async function finish() {
    leaving = true;
    try {
      await active.finish();
    } catch {
      leaving = false;
      toast("Couldn't finish the workout");
      return;
    }
    await goto(resolve("/history"), { replaceState: true });
  }
</script>

{#if active.session}
  <WorkoutHeader onfinish={finish} ondiscard={discard} />
  {#if active.error}
    <Banner variant="danger" title="Changes may not be saved">Your latest edits couldn't be written to this device.</Banner>
  {/if}
{/if}
