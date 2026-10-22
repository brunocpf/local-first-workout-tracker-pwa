<script lang="ts">
  import { t, tn } from "#lib/i18n.svelte";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import Button from "#lib/components/ui/Button.svelte";
  import { sessionInputFromRoutine } from "#lib/logger/fromRoutine";
  import { active } from "#lib/logger/activeSession.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { ActiveSessionExistsError } from "#lib/storage/sessions";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Routine } from "#lib/types";

  let {
    routine,
    variant = "secondary",
    size = "sm",
    block = false,
    onstart,
    children,
  }: {
    routine: Routine;
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
    block?: boolean;
    /** Called as soon as the button is pressed (e.g. to close a menu). */
    onstart?: () => void;
    children?: Snippet;
  } = $props();

  let busy = $state(false);

  async function start() {
    if (busy) return;
    onstart?.();
    busy = true;
    try {
      if (active.session) {
        const discard = await confirm({
          title: t("rt.progress"),
          body: t("rt.progressBody", { current: active.session.name, next: routine.name }),
          confirmLabel: t("rt.discardStart"),
          cancelLabel: t("rt.resumeCurrent"),
          danger: true,
        });
        if (!discard) return void (await goto(resolve("/workout")));
        await active.discard();
      }
      const exercises = await getExercisesByIds(routine.exercises.map((e) => e.exerciseId));
      const { session, skippedExerciseIds } = sessionInputFromRoutine(routine, new Map(exercises.map((e) => [e.id, e])));
      try {
        await active.start(session);
      } catch (e) {
        // Another tab started one first: adopt it instead of creating a second.
        if (e instanceof ActiveSessionExistsError) await active.load();
        if (!active.session) throw e;
      }
      if (skippedExerciseIds.length > 0) {
        toast(tn("past.skipped", skippedExerciseIds.length));
      }
      await goto(resolve("/workout"));
    } catch {
      toast(t("rt.startFailed"));
    } finally {
      busy = false;
    }
  }
</script>

<Button {variant} {size} {block} loading={busy} onclick={start}>
  {#if children}{@render children()}{:else}{t("rt.startShort")}{/if}
</Button>
