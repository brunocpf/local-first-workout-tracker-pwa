<script lang="ts">
  import { t, tn } from "#lib/i18n.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { extractJsonCandidates, isJson } from "#lib/imports/extract";
  import { MAX_IMPORT_BYTES, parseProgramImport, type ParseResult } from "#lib/imports/parseProgram";

  let { onparsed }: { onparsed: (result: ParseResult | undefined) => void } = $props();

  let text = $state("");
  let errors = $state<string[]>([]);
  let warnings = $state<string[]>([]);
  let candidates = $state<string[]>([]);
  let fileInput = $state<HTMLInputElement>();

  function check(input: string) {
    candidates = [];
    const result = parseProgramImport(input);
    errors = result.ok ? [] : result.errors;
    warnings = result.warnings ?? [];
    onparsed(result.ok ? result : undefined);
  }

  function validate(input: string) {
    // Extraction only runs for text that isn't plain JSON; oversize input goes straight to the size check.
    const found = isJson(input) || input.length > MAX_IMPORT_BYTES ? [] : extractJsonCandidates(input);
    const wholeText = found.length === 1 && found[0] === input.trim();
    if (found.length === 0 || wholeText) return check(input);
    candidates = found;
    errors = [];
    warnings = [];
    onparsed(undefined);
  }

  function useCandidate(index: number) {
    const block = candidates[index];
    check(block);
  }

  function fail(message: string) {
    candidates = [];
    errors = [message];
    warnings = [];
    onparsed(undefined);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    validate(text);
  }

  async function onfile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    // Check the size before reading so an oversized file is never loaded into memory.
    if (file.size > MAX_IMPORT_BYTES) return fail(t("imp.tooLarge", { max: MAX_IMPORT_BYTES }));
    try {
      text = await file.text();
    } catch {
      return fail(t("imp.readFailed"));
    }
    validate(text);
  }
</script>

<form onsubmit={submit} novalidate>
  <label class="label" for="import-text">{t("imp.planJson")}</label>
  <textarea
    id="import-text"
    bind:value={text}
    rows="12"
    autocomplete="off"
    autocapitalize="off"
    {@attach (el) => el.setAttribute("autocorrect", "off")}
    spellcheck="false"
    placeholder={'{ "schemaVersion": 1, … }'}
  ></textarea>
  <div class="actions">
    <Button type="submit" variant="primary" disabled={text.trim() === ""}>{t("imp.check")}</Button>
    <Button variant="secondary" onclick={() => fileInput?.click()}>{t("imp.openFile")}</Button>
    <input
      bind:this={fileInput}
      class="file"
      type="file"
      accept=".json,application/json"
      aria-label={t("imp.openFileLabel")}
      tabindex="-1"
      onchange={onfile}
    />
  </div>
</form>

<div class="messages" role="alert">
  {#if errors.length > 0}
    <Banner variant="danger" title={t("imp.badPlan")}>
      <ul>
        {#each errors as message, i (i)}<li>{message}</li>{/each}
      </ul>
    </Banner>
  {/if}
</div>
{#if candidates.length > 0}
  <Banner variant="info" title={tn("imp.found", candidates.length)}>
    <p class="choose">{t("imp.notPlain")}</p>
    <div class="choices">
      {#each candidates as _block, i (i)}
        <Button variant="secondary" onclick={() => useCandidate(i)}>{t("imp.useBlock", { n: i + 1 })}</Button>
      {/each}
    </div>
  </Banner>
{/if}
{#if warnings.length > 0}
  <Banner variant="warning" title={t("imp.warnings")}>
    <ul>
      {#each warnings as message, i (i)}<li>{message}</li>{/each}
    </ul>
  </Banner>
{/if}

<style>
  form { display: flex; flex-direction: column; gap: var(--space-2); }
  .label { font-weight: var(--weight-semibold); }
  textarea {
    box-sizing: border-box;
    inline-size: 100%;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface-2);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    resize: vertical;
  }
  textarea:focus-visible { border-color: var(--color-accent); }
  .actions, .choices { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .choose { margin: 0; }
  .file { display: none; }
  .messages:empty { display: none; }
  ul { margin: 0; padding-inline-start: var(--space-4); }
  li { overflow-wrap: anywhere; }
</style>
