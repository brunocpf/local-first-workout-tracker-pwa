<svelte:head><title>Icons · UI style guide · Workouts</title></svelte:head>

<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { iconNames } from "#lib/icons";

  const schemes = ["light", "dark"] as const;
  const sizes = [16, 24, 32];
</script>

<h1>Icons</h1>
<p class="muted">{iconNames.length} inline SVG icons from <code>src/lib/icons.ts</code>, drawn with <code>currentColor</code>.</p>

<div class="schemes">
  {#each schemes as scheme (scheme)}
    <section class="scheme {scheme}" aria-label="{scheme} scheme">
      <h2>{scheme}</h2>
      <ul class="grid">
        {#each iconNames as name (name)}
          <li>
            <span class="row">
              {#each sizes as size (size)}
                <Icon {name} {size} />
              {/each}
            </span>
            <code>{name}</code>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .schemes {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  }
  .scheme {
    color-scheme: light;
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }
  .scheme.dark {
    color-scheme: dark;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  }
  .grid li {
    display: grid;
    gap: var(--space-1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  code {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
</style>
