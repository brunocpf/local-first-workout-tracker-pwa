<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { onNavigate } from "$app/navigation";
  import { startNavTransition } from "#lib/ui/navTransition";
  import UpdateBanner from "#lib/components/UpdateBanner.svelte";
  import AppStatus, { fullscreen, storage } from "#lib/components/AppStatus.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import ConfirmDialog from "#lib/components/ui/ConfirmDialog.svelte";
  import Toaster from "#lib/components/ui/Toaster.svelte";
  import "../app.css";
  let { children } = $props();

  const tabs = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/routines", label: "Routines", icon: "list" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/exercises", label: "Exercises", icon: "dumbbell" },
    { href: "/progress", label: "Progress", icon: "chart" },
  ] as const;

  // `/settings` is created in T1.09; cast until the route exists so the typed resolve() accepts it.
  const settingsHref = resolve("/settings" as "/");

  const titles: Record<string, string> = {
    "/": "Home",
    "/routines": "Routines",
    "/history": "History",
    "/exercises": "Exercises",
    "/progress": "Progress",
    "/settings": "Settings",
    "/workout": "Workout",
    "/diagnostics": "Diagnostics",
  };

  // Path relative to the base path, without a trailing slash ("/" for home).
  const base = resolve("/").replace(/\/$/, "");
  const relative = (pathname: string) => pathname.slice(base.length).replace(/\/+$/, "") || "/";
  const path = $derived(relative(page.url.pathname));

  // Page transitions where supported and motion is welcome; otherwise a no-op (design.md §3.5).
  onNavigate((navigation) => startNavTransition(navigation, relative));
  const isCurrent = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const hideNav = $derived(path === "/workout" || path.startsWith("/workout/"));
  const title = $derived(titles[path]);
</script>

<svelte:head>
  {#if title}<title>{title} · Workouts</title>{:else}<title>Workouts</title>{/if}
</svelte:head>

{#if fullscreen(storage)}
  <!-- Nothing works without the database: show only AppStatus, never a half-working app behind it. -->
  <AppStatus />
{:else}
<div class="app" class:nav-hidden={hideNav}>
  {#if !hideNav}
    <nav class="tabbar" aria-label="Primary">
      <ul>
        {#each tabs as t (t.href)}
          <li>
            <a href={resolve(t.href)} aria-current={isCurrent(t.href) ? "page" : undefined}>
              {#if isCurrent(t.href)}<span class="indicator"></span>{/if}
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
            </a>
          </li>
        {/each}
      </ul>
      <a class="settings" href={settingsHref} aria-current={isCurrent("/settings") ? "page" : undefined}>
        {#if isCurrent("/settings")}<span class="indicator"></span>{/if}
        <Icon name="settings" size={24} />
        <span>Settings</span>
      </a>
    </nav>
  {/if}
  <div class="column">
    <main>
      <AppStatus />
      <UpdateBanner />
      {@render children()}
    </main>
  </div>
</div>
<ConfirmDialog />
<Toaster />
{/if}

<style>
  :global(:root) {
    --shell-bottom: var(--safe-bottom);
  }
  :global(html) {
    scroll-padding-block-end: var(--shell-bottom);
  }
  .app {
    min-block-size: 100dvh;
    padding-inline: var(--safe-left) var(--safe-right);
  }
  .column {
    min-inline-size: 0;
  }
  main {
    max-inline-size: var(--content-max);
    margin-inline: auto;
    /* Every page starts with its sticky PageHeader, which adds the top safe area itself. */
    padding: 0 var(--gutter) var(--shell-bottom);
    overflow-wrap: anywhere;
  }
  ul {
    display: contents;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: contents;
  }

  .tabbar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: var(--z-nav);
    display: flex;
    background: var(--color-bg);
    border-block-start: var(--border-w) solid var(--color-border);
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    block-size: calc(var(--tabbar-h) + var(--safe-bottom));
    /* Its own transition group, so the bar stays put while the page under it transitions. */
    view-transition-name: tabbar;
  }
  .tabbar a {
    position: relative;
    flex: 1;
    min-inline-size: 0;
    min-block-size: var(--tap-min);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: var(--text-xs);
  }
  .tabbar a span {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tabbar a[aria-current="page"] {
    color: var(--color-accent-text);
    font-weight: var(--weight-semibold);
  }
  /* An element, not ::before, so it can carry a view-transition-name and glide to the next tab. */
  .indicator {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 25%;
    block-size: 3px;
    background: var(--color-accent);
    view-transition-name: tab-indicator;
  }
  @media (hover: hover) {
    .tabbar a:hover {
      background: var(--color-surface-2);
    }
  }
  .tabbar a:active {
    background: var(--color-surface-3);
  }

  /* Phones: five tabs in the bar; Settings is an icon link in the trailing slot of the page header, which keeps
     that slot free through --header-end-reserve. `.tabbar .settings` outranks `.tabbar a`. */
  .tabbar .settings {
    position: fixed;
    inset-block-start: calc(var(--safe-top) + (var(--header-h) - var(--tap-min)) / 2);
    inset-inline-end: calc(var(--safe-right) + var(--gutter) - var(--space-2));
    inline-size: var(--tap-min);
    flex: none;
    border-radius: var(--radius-md);
  }
  /* In the header slot on phones, the icon's color and weight mark the current page; no bar. */
  .tabbar .settings .indicator {
    display: none;
  }
  .tabbar .settings span:not(.indicator) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .app:not(.nav-hidden) {
    --header-end-reserve: var(--tap-min);
  }
  :global(:root:has(.tabbar)) {
    --shell-bottom: calc(var(--tabbar-h) + var(--safe-bottom));
  }
  @media (pointer: coarse) {
    :global(:root:has(:is(input:not([type="checkbox"], [type="radio"]), textarea, select):focus)) {
      --shell-bottom: var(--safe-bottom);
    }
    :global(:root:has(:is(input:not([type="checkbox"], [type="radio"]), textarea, select):focus)) .tabbar {
      display: none;
    }
  }

  @media (width >= 48em) {
    .app:not(.nav-hidden) {
      display: grid;
      grid-template-columns: var(--rail-w) minmax(0, 1fr);
    }
    :global(:root:has(.tabbar)) {
      --shell-bottom: var(--safe-bottom);
    }
    .tabbar {
      position: sticky;
      inset-block-start: 0;
      bottom: auto;
      inset-inline: auto;
      flex-direction: column;
      block-size: 100dvh;
      padding: var(--safe-top) 0 var(--safe-bottom) var(--safe-left);
      border-block-start: 0;
      border-inline-end: var(--border-w) solid var(--color-border);
    }
    .tabbar a {
      flex: none;
      inline-size: 100%;
      min-block-size: var(--tabbar-h);
    }
    .indicator {
      inset-block: 20%;
      inset-inline: 0 auto;
      inline-size: 3px;
      block-size: auto;
    }
    ul {
      display: flex;
      flex-direction: column;
    }
    li {
      display: block;
    }
    .tabbar .settings {
      position: relative;
      inset: auto;
      inline-size: 100%;
      margin-block-start: auto;
      border-radius: 0;
    }
    .tabbar .settings .indicator {
      display: block;
    }
    .tabbar .settings span:not(.indicator) {
      position: static;
      inline-size: auto;
      block-size: auto;
      clip-path: none;
    }
    .app:not(.nav-hidden) {
      --header-end-reserve: 0px;
    }
  }
</style>
