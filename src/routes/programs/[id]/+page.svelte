<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Select from "#lib/components/ui/Select.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import { WEEKDAYS, scheduleByDay, setProgramSchedule, weekdayLabel, type Weekday } from "#lib/routines/schedule";
  import {
    deleteProgram,
    getProgram,
    listRoutinesGrouped,
    renameProgram,
    reorderProgramRoutines,
    setRoutineProgram,
  } from "#lib/storage/routines";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Program, Routine } from "#lib/types";

  const id = $derived(page.params.id ?? "");
  let program = $state<Program>();
  let members = $state<Routine[]>([]);
  let available = $state<Routine[]>([]);
  let loaded = $state(false);
  let failed = $state(false);
  let name = $state("");
  let nameError = $state<string>();
  let addOpen = $state(false);
  let deleteOpen = $state(false);
  // Weekday -> routine id ("" = rest day); saved with the button so a half-edited week is never written.
  let draft = $state<Record<Weekday, string>>(emptyDraft());
  let savedDraft = $state<Record<Weekday, string>>(emptyDraft());
  const scheduleDirty = $derived(WEEKDAYS.some((d) => draft[d] !== savedDraft[d]));

  function emptyDraft() {
    return Object.fromEntries(WEEKDAYS.map((d) => [d, ""])) as Record<Weekday, string>;
  }
  const backHref = resolve("/routines");
  const count = (r: Routine) => `${r.exercises.length} ${r.exercises.length === 1 ? "exercise" : "exercises"}`;

  async function load() {
    try {
      const found = await getProgram(id);
      if (!found) {
        program = undefined;
        return;
      }
      const grouped = await listRoutinesGrouped();
      program = found;
      name = found.name;
      members = grouped.programs.find((p) => p.program.id === id)?.routines ?? [];
      const assigned = scheduleByDay(found);
      const ids = new Set(members.map((r) => r.id));
      savedDraft = Object.fromEntries(WEEKDAYS.map((d) => [d, assigned[d] && ids.has(assigned[d]) ? assigned[d] : ""])) as Record<
        Weekday,
        string
      >;
      draft = { ...savedDraft };
      // Routines already in another program can be moved here too; show where they are now.
      available = [...grouped.standalone, ...grouped.programs.filter((p) => p.program.id !== id).flatMap((p) => p.routines)];
      failed = false;
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  }
  onMount(load);

  const programNameOf = (r: Routine) => (r.programId ? "In another program" : "Standalone");

  async function saveName() {
    if (!program) return;
    const trimmed = name.trim();
    if (!trimmed) {
      nameError = "Enter a program name.";
      return;
    }
    nameError = undefined;
    if (trimmed === program.name) return;
    try {
      program = await renameProgram(program.id, trimmed);
      name = program.name;
    } catch {
      toast("Couldn't rename the program");
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (!program) return;
    const ids = members.map((r) => r.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      await reorderProgramRoutines(program.id, ids);
    } catch {
      toast("Couldn't reorder the routines");
    }
    await load();
  }

  async function add(r: Routine) {
    if (!program) return;
    try {
      await setRoutineProgram(r.id, program.id);
    } catch {
      toast("Couldn't add the routine");
    }
    await load();
  }

  async function remove(r: Routine) {
    try {
      await setRoutineProgram(r.id, undefined);
    } catch {
      toast("Couldn't remove the routine");
    }
    await load();
  }

  async function saveSchedule() {
    if (!program) return;
    try {
      program = await setProgramSchedule(program.id, draft);
      savedDraft = { ...draft };
      toast("Schedule saved");
    } catch {
      toast("Couldn't save the schedule");
    }
  }

  async function removeProgram(deleteRoutines: boolean) {
    if (!program) return;
    const n = members.length;
    const ok = await confirm(
      deleteRoutines
        ? {
            title: `Delete "${program.name}" and its routines?`,
            body: `The program and its ${n} ${n === 1 ? "routine" : "routines"} are removed. Past workouts are not affected.`,
            confirmLabel: "Delete program and routines",
            danger: true,
          }
        : {
            title: `Delete "${program.name}"?`,
            body: `The program is removed. Its ${n} ${n === 1 ? "routine stays" : "routines stay"} as standalone routines. Past workouts are not affected.`,
            confirmLabel: "Delete program",
            danger: true,
          },
    );
    if (!ok) return;
    try {
      await deleteProgram(program.id, { deleteRoutines });
      deleteOpen = false;
      await goto(backHref);
    } catch {
      toast("Couldn't delete the program");
    }
  }
</script>

<PageHeader title={program?.name ?? "Program"} back={{ href: backHref, label: "Routines" }}>
  {#snippet actions()}
    {#if program}<IconButton icon="trash" label="Delete program" onclick={() => (deleteOpen = true)} />{/if}
  {/snippet}
</PageHeader>

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load the program" body="Reload the app and try again." />
{:else if loaded && !program}
  <EmptyState icon="list" title="Program not found" body="It may have been deleted.">
    {#snippet action()}<Button variant="primary" href={backHref}>Back to routines</Button>{/snippet}
  </EmptyState>
{:else if program}
  <form
    class="rename"
    onsubmit={(e) => {
      e.preventDefault();
      void saveName();
    }}
  >
    <TextField label="Program name" bind:value={name} error={nameError} required enterkeyhint="done" />
    <Button type="submit" variant="secondary" disabled={name.trim() === program.name}>Save name</Button>
  </form>

  <section>
    <h2>Routines</h2>
    {#if members.length === 0}
      <EmptyState icon="list" title="No routines in this program" body="Add routines to group them here." />
    {:else}
      <ul class="group" aria-label="Routines in this program">
        {#each members as r, i (r.id)}
          <li>
            <div class="item">
              <div class="link"><ListRow title={r.name} subtitle={count(r)} href={resolve(`/routines/${r.id}` as "/")} /></div>
              <div class="actions">
                <IconButton icon="chevron-up" label={`Move ${r.name} up`} disabled={i === 0} onclick={() => move(i, -1)} />
                <IconButton
                  icon="chevron-down"
                  label={`Move ${r.name} down`}
                  disabled={i === members.length - 1}
                  onclick={() => move(i, 1)}
                />
                <IconButton icon="x" label={`Remove ${r.name} from program`} onclick={() => remove(r)} />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="add"><Button icon="plus" onclick={() => (addOpen = true)}>Add routines</Button></div>
  </section>

  {#if members.length > 0}
    <section aria-labelledby="schedule">
      <h2 id="schedule">Weekly schedule</h2>
      <p class="muted">Optional. Home suggests the routine for today; nothing is missed or penalized if you skip it.</p>
      <form
        class="schedule"
        onsubmit={(e) => {
          e.preventDefault();
          void saveSchedule();
        }}
      >
        {#each WEEKDAYS as day (day)}
          <Select
            label={weekdayLabel(day)}
            bind:value={draft[day]}
            options={[{ value: "", label: "Rest day" }, ...members.map((r) => ({ value: r.id, label: r.name }))]}
          />
        {/each}
        <Button type="submit" variant="secondary" disabled={!scheduleDirty}>Save schedule</Button>
      </form>
    </section>
  {/if}
{/if}

<Sheet bind:open={addOpen} title="Add routines">
  {#if available.length === 0}
    <p class="muted">Every routine is already in this program.</p>
  {:else}
    <ul class="group" aria-label="Routines to add">
      {#each available as r (r.id)}
        <li><ListRow title={r.name} subtitle={`${count(r)} · ${programNameOf(r)}`} onclick={() => add(r)} /></li>
      {/each}
    </ul>
  {/if}
</Sheet>

<Sheet bind:open={deleteOpen} title="Delete program">
  <div class="menu">
    <p class="muted">Past workouts are never affected. What should happen to the program's routines?</p>
    <Button block variant="danger" icon="trash" onclick={() => removeProgram(false)}>Delete program, keep routines</Button>
    <Button block variant="danger" icon="trash" onclick={() => removeProgram(true)}>Delete program and routines</Button>
  </div>
</Sheet>

<style>
  .rename {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    margin-block-start: var(--space-4);
  }
  section {
    margin-block-start: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .item {
    display: flex;
    align-items: center;
  }
  .link {
    flex: 1;
    min-inline-size: 0;
  }
  .actions {
    display: flex;
    align-items: center;
    padding-inline-end: var(--space-2);
  }
  .add {
    margin-block-start: var(--space-3);
  }
  .schedule {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  .schedule > :global(.field) {
    align-self: stretch;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .muted {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
