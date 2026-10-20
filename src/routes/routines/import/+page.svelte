<script lang="ts">
  import { resolve } from "$app/paths";
  import ImportInput from "#lib/components/import/ImportInput.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import type { ParseResult } from "#lib/imports/parseProgram";

  const FORMAT_DOCS = "https://github.com/brunocpf/local-first-workout-tracker-pwa/blob/main/docs/import-schema.md";

  let parsed = $state<Extract<ParseResult, { ok: true }>>();
</script>

<PageHeader title="Import a plan" back={{ href: resolve("/routines"), label: "Back to routines" }} />

<div class="page">
  <p>
    Paste a plan as JSON or open a <code>.json</code> file. Nothing is saved until you review it.
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external docs link -->
    <a href={FORMAT_DOCS} target="_blank" rel="noopener noreferrer">Import format</a>
  </p>
  <ImportInput onparsed={(r) => (parsed = r?.ok ? r : undefined)} />
  {#if parsed}
    <Card>
      <p><strong>{parsed.data.program.name}</strong> looks valid.</p>
      <p>Preview coming soon.</p>
    </Card>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--space-4); }
  p { margin: 0; }
</style>
