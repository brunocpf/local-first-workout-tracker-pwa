<script lang="ts">
  // One set of an exercise card (design.md §7.2). Presentational: values come in as kg, edits go out as kg
  // through callbacks, and the parent decides how to persist. The grid columns come from the card
  // (`--set-cols` / `--set-areas`) so the column header and every row share one layout.
  import Badge from "#lib/components/ui/Badge.svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import NumberField from "#lib/components/ui/NumberField.svelte";
  import type { SetValues } from "#lib/logger/previousValues";
  import { formatNumber } from "#lib/numberInput";
  import { keepAboveKeyboard } from "#lib/ui/keyboard";
  import { displayWeight, toKg } from "#lib/units";
  import type { LoggedSet, WeightUnit } from "#lib/types";

  let {
    set,
    label,
    name,
    unit,
    previous,
    prefill = {},
    onweight,
    onreps,
    ontoggle,
    onmenu,
  }: {
    set: LoggedSet;
    /** Visible label: `1`, `2`, … (warm-ups show a "W" badge instead). */
    label: string;
    /** Accessible name of the set, e.g. "Set 2" or "Warm-up 1". */
    name: string;
    unit: WeightUnit;
    previous?: Pick<LoggedSet, "weight" | "reps">;
    /** Shown as placeholders and stored by one-tap complete (kg). */
    prefill?: SetValues;
    /** Typed weight in kg (`undefined` when cleared). Never called with a value the user didn't type. */
    onweight: (kg: number | undefined) => void;
    onreps: (reps: number | undefined) => void;
    /** Completes (storing the prefill for empty fields) or un-completes the set. */
    ontoggle: () => void;
    onmenu: () => void;
  } = $props();

  const completed = $derived(set.completedAt !== undefined);
  const warmup = $derived(set.type === "warmup");
  const fmtWeight = (kg: number) => formatNumber(displayWeight(kg, unit));
  const previousText = $derived.by(() => {
    const w = previous?.weight;
    const r = previous?.reps;
    if (w !== undefined && r !== undefined) return `${fmtWeight(w)}\u202f×\u202f${r}`;
    if (w !== undefined) return `${fmtWeight(w)}\u00a0${unit}`;
    if (r !== undefined) return `${r} reps`;
    return "–";
  });

  // Polite announcement for a reverted entry (design.md §6.5); cleared first so a repeat is read again.
  let status = $state("");
  function announce(text: string) {
    status = "";
    queueMicrotask(() => (status = text));
  }

  /** `next` on the weight field moves to reps, `done` on reps closes the keyboard (iOS has no built-in next for these). */
  function enterKeys(node: HTMLElement) {
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
      const inputs = [...node.querySelectorAll("input")];
      const i = inputs.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      if (i < inputs.length - 1) inputs[i + 1].focus();
      else e.target.blur();
    };
    node.addEventListener("keydown", onkeydown);
    return () => node.removeEventListener("keydown", onkeydown);
  }
</script>

<li class="row" class:completed {@attach keepAboveKeyboard} {@attach enterKeys}>
  <button class="label tabular" type="button" aria-label="{name} options" onclick={onmenu}>
    {#if warmup}<Badge variant="warning">W</Badge>{:else}{label}{/if}
  </button>
  <span class="previous tabular"><span class="vh">Previous:</span> {previousText}</span>
  <div class="weight">
    <NumberField
      label="{name} weight, {unit}"
      labelVisible={false}
      value={set.weight === undefined ? null : displayWeight(set.weight, unit)}
      placeholder={prefill.weight === undefined ? undefined : fmtWeight(prefill.weight)}
      enterkeyhint="next"
      onchange={(n) => onweight(n === null ? undefined : toKg(n, unit))}
      oninvalid={(reason) => announce(`${name} weight not changed – ${reason.toLowerCase()}`)}
    />
  </div>
  <div class="reps">
    <NumberField
      label="{name} reps"
      labelVisible={false}
      mode="integer"
      value={set.reps ?? null}
      placeholder={prefill.reps === undefined ? undefined : String(prefill.reps)}
      enterkeyhint="done"
      onchange={(n) => onreps(n ?? undefined)}
      oninvalid={(reason) => announce(`${name} reps not changed – ${reason.toLowerCase()}`)}
    />
  </div>
  <button
    class="done"
    type="button"
    aria-pressed={completed}
    aria-label={completed ? `${name} completed, undo` : `Complete ${name.toLowerCase()}`}
    onclick={ontoggle}
  >
    <span class="mark">{#if completed}<Icon name="check" size="1.25rem" />{/if}</span>
  </button>
  <span class="vh" role="status">{status}</span>
</li>

<style>
  .row {
    display: grid;
    grid-template-columns: var(--set-cols);
    grid-template-areas: var(--set-areas);
    align-items: center;
    gap: var(--space-1);
    min-block-size: var(--tap-min);
    padding-block: var(--space-1);
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
  }
  .row.completed { background: var(--color-success-subtle); }

  .label { grid-area: label; }
  .previous { grid-area: prev; }
  .weight { grid-area: weight; min-inline-size: 0; }
  .reps { grid-area: reps; min-inline-size: 0; }
  .done { grid-area: done; }

  .label,
  .done {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--tap-min);
    min-block-size: var(--tap-min);
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .label {
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }
  .label:active { background: var(--color-surface-3); }
  .label:focus-visible,
  .done:focus-visible { outline: var(--focus-w) solid var(--color-focus); outline-offset: var(--focus-offset); }
  @media (hover: hover) {
    .label:hover { background: var(--color-surface-2); }
  }

  .previous {
    min-inline-size: 0;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-muted);
    overflow-wrap: anywhere;
  }

  /* Set-row field size (design.md §6.5): tighter padding and radius than a standalone field. */
  .weight :global(.box),
  .reps :global(.box) { padding-inline: var(--space-2); border-radius: var(--radius-sm); }

  /* Ring when open, filled check when completed: a shape change, not color alone. */
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border: 2px solid var(--color-border-strong);
    border-radius: var(--radius-full);
    background: var(--color-surface-2);
    color: var(--color-on-success);
  }
  .completed .mark {
    border-color: var(--color-success);
    background: var(--color-success);
    animation: pop var(--duration-fast) var(--ease-enter);
  }
  @keyframes pop {
    from { transform: scale(0.8); }
  }
  @media (prefers-reduced-motion: reduce) {
    .completed .mark { animation: none; }
  }
  @media (forced-colors: active) {
    .mark { border-color: ButtonText; }
    .completed .mark { background: Highlight; border-color: Highlight; color: HighlightText; }
  }

  .vh { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
