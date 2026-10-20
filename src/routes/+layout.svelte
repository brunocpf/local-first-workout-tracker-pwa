<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import UpdateBanner from "#lib/components/UpdateBanner.svelte";
  import "../app.css";
  let { children } = $props();

  const tabs = [
    { href: "/", label: "Home" },
    { href: "/routines", label: "Routines" },
    { href: "/history", label: "History" },
    { href: "/exercises", label: "Exercises" },
    { href: "/progress", label: "Progress" },
  ] as const;
</script>

<div class="app">
  <UpdateBanner />
  <main>{@render children()}</main>
  <nav aria-label="Primary">
    {#each tabs as t (t.href)}
      <a href={resolve(t.href)} aria-current={page.url.pathname === resolve(t.href) ? "page" : undefined}>{t.label}</a>
    {/each}
  </nav>
</div>
