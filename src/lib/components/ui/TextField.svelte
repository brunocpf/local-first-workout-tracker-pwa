<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    label,
    value = $bindable(""),
    type = "text",
    hint,
    error,
    required = false,
    multiline = false,
    mono = false,
    autocomplete,
    enterkeyhint,
    placeholder,
    disabled = false,
    readonly = false,
  }: {
    label: string;
    value: string;
    type?: "text" | "search" | "url";
    hint?: string;
    error?: string;
    required?: boolean;
    multiline?: boolean;
    mono?: boolean;
    autocomplete?: string;
    enterkeyhint?: "done" | "next" | "search" | "go";
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
  } = $props();

  const uid = $props.id();
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  // :user-invalid errors are styled in CSS; the message text only exists for the `error` prop.
  const describedBy = $derived([hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined);
</script>

<div class="field" class:invalid={!!error}>
  <label for={inputId}>{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}</label>
  {#if hint}<p class="hint" id={hintId}>{hint}</p>{/if}
  {#if multiline}
    <textarea
      id={inputId}
      class:mono
      bind:value
      {required}
      {placeholder}
      {disabled}
      {readonly}
      autocomplete={autocomplete as never}
      enterkeyhint={enterkeyhint}
      rows="6"
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
    ></textarea>
  {:else}
    <input
      id={inputId}
      class:mono
      {type}
      bind:value
      {required}
      {placeholder}
      {disabled}
      {readonly}
      autocomplete={autocomplete as never}
      enterkeyhint={enterkeyhint}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
    />
  {/if}
  {#if error}
    <p class="error" id={errorId}><Icon name="alert-triangle" size="1.25em" /><span>{error}</span></p>
  {/if}
</div>

<style>
  .field { display: grid; gap: var(--space-1); }
  label { font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); }
  .hint { font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-text-muted); }
  input, textarea {
    inline-size: 100%;
    min-block-size: var(--control-h);
    padding: var(--space-2) var(--space-3);
    border: var(--border-w) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    color: var(--color-text);
    font: inherit;
    font-size: max(1rem, 16px);
    line-height: var(--leading-md);
  }
  textarea { min-block-size: 6lh; resize: vertical; field-sizing: content; }
  .mono { font-family: var(--font-mono); }
  input::placeholder, textarea::placeholder { color: var(--color-text-muted); }
  input:focus-visible, textarea:focus-visible { border-color: var(--color-accent); }
  input:user-invalid, textarea:user-invalid, .invalid input, .invalid textarea { border-color: var(--color-danger); }
  input:disabled, textarea:disabled { color: var(--color-text-disabled); border-color: var(--color-border); cursor: not-allowed; }
  .error { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--color-danger-text); }
  .error :global(svg) { margin-block-start: 0.1em; }
  @media (forced-colors: active) { input, textarea { border-color: ButtonText; } }
</style>
