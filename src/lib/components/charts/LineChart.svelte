<script module lang="ts">
  export type ChartPoint = { date: string; value: number };
</script>

<script lang="ts">
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import { linearScale, niceTicks, timeScale, timeTicks } from "#lib/charts/scale";

  let {
    points,
    label,
    unit = "",
    summary,
    emptyTitle = "No data yet",
    emptyBody = "Complete sets of this exercise to see progress.",
  }: {
    /** Oldest first; `date` is a local "YYYY-MM-DD". */
    points: readonly ChartPoint[];
    /** What is plotted, e.g. "Estimated 1RM for Bench Press". */
    label: string;
    unit?: string;
    /** Overrides the generated accessible summary. */
    summary?: string;
    emptyTitle?: string;
    emptyBody?: string;
  } = $props();

  const H_PAD = 12;
  const TOP = 12;
  const BOTTOM = 28;

  let width = $state(320);
  let height = $state(200);
  let active = $state(0);
  let selected = $state<number | null>(null);

  const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const shortFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
  const num = (v: number) => `${Number(v.toFixed(2))}`;
  const withUnit = (v: number) => (unit ? `${num(v)} ${unit}` : num(v));

  const first = $derived(points[0]);
  const last = $derived(points.at(-1));

  const yTicks = $derived(
    points.length ? niceTicks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)), 4) : [],
  );
  const yLabelW = $derived(Math.max(...yTicks.map((t) => num(t).length), 1) * 8 + 8);
  const left = $derived(yLabelW + H_PAD);
  const right = $derived(width - H_PAD - 8);
  const xDomain = $derived<[string, string]>([first?.date ?? "", last?.date ?? ""]);
  const single = $derived(points.length === 1 || xDomain[0] === xDomain[1]);
  const xs = $derived(timeScale(xDomain, [left, right]));
  const y = $derived(linearScale([yTicks[0] ?? 0, yTicks.at(-1) ?? 1], [height - BOTTOM, TOP]));
  const px = (p: ChartPoint) => (single ? (left + right) / 2 : xs(p.date));
  const xTicks = $derived(
    single ? [] : timeTicks(xDomain[0], xDomain[1], Math.max(2, Math.min(4, Math.floor((right - left) / 80)))),
  );

  const path = $derived(points.map((p, i) => `${i ? "L" : "M"}${px(p).toFixed(1)} ${y(p.value).toFixed(1)}`).join(""));

  const ariaLabel = $derived.by(() => {
    if (summary) return summary;
    if (!first || !last) return `${label}: no data`;
    if (points.length === 1) return `${label}: ${withUnit(first.value)} on ${dateFmt.format(asDate(first.date))}`;
    const trend = last.value > first.value ? "rose" : last.value < first.value ? "fell" : "stayed at";
    const change = trend === "stayed at" ? withUnit(first.value) : `from ${num(first.value)} to ${withUnit(last.value)}`;
    const a = first.date.slice(0, 7);
    const b = last.date.slice(0, 7);
    const span =
      a === b
        ? `in ${monthFmt.format(asDate(first.date))}`
        : `between ${dateFmt.format(asDate(first.date))} and ${dateFmt.format(asDate(last.date))}`;
    return `${label} ${trend} ${change} ${span} (${points.length} data points)`;
  });

  const pointName = (p: ChartPoint) => `${dateFmt.format(asDate(p.date))}: ${withUnit(p.value)}`;
  const current = $derived(selected !== null ? points[selected] : undefined);

  function focusPoint(group: HTMLElement, i: number) {
    active = i;
    selected = i;
    group.querySelectorAll<HTMLButtonElement>("button")[i]?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    const n = points.length;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(n - 1, active + 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(0, active - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    focusPoint(e.currentTarget as HTMLElement, next);
  }
</script>

{#if points.length === 0}
  <EmptyState icon="chart" title={emptyTitle} body={emptyBody} />
{:else}
  <figure class="chart">
    <div class="readout tabular" aria-live="polite">
      {#if current}{pointName(current)}{:else}&nbsp;{/if}
    </div>
    <div class="plot" bind:clientWidth={width} bind:clientHeight={height}>
      <svg viewBox="0 0 {width} {height}" role="img" aria-label={ariaLabel} focusable="false">
        {#each yTicks as t (t)}
          <line class="grid" x1={left} x2={right} y1={y(t)} y2={y(t)} />
          <text class="tick tabular" x={left - 6} y={y(t)} text-anchor="end" dominant-baseline="middle">{num(t)}</text>
        {/each}
        <line class="axis" x1={left} x2={right} y1={height - BOTTOM} y2={height - BOTTOM} />
        {#each xTicks as t, i (t)}
          <text
            class="tick tabular"
            x={xs(t)}
            y={height - BOTTOM + 16}
            text-anchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>{shortFmt.format(asDate(t))}</text
          >
        {/each}
        {#if single}
          <text class="tick tabular" x={px(first)} y={height - BOTTOM + 16} text-anchor="middle">{shortFmt.format(asDate(first.date))}</text>
        {/if}
        {#if points.length > 1}<path class="line" d={path} pathLength="1" />{/if}
        {#each points as p, i (i)}
          <circle class="dot" class:on={selected === i} cx={px(p)} cy={y(p.value)} r={selected === i ? 6 : 4} />
        {/each}
      </svg>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="targets" role="group" aria-label="Data points" {onkeydown}>
        {#each points as p, i (i)}
          <button
            type="button"
            class="target"
            style:left="{px(p)}px"
            style:top="{y(p.value)}px"
            tabindex={i === active ? 0 : -1}
            aria-label={pointName(p)}
            aria-pressed={selected === i}
            onclick={() => {
              active = i;
              selected = selected === i ? null : i;
            }}
            onfocus={() => (active = i)}
          ></button>
        {/each}
      </div>
    </div>
    <table class="vh">
      <caption>{label}</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Value{unit ? ` (${unit})` : ""}</th></tr></thead>
      <tbody>
        {#each points as p, i (i)}
          <tr><td>{dateFmt.format(asDate(p.date))}</td><td>{num(p.value)}</td></tr>
        {/each}
      </tbody>
    </table>
  </figure>
{/if}

<style>
  .chart {
    margin: 0;
  }
  .readout {
    min-block-size: calc(var(--text-sm) * var(--leading-sm));
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-muted);
    margin-block-end: var(--space-2);
  }
  .plot {
    position: relative;
    block-size: clamp(10rem, 40vw, 16rem);
    inline-size: 100%;
  }
  svg {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    overflow: visible;
  }
  .grid {
    stroke: var(--color-border);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--color-border-strong);
    stroke-width: 1;
  }
  .tick {
    fill: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  .line {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .dot {
    fill: var(--color-surface-1);
    stroke: var(--color-accent);
    stroke-width: 2;
  }
  .dot.on {
    fill: var(--color-accent);
  }
  .targets {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .target {
    position: absolute;
    inline-size: var(--tap-min);
    block-size: var(--tap-min);
    translate: -50% -50%;
    padding: 0;
    border: 0;
    border-radius: var(--radius-full);
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
  }
  .target:focus-visible {
    outline: var(--focus-w) solid var(--color-focus);
    outline-offset: calc(var(--focus-offset) * -1);
  }
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: no-preference) {
    .line {
      stroke-dasharray: 1;
      animation: draw var(--duration-slow) var(--ease-enter) both;
    }
    .dot {
      transition: r var(--duration-fast) var(--ease-standard);
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (forced-colors: active) {
    .grid,
    .axis {
      stroke: GrayText;
    }
    .tick {
      fill: CanvasText;
    }
    .line,
    .dot {
      forced-color-adjust: none;
      stroke: Highlight;
    }
    .dot {
      fill: Canvas;
    }
    .dot.on {
      fill: Highlight;
    }
  }
</style>
