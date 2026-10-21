<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import StartRoutineButton from "#lib/components/routines/StartRoutineButton.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Sheet from "#lib/components/ui/Sheet.svelte";
  import TextField from "#lib/components/ui/TextField.svelte";
  import {
    createFolder,
    createProgram,
    deleteFolder,
    deleteRoutine,
    duplicateRoutine,
    FOLDER_NAME_MAX,
    groupByFolder,
    listRoutinesGrouped,
    renameFolder,
    setRoutineFavorite,
    setRoutineFolder,
    type RoutinesGrouped,
  } from "#lib/storage/routines";
  import { confirm } from "#lib/ui/confirm.svelte";
  import { toast } from "#lib/ui/toast.svelte";
  import type { Routine, RoutineFolder } from "#lib/types";

  let grouped = $state<RoutinesGrouped>({ programs: [], standalone: [], folders: [] });
  let loaded = $state(false);
  let failed = $state(false);
  let menuFor = $state<Routine>();
  let menuOpen = $state(false);
  let programOpen = $state(false);
  let moreOpen = $state(false);
  let programName = $state("");
  let programError = $state<string>();
  // Folders: options sheet (rename/delete), name sheet (create or rename), move sheet (pick a routine's folder).
  let folderMenuFor = $state<RoutineFolder>();
  let folderMenuOpen = $state(false);
  let folderFormOpen = $state(false);
  let folderRenaming = $state<RoutineFolder>();
  /** Set when "New folder…" was chosen while moving a routine: it is moved into the new folder. */
  let folderFormMoves = $state<Routine>();
  let folderName = $state("");
  let folderError = $state<string>();
  let moveFor = $state<Routine>();
  let moveOpen = $state(false);

  async function load() {
    try {
      grouped = await listRoutinesGrouped();
      failed = false;
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  }
  onMount(load);

  const isEmpty = $derived(grouped.standalone.length === 0 && grouped.programs.length === 0 && grouped.folders.length === 0);
  const byFolder = $derived(groupByFolder(grouped));
  /** Routines in a program are listed (and organized) under it; folders hold the others. */
  const inProgram = (r: Routine) => !grouped.standalone.some((s) => s.id === r.id);
  const count = (r: Routine) => `${r.exercises.length} ${r.exercises.length === 1 ? "exercise" : "exercises"}`;
  const newHref = resolve("/routines/new");
  const importHref = resolve("/routines/import");
  const generateHref = resolve("/routines/generate");

  function openMenu(r: Routine) {
    menuFor = r;
    menuOpen = true;
  }

  async function duplicate(r: Routine) {
    menuOpen = false;
    try {
      await duplicateRoutine(r.id);
      await load();
    } catch {
      toast("Couldn't duplicate the routine");
    }
  }

  async function toggleFavorite(r: Routine) {
    menuOpen = false;
    try {
      await setRoutineFavorite(r.id, !r.favorite);
      await load();
      toast(r.favorite ? "Removed from favorites" : "Added to favorites");
    } catch {
      toast("Couldn't update favorites");
    }
  }

  function openMove(r: Routine) {
    menuOpen = false;
    moveFor = r;
    moveOpen = true;
  }

  async function moveTo(r: Routine, folder?: RoutineFolder) {
    moveOpen = false;
    try {
      await setRoutineFolder(r.id, folder?.id);
      await load();
      toast(folder ? `Moved to ${folder.name}` : "Moved out of the folder");
    } catch {
      toast("Couldn't move the routine");
    }
  }

  function openFolderForm(renaming?: RoutineFolder, moves?: Routine) {
    moreOpen = false;
    folderMenuOpen = false;
    moveOpen = false;
    folderRenaming = renaming;
    folderFormMoves = moves;
    folderName = renaming?.name ?? "";
    folderError = undefined;
    folderFormOpen = true;
  }

  async function saveFolder() {
    if (!folderName.trim()) {
      folderError = "Enter a folder name.";
      return;
    }
    if (folderName.trim().length > FOLDER_NAME_MAX) {
      folderError = `Use at most ${FOLDER_NAME_MAX} characters.`;
      return;
    }
    try {
      if (folderRenaming) {
        await renameFolder(folderRenaming.id, folderName);
      } else {
        const folder = await createFolder(folderName);
        if (folderFormMoves) await setRoutineFolder(folderFormMoves.id, folder.id);
      }
      folderFormOpen = false;
      await load();
    } catch {
      folderError = folderRenaming ? "Couldn't rename the folder." : "Couldn't create the folder.";
    }
  }

  function openFolderMenu(folder: RoutineFolder) {
    folderMenuFor = folder;
    folderMenuOpen = true;
  }

  async function removeFolder(folder: RoutineFolder, routines: number) {
    folderMenuOpen = false;
    const ok = await confirm({
      title: `Delete folder "${folder.name}"?`,
      body:
        routines === 0
          ? "The folder is empty."
          : `Its ${routines} ${routines === 1 ? "routine is" : "routines are"} kept and moved out of the folder.`,
      confirmLabel: "Delete folder",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteFolder(folder.id);
      await load();
    } catch {
      toast("Couldn't delete the folder");
    }
  }

  async function addProgram() {
    if (!programName.trim()) {
      programError = "Enter a program name.";
      return;
    }
    try {
      const program = await createProgram(programName);
      programOpen = false;
      programName = "";
      await goto(resolve(`/programs/${program.id}` as "/"));
    } catch {
      programError = "Couldn't create the program.";
    }
  }

  async function remove(r: Routine) {
    menuOpen = false;
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      body: "The routine is removed. Past workouts that used it are not affected.",
      confirmLabel: "Delete routine",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRoutine(r.id);
      await load();
    } catch {
      toast("Couldn't delete the routine");
    }
  }
</script>

{#snippet group(title: string, routines: Routine[], { programId, folder }: { programId?: string; folder?: RoutineFolder } = {})}
  <section>
    {#if programId}
      <h2><a href={resolve(`/programs/${programId}` as "/")}>{title}</a></h2>
    {:else if folder}
      <div class="folder-head">
        <h2>{title}</h2>
        <IconButton icon="more-vertical" size="sm" label={`Options for folder ${title}`} onclick={() => openFolderMenu(folder)} />
      </div>
    {:else}
      <h2>{title}</h2>
    {/if}
    {#if routines.length === 0}
      <p class="empty">No routines yet. Use a routine’s options to move it here.</p>
    {:else}
      <ul class="group" aria-label={title}>
        {#each routines as r (r.id)}
          <li>
            <div class="item">
              <div class="link">
                <ListRow title={r.name} subtitle={count(r)} href={resolve(`/routines/${r.id}` as "/")}>
                  {#snippet trailing()}
                    {#if r.favorite}<span class="fav"><Icon name="star" size={16} /><span class="vh">Favorite</span></span>{/if}
                  {/snippet}
                </ListRow>
              </div>
              <div class="actions">
                <StartRoutineButton routine={r} />
                <IconButton icon="more-vertical" label={`Options for ${r.name}`} onclick={() => openMenu(r)} />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<PageHeader title="Routines">
  {#snippet actions()}
    <Button variant="primary" size="sm" icon="plus" href={newHref}>New routine</Button>
    <IconButton icon="more-vertical" label="More routine actions" onclick={() => (moreOpen = true)} />
  {/snippet}
</PageHeader>

{#if failed}
  <EmptyState icon="alert-triangle" title="Couldn’t load routines" body="Reload the app and try again." />
{:else if loaded}
  {#if isEmpty}
    <EmptyState icon="list" title="No routines yet" body="Create a routine or import a plan to start from one.">
      {#snippet action()}
        <Button variant="primary" icon="plus" href={newHref}>New routine</Button>
        <Button variant="secondary" icon="import" href={importHref}>Import routine</Button>
        <Button variant="secondary" href={generateHref}>Generate with AI</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#each grouped.programs as { program, routines } (program.id)}
      {@render group(program.name, routines, { programId: program.id })}
    {/each}
    {#each byFolder.folders as { folder, routines } (folder.id)}
      {@render group(folder.name, routines, { folder })}
    {/each}
    {#if byFolder.unfiled.length > 0}
      {@render group(grouped.programs.length + grouped.folders.length > 0 ? "Other routines" : "Routines", byFolder.unfiled)}
    {/if}
  {/if}
{/if}

<!-- One primary action in the header (design.md §6.15); the rest live in an action sheet. -->
<Sheet bind:open={moreOpen} title="Routine actions">
  <div class="menu">
    <Button block icon="import" href={importHref}>Import</Button>
    <Button block href={generateHref}>Generate with AI</Button>
    <Button block icon="plus" onclick={() => ((moreOpen = false), (programOpen = true))}>New program</Button>
    <Button block icon="plus" onclick={() => openFolderForm()}>New folder</Button>
  </div>
</Sheet>

<Sheet bind:open={menuOpen} title={menuFor?.name ?? "Routine"}>
  {#if menuFor}
    <div class="menu">
      <StartRoutineButton routine={menuFor} variant="primary" size="md" block onstart={() => (menuOpen = false)} />
      <Button block icon="star" onclick={() => toggleFavorite(menuFor!)}>
        {menuFor.favorite ? "Remove from favorites" : "Add to favorites"}
      </Button>
      {#if !inProgram(menuFor)}
        <Button block icon="list" onclick={() => openMove(menuFor!)}>Move to folder…</Button>
      {/if}
      <Button block icon="copy" onclick={() => duplicate(menuFor!)}>Duplicate</Button>
      <Button block variant="danger" icon="trash" onclick={() => remove(menuFor!)}>Delete…</Button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={moveOpen} title={moveFor ? `Move "${moveFor.name}"` : "Move routine"}>
  {#if moveFor}
    {@const current = grouped.folders.find((f) => f.id === moveFor?.folderId)}
    <ul class="group" aria-label="Folders">
      <li><ListRow title="No folder" selected={!current} onclick={() => moveTo(moveFor!)} /></li>
      {#each grouped.folders as folder (folder.id)}
        <li><ListRow title={folder.name} selected={current?.id === folder.id} onclick={() => moveTo(moveFor!, folder)} /></li>
      {/each}
    </ul>
    <div class="menu after">
      <Button block icon="plus" onclick={() => openFolderForm(undefined, moveFor)}>New folder…</Button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={folderMenuOpen} title={folderMenuFor?.name ?? "Folder"}>
  {#if folderMenuFor}
    {@const routines = byFolder.folders.find((f) => f.folder.id === folderMenuFor?.id)?.routines.length ?? 0}
    <div class="menu">
      <Button block icon="edit" onclick={() => openFolderForm(folderMenuFor)}>Rename…</Button>
      <Button block variant="danger" icon="trash" onclick={() => removeFolder(folderMenuFor!, routines)}>Delete…</Button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={folderFormOpen} title={folderRenaming ? "Rename folder" : "New folder"}>
  <form
    class="menu"
    onsubmit={(e) => {
      e.preventDefault();
      void saveFolder();
    }}
  >
    <TextField label="Folder name" bind:value={folderName} error={folderError} required enterkeyhint="done" />
    <Button type="submit" variant="primary" block>{folderRenaming ? "Save" : folderFormMoves ? "Create and move" : "Create folder"}</Button>
  </form>
</Sheet>

<Sheet bind:open={programOpen} title="New program">
  <form
    class="menu"
    onsubmit={(e) => {
      e.preventDefault();
      void addProgram();
    }}
  >
    <TextField label="Program name" bind:value={programName} error={programError} required enterkeyhint="done" />
    <Button type="submit" variant="primary" block>Create program</Button>
  </form>
</Sheet>

<style>
  h2 a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap-min);
    color: inherit;
    text-decoration: none;
  }
  h2 a:hover {
    text-decoration: underline;
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
    gap: var(--space-2);
    padding-inline-end: var(--space-2);
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .menu.after {
    margin-block-start: var(--space-3);
  }
  .folder-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  .folder-head h2 {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .fav {
    display: flex;
    color: var(--color-accent-text);
  }
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
