<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import UpdateBanner from "#lib/components/UpdateBanner.svelte";
  import { t, i18n, initLocale } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import "../app.css";
  let { children } = $props();

  const tabs = [
    { href: "/", label: "nav.home" },
    { href: "/routines", label: "nav.routines" },
    { href: "/history", label: "nav.history" },
    { href: "/exercises", label: "nav.exercises" },
    { href: "/progress", label: "nav.progress" },
  ] as const;

  onMount(initLocale);
  $effect(() => {
    document.documentElement.lang = i18n.locale;
  });
</script>

<div class="app">
  <UpdateBanner />
  <main>{@render children()}</main>
  <nav aria-label={t("nav.primary")}>
    {#each tabs as tab (tab.href)}
      <a href={resolve(tab.href)} aria-current={page.url.pathname === resolve(tab.href) ? "page" : undefined}>{t(tab.label)}</a>
    {/each}
  </nav>
</div>
