<script lang="ts">
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import ImportInput from "#lib/components/import/ImportInput.svelte";
  import ImportPreview from "#lib/components/import/ImportPreview.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import type { ParseResult } from "#lib/imports/parseProgram";
  import { isShareHash, parseShareHash } from "#lib/imports/shareLink";

  const FORMAT_DOCS = "https://github.com/brunocpf/local-first-workout-tracker-pwa/blob/main/docs/import-schema.md";

  let parsed = $state<Extract<ParseResult, { ok: true }>>();
  let linkErrors = $state<string[]>([]);
  let linkWarnings = $state<string[]>([]);
  let token = 0;

  /** A shared link carries the plan in the fragment; it only prefills the preview, nothing is saved until confirmed. */
  async function openSharedLink() {
    if (!isShareHash(location.hash)) return;
    const mine = ++token;
    const result = await parseShareHash(location.hash);
    if (mine !== token) return;
    linkErrors = result.ok ? [] : result.errors;
    linkWarnings = result.warnings ?? [];
    parsed = result.ok ? result : undefined;
  }

  onMount(openSharedLink);
</script>

<svelte:window onhashchange={openSharedLink} />

<PageHeader title={t("imp.title")} back={{ href: resolve("/routines"), label: t("imp.backTo") }} />

<div class="page">
  <p>
    {t("imp.intro")} <code>.json</code>{t("imp.introFile")}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external docs link -->
    <a href={FORMAT_DOCS} target="_blank" rel="noopener noreferrer">{t("imp.format")}</a>
  </p>
  {#if linkErrors.length > 0}
    <div role="alert">
      <Banner variant="danger" title={t("imp.linkBad")}>
        <ul>
          {#each linkErrors as message, i (i)}<li>{message}</li>{/each}
        </ul>
      </Banner>
    </div>
  {:else if parsed && linkWarnings.length > 0}
    <Banner variant="warning" title={t("imp.warnings")}>
      <ul>
        {#each linkWarnings as message, i (i)}<li>{message}</li>{/each}
      </ul>
    </Banner>
  {/if}
  <ImportInput
    onparsed={(r) => {
      token++;
      linkErrors = [];
      linkWarnings = [];
      parsed = r?.ok ? r : undefined;
    }}
  />
  {#if parsed}
    {#key parsed}
      <ImportPreview
        data={parsed.data}
        warnings={parsed.warnings}
        oncancel={() => (parsed = undefined)}
        onsaved={() => goto(resolve("/routines"))}
      />
    {/key}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--space-4); }
  p { margin: 0; }
  ul { margin: 0; padding-inline-start: var(--space-4); }
  li { overflow-wrap: anywhere; }
</style>
