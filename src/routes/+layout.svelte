<script lang="ts">
  import { page } from "$app/state";
  import "../app.css";
  let { children } = $props();

  const tabs = [
    { href: "/", label: "Home" },
    { href: "/routines", label: "Routines" },
    { href: "/history", label: "History" },
    { href: "/exercises", label: "Exercises" },
    { href: "/progress", label: "Progress" },
  ];
</script>

<div class="app">
  <main>{@render children()}</main>
  <nav aria-label="Primary">
    {#each tabs as t}
      <a href={t.href} aria-current={page.url.pathname === t.href ? "page" : undefined}>{t.label}</a>
    {/each}
  </nav>
</div>
