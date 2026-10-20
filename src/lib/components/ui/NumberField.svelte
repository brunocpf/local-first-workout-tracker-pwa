<script lang="ts">
  import { formatNumber, parseNumberInput } from "#lib/numberInput";
  import Icon from "./Icon.svelte";

  let {
    label,
    labelVisible = true,
    value = $bindable(null),
    mode = "decimal",
    placeholder,
    suffix,
    min = 0,
    max,
    enterkeyhint = "done",
    hint,
    error,
    disabled = false,
    onchange,
    oninvalid,
  }: {
    label: string;
    labelVisible?: boolean;
    value: number | null;
    mode?: "decimal" | "integer";
    placeholder?: string;
    suffix?: string;
    min?: number;
    max?: number;
    enterkeyhint?: "next" | "done";
    hint?: string;
    error?: string;
    disabled?: boolean;
    onchange?: (n: number | null) => void;
    /** Set rows have no room for a message: when given, a rejected entry reverts to the last valid value and calls this instead. */
    oninvalid?: (message: string) => void;
  } = $props();

  const uid = $props.id();
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const suffixId = `${uid}-suffix`;

  // The raw string is kept while focused (and after a rejected entry) so the caret never jumps.
  let raw = $state<string | null>(null);
  let localError = $state<string | undefined>();

  const shown = $derived(raw ?? formatNumber(value));
  const message = $derived(localError ?? error);
  const describedBy = $derived(
    [hint ? hintId : null, suffix ? suffixId : null, message ? errorId : null].filter(Boolean).join(" ") || undefined,
  );

  function reject(message: string) {
    if (oninvalid) {
      raw = null;
      oninvalid(message);
    } else localError = message;
  }

  function commit() {
    if (raw === null) return;
    const result = parseNumberInput(raw, mode);
    if (!result.ok) return reject(mode === "integer" ? "Enter a whole number" : "Enter a number");
    const n = result.value;
    if (n !== null && n < min) return reject(`Enter ${min} or more`);
    if (n !== null && max !== undefined && n > max) return reject(`Enter ${max} or less`);
    localError = undefined;
    raw = null;
    if (n !== value) {
      value = n;
      onchange?.(n);
    }
  }
</script>

<div class="field" class:invalid={!!message}>
  <label for={inputId} class:visually-hidden={!labelVisible}>{label}</label>
  {#if hint}<p class="hint" id={hintId}>{hint}</p>{/if}
  <div class="box">
    <input
      id={inputId}
      class="tabular"
      type="text"
      inputmode={mode === "integer" ? "numeric" : "decimal"}
      {enterkeyhint}
      autocomplete="off"
      spellcheck="false"
      {placeholder}
      {disabled}
      value={shown}
      aria-invalid={message ? "true" : undefined}
      aria-describedby={describedBy}
      onfocus={(e) => {
        e.currentTarget.select();
      }}
      oninput={(e) => {
        raw = e.currentTarget.value;
        localError = undefined;
      }}
      onchange={commit}
      onblur={() => {
        commit();
      }}
    />
    {#if suffix}<span class="suffix" id={suffixId}>{suffix}</span>{/if}
  </div>
  {#if message}
    <p class="error" id={errorId}><Icon name="alert-triangle" size="1.25em" /><span>{message}</span></p>
  {/if}
</div>

<style>
  .field { display: grid; gap: var(--space-1); }
  label { font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); }
  .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  .hint { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-text-muted); }
  .box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--control-h);
    padding-inline: var(--space-3);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
  }
  .box:has(input:focus-visible) { border-color: var(--color-accent); outline: var(--focus-w) solid var(--color-focus); outline-offset: var(--focus-offset); }
  .box:has(input:user-invalid), .invalid .box { border-color: var(--color-danger); }
  .box:has(input:disabled) { border-color: var(--color-border); }
  input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: calc(var(--control-h) - 2 * var(--border-w));
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: max(1rem, 16px);
    text-align: end;
  }
  input:focus-visible { outline: none; }
  input::placeholder { color: var(--color-text-muted); }
  input:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
  .suffix { font-size: var(--text-sm); color: var(--color-text-muted); }
  .error { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-danger-text); }
  @media (forced-colors: active) { .box { border-color: ButtonText; } }
</style>
