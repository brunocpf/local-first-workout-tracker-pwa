<svelte:head><title>UI style guide · Workouts</title></svelte:head>

<script lang="ts">
  import { resolve } from "$app/paths";

  const groups = [
    { name: "Surface", tokens: ["bg", "surface-1", "surface-2", "surface-3"] },
    { name: "Text", tokens: ["text", "text-muted", "text-disabled"] },
    { name: "Border", tokens: ["border", "border-strong", "focus"] },
    { name: "Accent", tokens: ["accent", "accent-hover", "accent-active", "on-accent", "accent-subtle", "accent-text"] },
    { name: "Success", tokens: ["success", "success-subtle", "success-text", "on-success"] },
    { name: "Warning", tokens: ["warning", "warning-subtle", "warning-text"] },
    { name: "Danger", tokens: ["danger", "danger-hover", "on-danger", "danger-subtle", "danger-text"] },
    { name: "Info", tokens: ["info", "info-subtle", "info-text"] },
    { name: "Overlay", tokens: ["backdrop", "shadow"] },
  ];
  const schemes = ["light", "dark"] as const;
  const sizes = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
  const spaces = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "16"];
  const radii = ["sm", "md", "lg", "full"];
  const subPages = ["icons", "forms", "overlays", "layout", "charts"];
</script>

<h1>UI style guide</h1>
<p class="muted">Tokens from <code>src/app.css</code>, specified in docs/design.md. Development only.</p>

<nav class="subpages" aria-label="Style guide pages">
  {#each subPages as p (p)}
    <a href={resolve(`/dev/ui/${p}` as "/")}>{p}</a>
  {/each}
</nav>

<h2>Color</h2>
<div class="schemes">
  {#each schemes as scheme (scheme)}
    <section class="scheme {scheme}" aria-label="{scheme} scheme">
      <h3>{scheme}</h3>
      {#each groups as g (g.name)}
        <h4>{g.name}</h4>
        <ul class="swatches">
          {#each g.tokens as t (t)}
            <li>
              <span class="swatch" style:--swatch="var(--color-{t})"></span>
              <code>--color-{t}</code>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/each}
</div>

<h2>Type scale</h2>
{#each sizes as s (s)}
  <p class="sample" style:font-size="var(--text-{s})" style:line-height="var(--leading-{s})">
    <code>--text-{s}</code> Sit, rest, lift <span class="tabular">0123456789</span>
  </p>
{/each}
<p class="sample">
  <span style:font-weight="var(--weight-regular)">Regular</span> ·
  <span style:font-weight="var(--weight-medium)">Medium</span> ·
  <span style:font-weight="var(--weight-semibold)">Semibold</span> ·
  <span style:font-weight="var(--weight-bold)">Bold</span>
</p>
<p class="sample tabular">tabular 1111 / 8888</p>

<h2>Spacing</h2>
{#each spaces as s (s)}
  <div class="space-row"><code>--space-{s}</code><span class="bar" style:inline-size="var(--space-{s})"></span></div>
{/each}

<h2>Radii</h2>
<ul class="radii">
  {#each radii as r (r)}
    <li><span class="radius" style:border-radius="var(--radius-{r})"></span><code>--radius-{r}</code></li>
  {/each}
</ul>

<h2>Focus ring</h2>
<p><a href="#focus">Tab to this link</a> or <button type="button" class="demo">this button</button>.</p>

<style>
  .muted { color: var(--color-text-muted); font-size: var(--text-sm); }
  h2 { margin-block: var(--space-8) var(--space-3); }
  code { font-family: var(--font-mono); font-size: var(--text-sm); }
  .subpages { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin-block: var(--space-4); border: 0; }
  .subpages a { min-height: var(--tap-min); display: inline-flex; align-items: center; }
  .schemes { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
  .scheme { padding: var(--space-4); border: var(--border-w) solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg); color: var(--color-text); }
  .scheme.light { color-scheme: light; }
  .scheme.dark { color-scheme: dark; }
  .scheme h4 { margin-block: var(--space-3) var(--space-1); color: var(--color-text-muted); }
  .swatches { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .swatches li { display: flex; align-items: center; gap: var(--space-3); }
  .swatch { flex: none; inline-size: 2.5rem; block-size: 1.5rem; border-radius: var(--radius-sm); border: var(--border-w) solid var(--color-border-strong); background: var(--color-surface-1); background-image: linear-gradient(var(--swatch), var(--swatch)); }
  .sample { margin-block: var(--space-1); }
  .space-row { display: flex; align-items: center; gap: var(--space-3); margin-block: var(--space-1); }
  .space-row code { inline-size: 7rem; flex: none; }
  .bar { block-size: 1rem; background: var(--color-accent); }
  .radii { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-4); }
  .radii li { display: grid; justify-items: center; gap: var(--space-2); }
  .radius { inline-size: 4rem; block-size: 4rem; background: var(--color-surface-2); border: var(--border-w) solid var(--color-border-strong); }
  .demo { min-height: var(--tap-min); padding: 0 var(--space-4); border: var(--border-w) solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface-2); }
</style>
